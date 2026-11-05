
// js/cash/movements.js

import { getState, setState } from "../state.js";
import { readStorage, writeStorage } from "../storage.js";

const STORAGE_KEY = "cashMovements";
const LEGACY_STORAGE_KEY = "contadorCUP.pro.v1";

const MAX_AMOUNT = 999999999999.99;
const MAX_CENTS = Math.round(MAX_AMOUNT * 100);

function toCents(value, allowZero = true) {
    const amount = Number(value);

    if (
        !Number.isFinite(amount) ||
        amount < 0 ||
        (!allowZero && amount === 0) ||
        amount > MAX_AMOUNT
    ) {
        throw new Error(
            "El importe debe ser válido y no superar el límite permitido."
        );
    }

    const cents = Math.round(
        (amount + Number.EPSILON) * 100
    );

    if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) {
        throw new Error("El importe supera el límite numérico permitido.");
    }

    return cents;
}

function fromCents(cents) {
    if (!Number.isSafeInteger(cents)) {
        throw new Error(
            "El saldo de caja supera el límite numérico permitido."
        );
    }

    return cents / 100;
}

function normalizeAmount(value, allowZero = false) {
    return fromCents(toCents(value, allowZero));
}

function getValidOpeningBalance(...values) {
    for (const value of values) {
        if (
            value === undefined ||
            value === null ||
            value === ""
        ) {
            continue;
        }

        try {
            return normalizeAmount(value, true);
        } catch {
            continue;
        }
    }

    return 0;
}

function generateMovementId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return [
        "cash",
        Date.now().toString(36),
        Math.random().toString(36).slice(2)
    ].join("-");
}

function normalizeMovementType(type) {
    const normalized = String(type ?? "")
        .trim()
        .toLowerCase();

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
    return String(value ?? "")
        .trim()
        .slice(0, maximumLength);
}

function normalizeDate(value) {
    if (value === undefined || value === null || value === "") {
        return new Date().toISOString();
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error(
            "La fecha del movimiento no es válida."
        );
    }

    return date.toISOString();
}

function normalizeMovement(data, existing = {}) {
    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {
        throw new Error("Los datos del movimiento no son válidos.");
    }

    const amount = data.amount !== undefined
        ? normalizeAmount(data.amount)
        : normalizeAmount(existing.amount);

    const type = data.type !== undefined
        ? normalizeMovementType(data.type)
        : normalizeMovementType(existing.type);

    const description = normalizeText(
        data.description ??
        data.reason ??
        existing.description ??
        existing.reason,
        160
    );

    if (!description) {
        throw new Error(
            "Escribe una descripción para el movimiento."
        );
    }

    const id = String(
        existing.id ?? data.id ?? generateMovementId()
    ).trim();

    if (!id || id.length > 200) {
        throw new Error(
            "El identificador del movimiento no es válido."
        );
    }

    return {
        id,
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

        createdAt: normalizeDate(
            existing.createdAt ??
            existing.at ??
            data.createdAt
        )
    };
}

/**
 * Normaliza todos los movimientos.
 *
 * No descarta registros inválidos:
 * informa su posición y conserva intactos
 * los datos originales almacenados.
 */
function normalizeMovementList(movements) {
    if (!Array.isArray(movements)) {
        throw new Error(
            "La lista de movimientos de caja no es válida."
        );
    }

    const normalized = [];
    const identifiers = new Set();

    movements.forEach((item, index) => {
        let movement;

        try {
            if (
                !item ||
                typeof item !== "object" ||
                Array.isArray(item)
            ) {
                throw new Error("Registro no válido.");
            }

            const description =
                item.description ||
                item.reason ||
                item.reference ||
                "Movimiento de caja";

            movement = normalizeMovement(
                {
                    ...item,
                    description
                },
                {
                    ...item,
                    description
                }
            );

            if (identifiers.has(movement.id)) {
                throw new Error(
                    "El identificador está duplicado."
                );
            }

            identifiers.add(movement.id);
            normalized.push(movement);

        } catch (error) {
            throw new Error(
                `El movimiento ${index + 1} contiene datos inválidos: ${error.message}`
            );
        }
    });

    return normalized;
}

function normalizeCashData(cash) {
    if (
        !cash ||
        typeof cash !== "object" ||
        Array.isArray(cash)
    ) {
        throw new Error(
            "Los datos de caja no tienen un formato válido."
        );
    }

    return {
        openingBalance: normalizeAmount(
            cash.openingBalance ?? 0,
            true
        ),

        movements: normalizeMovementList(
            cash.movements ?? []
        )
    };
}

function getCashState() {
    const cash = getState().cash || {};

    return normalizeCashData({
        openingBalance: cash.openingBalance ?? 0,
        movements: cash.movements ?? []
    });
}

function getMovementEffectCents(movement) {
    const amount = toCents(movement.amount, false);

    switch (movement.type) {
        case "income":
            return amount;

        case "expense":
            return -amount;

        case "adjustment":
            return amount;

        default:
            throw new Error(
                "Se encontró un tipo de movimiento desconocido."
            );
    }
}

function calculateBalanceCents(openingBalance, movements) {
    let totalCents = toCents(openingBalance);

    for (const movement of movements) {
        totalCents += getMovementEffectCents(movement);

        if (
            !Number.isSafeInteger(totalCents) ||
            Math.abs(totalCents) > MAX_CENTS
        ) {
            throw new Error(
                "El saldo de caja supera el límite numérico permitido."
            );
        }
    }

    return totalCents;
}

function calculateBalance(openingBalance, movements) {
    return fromCents(
        calculateBalanceCents(
            openingBalance,
            movements
        )
    );
}

/**
 * Persiste primero los datos.
 *
 * Si falla localStorage, el estado anterior permanece
 * sin modificaciones.
 */
function persistCashState(cash, options = {}) {
    const {
        allowStorageFailure = false
    } = options;

    const normalized = normalizeCashData(cash);

    const currentBalance = calculateBalance(
        normalized.openingBalance,
        normalized.movements
    );

    const payload = {
        openingBalance: normalized.openingBalance,
        movements: normalized.movements
    };

    try {
        writeStorage(STORAGE_KEY, payload);

    } catch (error) {
        if (!allowStorageFailure) {
            throw error;
        }

        console.warn(
            "No se pudieron persistir los datos de caja durante la carga inicial.",
            error
        );

        return {
            ...normalized,
            currentBalance,
            persisted: false
        };
    }

    setState(
        "cash.openingBalance",
        normalized.openingBalance
    );

    setState(
        "cash.movements",
        normalized.movements
    );

    setState(
        "cash.currentBalance",
        currentBalance
    );

    if (typeof globalThis.dispatchEvent === "function") {
        if (typeof globalThis.CustomEvent === "function") {
            globalThis.dispatchEvent(
                new CustomEvent("cash:updated", {
                    detail: {
                        movements: normalized.movements.length,
                        openingBalance: normalized.openingBalance,
                        currentBalance
                    }
                })
            );
        }
    }

    return {
        ...normalized,
        currentBalance,
        persisted: true
    };
}

/**
 * Recupera el formato antiguo almacenado
 * bajo contadorCUP.pro.v1.
 */
function readLegacyState() {
    try {
        const raw = globalThis.localStorage?.getItem(
            LEGACY_STORAGE_KEY
        );

        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);

        if (
            !parsed ||
            typeof parsed !== "object" ||
            Array.isArray(parsed)
        ) {
            throw new Error(
                "El formato antiguo de caja no es válido."
            );
        }

        return normalizeCashData({
            openingBalance: getValidOpeningBalance(
                parsed.opening,
                parsed.openingBalance
            ),

            movements: parsed.movements ?? []
        });

    } catch (error) {
        console.error(
            "No se pudieron recuperar los datos antiguos de caja:",
            error
        );

        return null;
    }
}

/**
 * Carga y normaliza los datos de caja.
 *
 * Los formatos anteriores se conservan compatibles.
 */
export function loadCashMovementsIntoState() {
    const saved = readStorage(
        STORAGE_KEY,
        null
    );

    const currentCash = getState().cash || {};

    const settings = readStorage(
        "settings",
        {}
    );

    let cash;

    if (Array.isArray(saved)) {
        cash = normalizeCashData({
            openingBalance: getValidOpeningBalance(
                settings?.openingBalance,
                currentCash.openingBalance
            ),
            movements: saved
        });

    } else if (
        saved &&
        typeof saved === "object" &&
        Array.isArray(saved.movements)
    ) {
        cash = normalizeCashData({
            openingBalance: getValidOpeningBalance(
                saved.openingBalance,
                saved.opening,
                settings?.openingBalance,
                currentCash.openingBalance
            ),
            movements: saved.movements
        });

    } else if (saved !== null) {
        throw new Error(
            "Los datos guardados de caja están dañados. No se han sobrescrito."
        );

    } else {
        const legacy = readLegacyState();

        if (legacy) {
            cash = normalizeCashData({
                openingBalance: getValidOpeningBalance(
                    legacy.openingBalance,
                    settings?.openingBalance,
                    currentCash.openingBalance
                ),
                movements: legacy.movements
            });

        } else {
            cash = normalizeCashData({
                openingBalance: getValidOpeningBalance(
                    settings?.openingBalance,
                    currentCash.openingBalance
                ),
                movements: currentCash.movements ?? []
            });
        }
    }

    const result = persistCashState(
        cash,
        {
            allowStorageFailure: true
        }
    );

    return {
        openingBalance: result.openingBalance,
        movementCount: result.movements.length,
        persisted: result.persisted
    };
}

/**
 * Registra una entrada, salida o ajuste.
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
    if (
        !id ||
        !updates ||
        typeof updates !== "object" ||
        Array.isArray(updates)
    ) {
        throw new Error(
            "Datos de actualización no válidos."
        );
    }

    const cash = getCashState();

    const index = cash.movements.findIndex(
        movement => movement.id === id
    );

    if (index === -1) {
        throw new Error(
            "No se encontró el movimiento."
        );
    }

    const current = cash.movements[index];

    const updated = normalizeMovement(
        {
            ...current,
            ...updates,
            id: current.id
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
        throw new Error(
            "Identificador no válido."
        );
    }

    const cash = getCashState();

    const index = cash.movements.findIndex(
        movement => movement.id === id
    );

    if (index === -1) {
        throw new Error(
            "No se encontró el movimiento."
        );
    }

    const deleted = cash.movements[index];

    cash.movements.splice(index, 1);

    persistCashState(cash);

    return { ...deleted };
}

/**
 * Establece el saldo inicial.
 */
export function setOpeningBalance(amount) {
    const cash = getCashState();

    cash.openingBalance = normalizeAmount(
        amount,
        true
    );

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
        const type = normalizeMovementType(
            options.type
        );

        movements = movements.filter(
            movement => movement.type === type
        );
    }

    if (options.search) {
        const search = String(options.search)
            .trim()
            .toLowerCase();

        movements = movements.filter(movement => {
            const content = [
                movement.description,
                movement.reference,
                movement.notes
            ].join(" ").toLowerCase();

            return content.includes(search);
        });
    }

    movements.sort((a, b) => {
        return (
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
        );
    });

    if (
        Number.isInteger(options.limit) &&
        options.limit >= 0
    ) {
        movements = movements.slice(
            0,
            options.limit
        );
    }

    return movements.map(
        movement => ({ ...movement })
    );
}

/**
 * Calcula el resumen financiero de caja.
 */
export function getCashSummary() {
    const cash = getCashState();

    let incomeCents = 0;
    let expensesCents = 0;
    let adjustmentsCents = 0;

    for (const movement of cash.movements) {
        const amount = toCents(
            movement.amount,
            false
        );

        switch (movement.type) {
            case "income":
                incomeCents += amount;
                break;

            case "expense":
                expensesCents += amount;
                break;

            case "adjustment":
                adjustmentsCents += amount;
                break;
        }
    }

    const netMovementCents =
        incomeCents -
        expensesCents +
        adjustmentsCents;

    const currentBalanceCents =
        calculateBalanceCents(
            cash.openingBalance,
            cash.movements
        );

    return {
        openingBalance: cash.openingBalance,
        opening: cash.openingBalance,

        income: fromCents(incomeCents),
        expenses: fromCents(expensesCents),
        adjustments: fromCents(adjustmentsCents),

        totalIn: fromCents(incomeCents),
        totalOut: fromCents(expensesCents),

        netMovement: fromCents(netMovementCents),

        currentBalance: fromCents(
            currentBalanceCents
        ),

        balance: fromCents(
            currentBalanceCents
        ),

        movementCount: cash.movements.length
    };
}

/**
 * Elimina todos los movimientos sin modificar
 * el saldo inicial.
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

    return movement
        ? { ...movement }
        : null;
}

/**
 * Obtiene estadísticas por tipo.
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

    let incomeCents = 0;
    let expensesCents = 0;
    let adjustmentsCents = 0;

    for (const movement of movements) {
        const amount = toCents(
            movement.amount,
            false
        );

        switch (movement.type) {
            case "income":
                statistics.incomeCount++;
                incomeCents += amount;
                break;

            case "expense":
                statistics.expenseCount++;
                expensesCents += amount;
                break;

            case "adjustment":
                statistics.adjustmentCount++;
                adjustmentsCents += amount;
                break;
        }
    }

    statistics.income = fromCents(incomeCents);
    statistics.expenses = fromCents(expensesCents);
    statistics.adjustments = fromCents(adjustmentsCents);

    return statistics;
}
