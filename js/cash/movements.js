
// js/cash/movements.js

import { getState, setState } from "../state.js";
import { readStorage, writeStorage } from "../storage.js";

const STORAGE_KEY = "cashMovements";
const LEGACY_STORAGE_KEY = "contadorCUP.pro.v1";

const MAX_AMOUNT = 999999999999.99;

function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeAmount(value, allowZero = false) {
    const amount = Number(value);

    if (
        !Number.isFinite(amount) ||
        amount < 0 ||
        (!allowZero && amount === 0) ||
        amount > MAX_AMOUNT
    ) {
        throw new Error("El importe debe ser válido y no superar el límite permitido.");
    }

    return roundMoney(amount);
}

function getValidOpeningBalance(...values) {
    for (const value of values) {
        if (value === undefined || value === null || value === "") {
            continue;
        }

        const amount = Number(value);

        if (
            Number.isFinite(amount) &&
            amount >= 0 &&
            amount <= MAX_AMOUNT
        ) {
            return roundMoney(amount);
        }
    }

    return 0;
}

function generateMovementId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `cash-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeMovementType(type) {
    const normalized = String(type || "").trim().toLowerCase();

    const aliases = {
        in: "income",
        out: "expense",
        income: "income",
        expense: "expense",
        adjustment: "adjustment"
    };

    const result = aliases[normalized];

    if (!result) {
        throw new Error("Tipo de movimiento no válido.");
    }

    return result;
}

function normalizeText(value, maximumLength) {
    return String(value ?? "").trim().slice(0, maximumLength);
}

function normalizeMovement(data, existing = {}) {
    if (!data || typeof data !== "object") {
        throw new Error("Los datos del movimiento no son válidos.");
    }

    const amount = data.amount !== undefined
        ? normalizeAmount(data.amount)
        : normalizeAmount(existing.amount);

    const type = data.type !== undefined
        ? normalizeMovementType(data.type)
        : normalizeMovementType(existing.type);

    const description = normalizeText(
        data.description ?? data.reason ?? existing.description ?? existing.reason,
        160
    );

    if (!description) {
        throw new Error("Escribe una descripción para el movimiento.");
    }

    return {
        id: existing.id || data.id || generateMovementId(),
        type,
        amount,
        description,
        reference: normalizeText(
            data.reference ?? existing.reference,
            120
        ),
        notes: normalizeText(
            data.notes ?? existing.notes,
            500
        ),
        createdAt:
            existing.createdAt ||
            existing.at ||
            data.createdAt ||
            new Date().toISOString()
    };
}

function normalizeMovementList(movements) {
    if (!Array.isArray(movements)) {
        return [];
    }

    return movements
        .filter(item => item && typeof item === "object")
        .map(item => {
            try {
                const legacyDescription =
                    item.description ||
                    item.reason ||
                    item.reference ||
                    "Movimiento de caja";

                return normalizeMovement({
                    ...item,
                    description: legacyDescription
                }, {
                    ...item,
                    description: legacyDescription
                });
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

function getCashState() {
    const state = getState();
    const cash = state.cash || {};

    return {
        openingBalance: normalizeAmount(
            cash.openingBalance ?? 0,
            true
        ),
        movements: normalizeMovementList(cash.movements)
    };
}

function persistCashState(cash) {
    const normalized = {
        openingBalance: normalizeAmount(
            cash.openingBalance ?? 0,
            true
        ),
        movements: normalizeMovementList(cash.movements)
    };

    setState("cash.openingBalance", normalized.openingBalance);
    setState("cash.movements", normalized.movements);

    const currentBalance = calculateBalance(
        normalized.openingBalance,
        normalized.movements
    );

    setState("cash.currentBalance", currentBalance);

    writeStorage(STORAGE_KEY, {
        openingBalance: normalized.openingBalance,
        movements: normalized.movements
    });

    globalThis.dispatchEvent?.(
        new CustomEvent("cash:updated", {
            detail: {
                movements: normalized.movements.length,
                openingBalance: normalized.openingBalance,
                currentBalance
            }
        })
    );

    return normalized;
}

function getMovementEffect(movement) {
    const amount = normalizeAmount(movement.amount);

    switch (movement.type) {
        case "income":
            return amount;

        case "expense":
            return -amount;

        case "adjustment":
            return amount;

        default:
            return 0;
    }
}

function calculateBalance(openingBalance, movements) {
    const cents = Math.round(openingBalance * 100);

    const totalCents = movements.reduce(
        (total, movement) => {
            return total + Math.round(
                getMovementEffect(movement) * 100
            );
        },
        cents
    );

    if (!Number.isSafeInteger(totalCents)) {
        throw new Error("El saldo de caja supera el límite numérico permitido.");
    }

    return roundMoney(totalCents / 100);
}

function readLegacyState() {
    try {
        const raw = globalThis.localStorage?.getItem(LEGACY_STORAGE_KEY);

        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);

        if (!parsed || typeof parsed !== "object") {
            return null;
        }

        return {
            openingBalance: getValidOpeningBalance(
                parsed.opening,
                parsed.openingBalance
            ),
            movements: normalizeMovementList(parsed.movements)
        };
    } catch {
        return null;
    }
}

/**
 * Carga los movimientos desde el almacenamiento general.
 * Admite el formato nuevo y los respaldos antiguos en forma de array.
 */
export function loadCashMovementsIntoState() {
    const saved = readStorage(STORAGE_KEY, null);
    const currentCash = getState().cash || {};
    const settings = readStorage("settings", {});

    let openingBalance = 0;
    let movements = [];

    if (Array.isArray(saved)) {
        // Formato antiguo: cashMovements era directamente una lista.
        movements = normalizeMovementList(saved);

        openingBalance = getValidOpeningBalance(
            settings?.openingBalance,
            currentCash.openingBalance
        );
    } else if (
        saved &&
        typeof saved === "object" &&
        Array.isArray(saved.movements)
    ) {
        // Formato nuevo: objeto con saldo inicial y movimientos.
        movements = normalizeMovementList(saved.movements);

        openingBalance = getValidOpeningBalance(
            saved.openingBalance,
            saved.opening,
            settings?.openingBalance,
            currentCash.openingBalance
        );
    } else {
        const legacy = readLegacyState();

        if (legacy) {
            openingBalance = getValidOpeningBalance(
                legacy.openingBalance,
                settings?.openingBalance,
                currentCash.openingBalance
            );

            movements = legacy.movements;
        } else {
            openingBalance = getValidOpeningBalance(
                settings?.openingBalance,
                currentCash.openingBalance
            );

            movements = normalizeMovementList(
                currentCash.movements
            );
        }
    }

    const cash = persistCashState({
        openingBalance,
        movements
    });

    return {
        openingBalance: cash.openingBalance,
        movementCount: cash.movements.length
    };
}

/**
 * Registra una entrada, salida o ajuste.
 *
 * data:
 * {
 *   type: "income" | "expense" | "adjustment",
 *   amount: Number,
 *   description: String,
 *   reference: String,
 *   notes: String
 * }
 */
export function addCashMovement(data) {
    const movement = normalizeMovement(data);
    const cash = getCashState();

    cash.movements.push(movement);

    persistCashState(cash);

    return { ...movement };
}

/**
 * Actualiza un movimiento existente.
 */
export function updateCashMovement(id, updates) {
    if (!id || !updates || typeof updates !== "object") {
        throw new Error("Datos de actualización no válidos.");
    }

    const cash = getCashState();

    const index = cash.movements.findIndex(
        movement => movement.id === id
    );

    if (index === -1) {
        throw new Error("No se encontró el movimiento.");
    }

    const current = cash.movements[index];

    const updated = normalizeMovement(
        {
            ...current,
            ...updates
        },
        current
    );

    cash.movements[index] = updated;

    persistCashState(cash);

    return { ...updated };
}

/**
 * Elimina un movimiento.
 */
export function deleteCashMovement(id) {
    if (!id) {
        throw new Error("Identificador no válido.");
    }

    const cash = getCashState();

    const index = cash.movements.findIndex(
        movement => movement.id === id
    );

    if (index === -1) {
        throw new Error("No se encontró el movimiento.");
    }

    const deleted = cash.movements.splice(index, 1)[0];

    persistCashState(cash);

    return { ...deleted };
}

/**
 * Establece el saldo inicial de caja.
 */
export function setOpeningBalance(amount) {
    const cash = getCashState();

    cash.openingBalance = normalizeAmount(amount, true);

    persistCashState(cash);

    return cash.openingBalance;
}

/**
 * Obtiene el saldo inicial.
 */
export function getOpeningBalance() {
    return getCashState().openingBalance;
}

/**
 * Devuelve los movimientos registrados.
 */
export function listCashMovements(options = {}) {
    const cash = getCashState();

    let movements = [...cash.movements];

    if (options.type) {
        const type = normalizeMovementType(options.type);

        movements = movements.filter(
            movement => movement.type === type
        );
    }

    if (options.search) {
        const search = String(options.search).trim().toLowerCase();

        movements = movements.filter(movement => {
            const content = [
                movement.description,
                movement.reference,
                movement.notes
            ].join(" ").toLowerCase();

            return content.includes(search);
        });
    }

    movements.sort((a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    );

    if (
        Number.isInteger(options.limit) &&
        options.limit >= 0
    ) {
        movements = movements.slice(0, options.limit);
    }

    return movements.map(movement => ({ ...movement }));
}

/**
 * Calcula el resumen financiero de caja.
 */
export function getCashSummary() {
    const cash = getCashState();

    let income = 0;
    let expenses = 0;
    let adjustments = 0;

    for (const movement of cash.movements) {
        const amount = normalizeAmount(movement.amount);

        switch (movement.type) {
            case "income":
                income += amount;
                break;

            case "expense":
                expenses += amount;
                break;

            case "adjustment":
                adjustments += amount;
                break;
        }
    }

    income = roundMoney(income);
    expenses = roundMoney(expenses);
    adjustments = roundMoney(adjustments);

    const currentBalance = calculateBalance(
        cash.openingBalance,
        cash.movements
    );

    return {
        openingBalance: cash.openingBalance,
        opening: cash.openingBalance,
        income,
        expenses,
        adjustments,
        totalIn: income,
        totalOut: expenses,
        netMovement: roundMoney(
            income - expenses + adjustments
        ),
        currentBalance,
        balance: currentBalance,
        movementCount: cash.movements.length
    };
}

/**
 * Elimina todos los movimientos sin modificar el saldo inicial.
 */
export function clearCashMovements() {
    const cash = getCashState();

    cash.movements = [];

    persistCashState(cash);

    return true;
}

/**
 * Obtiene un movimiento por identificador.
 */
export function getCashMovement(id) {
    if (!id) {
        return null;
    }

    const movement = getCashState().movements.find(
        item => item.id === id
    );

    return movement ? { ...movement } : null;
}

/**
 * Obtiene estadísticas por tipo de movimiento.
 */
export function getCashMovementStatistics() {
    const movements = getCashState().movements;

    const statistics = {
        total: movements.length,
        incomeCount: 0,
        expenseCount: 0,
        adjustmentCount: 0,
        income: 0,
        expenses: 0,
        adjustments: 0
    };

    for (const movement of movements) {
        const amount = normalizeAmount(movement.amount);

        switch (movement.type) {
            case "income":
                statistics.incomeCount++;
                statistics.income += amount;
                break;

            case "expense":
                statistics.expenseCount++;
                statistics.expenses += amount;
                break;

            case "adjustment":
                statistics.adjustmentCount++;
                statistics.adjustments += amount;
                break;
        }
    }

    statistics.income = roundMoney(statistics.income);
    statistics.expenses = roundMoney(statistics.expenses);
    statistics.adjustments = roundMoney(statistics.adjustments);

    return statistics;
}
