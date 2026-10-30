const STORAGE_KEY = "contadorCUP.pro.v1";

const MAX_AMOUNT = 999999999999.99;
const DECIMAL_PLACES = 2;

function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeAmount(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
        throw new Error("El importe debe ser mayor que cero y válido.");
    }

    return roundMoney(amount);
}

function readState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (!saved) {
            return {
                movements: [],
                opening: 0,
                settings: {}
            };
        }

        const parsed = JSON.parse(saved);

        return {
            movements: Array.isArray(parsed.movements)
                ? parsed.movements
                : [],
            opening: Number(parsed.opening) || 0,
            settings: parsed.settings && typeof parsed.settings === "object"
                ? parsed.settings
                : {}
        };
    } catch (error) {
        console.error("Error leyendo los movimientos:", error);

        return {
            movements: [],
            opening: 0,
            settings: {}
        };
    }
}

function saveState(state) {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(state)
        );

        window.dispatchEvent(
            new CustomEvent("cash:updated", {
                detail: {
                    movements: state.movements.length,
                    opening: state.opening
                }
            })
        );

        return true;
    } catch (error) {
        console.error("Error guardando los movimientos:", error);

        throw new Error("No se pudieron guardar los movimientos.");
    }
}

function generateMovementId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return (
        Date.now().toString(36) +
        Math.random().toString(36).slice(2)
    );
}

function normalizeMovementType(type) {
    const normalized = String(type || "").trim().toLowerCase();

    if (normalized !== "in" && normalized !== "out") {
        throw new Error("Tipo de movimiento no válido.");
    }

    return normalized;
}

function normalizeReason(reason) {
    return String(reason || "").trim().slice(0, 500);
}

function validateMovementData(data) {
    if (!data || typeof data !== "object") {
        throw new Error("Los datos del movimiento no son válidos.");
    }

    return {
        amount: normalizeAmount(data.amount),
        type: normalizeMovementType(data.type),
        reason: normalizeReason(data.reason)
    };
}

/**
 * Añade un movimiento de efectivo.
 *
 * data:
 * {
 *   amount: Number,
 *   type: "in" | "out",
 *   reason: String
 * }
 */
export function addCashMovement(data) {
    const validated = validateMovementData(data);
    const state = readState();

    const movement = {
        id: generateMovementId(),
        at: new Date().toISOString(),
        amount: validated.amount,
        type: validated.type,
        reason: validated.reason
    };

    state.movements.push(movement);

    saveState(state);

    return movement;
}

/**
 * Actualiza un movimiento existente.
 */
export function updateCashMovement(id, updates) {
    if (!id || !updates || typeof updates !== "object") {
        throw new Error("Datos de actualización no válidos.");
    }

    const state = readState();

    const index = state.movements.findIndex(
        movement => movement.id === id
    );

    if (index === -1) {
        throw new Error("No se encontró el movimiento.");
    }

    const current = state.movements[index];

    const updated = {
        ...current,
        amount: updates.amount !== undefined
            ? normalizeAmount(updates.amount)
            : current.amount,

        type: updates.type !== undefined
            ? normalizeMovementType(updates.type)
            : current.type,

        reason: updates.reason !== undefined
            ? normalizeReason(updates.reason)
            : current.reason
    };

    state.movements[index] = updated;

    saveState(state);

    return updated;
}

/**
 * Elimina un movimiento.
 */
export function deleteCashMovement(id) {
    if (!id) {
        throw new Error("Identificador no válido.");
    }

    const state = readState();

    const index = state.movements.findIndex(
        movement => movement.id === id
    );

    if (index === -1) {
        throw new Error("No se encontró el movimiento.");
    }

    const deleted = state.movements.splice(index, 1)[0];

    saveState(state);

    return deleted;
}

/**
 * Establece el saldo inicial de caja.
 */
export function setOpeningBalance(amount) {
    const value = Number(amount);

    if (
        !Number.isFinite(value) ||
        value < 0 ||
        value > MAX_AMOUNT
    ) {
        throw new Error("El saldo inicial no es válido.");
    }

    const state = readState();

    state.opening = roundMoney(value);

    saveState(state);

    return state.opening;
}

/**
 * Obtiene el saldo inicial.
 */
export function getOpeningBalance() {
    return readState().opening;
}

/**
 * Devuelve todos los movimientos.
 */
export function listCashMovements(options = {}) {
    const state = readState();

    let movements = [...state.movements];

    if (options.type) {
        const type = normalizeMovementType(options.type);

        movements = movements.filter(
            movement => movement.type === type
        );
    }

    if (options.search) {
        const search = String(options.search).toLowerCase();

        movements = movements.filter(movement =>
            String(movement.reason || "")
                .toLowerCase()
                .includes(search)
        );
    }

    movements.sort((a, b) =>
        new Date(b.at).getTime() - new Date(a.at).getTime()
    );

    if (Number.isInteger(options.limit) && options.limit >= 0) {
        movements = movements.slice(0, options.limit);
    }

    return movements;
}

/**
 * Calcula el resumen financiero de caja.
 */
export function getCashSummary() {
    const state = readState();

    let income = 0;
    let expenses = 0;

    for (const movement of state.movements) {
        const amount = Number(movement.amount) || 0;

        if (movement.type === "in") {
            income += amount;
        } else if (movement.type === "out") {
            expenses += amount;
        }
    }

    income = roundMoney(income);
    expenses = roundMoney(expenses);

    const opening = roundMoney(state.opening);

    return {
        opening,
        income,
        expenses,
        totalIn: income,
        totalOut: expenses,
        balance: roundMoney(opening + income - expenses),
        movementCount: state.movements.length
    };
}

/**
 * Elimina todos los movimientos.
 */
export function clearCashMovements() {
    const state = readState();

    state.movements = [];

    saveState(state);

    return true;
}

/**
 * Obtiene un movimiento por identificador.
 */
export function getCashMovement(id) {
    if (!id) {
        return null;
    }

    const state = readState();

    return state.movements.find(
        movement => movement.id === id
    ) || null;
}

/**
 * Obtiene estadísticas por tipo de movimiento.
 */
export function getCashMovementStatistics() {
    const state = readState();

    const statistics = {
        total: state.movements.length,
        incomeCount: 0,
        expenseCount: 0,
        income: 0,
        expenses: 0
    };

    for (const movement of state.movements) {
        if (movement.type === "in") {
            statistics.incomeCount++;
            statistics.income += Number(movement.amount) || 0;
        }

        if (movement.type === "out") {
            statistics.expenseCount++;
            statistics.expenses += Number(movement.amount) || 0;
        }
    }

    statistics.income = roundMoney(statistics.income);
    statistics.expenses = roundMoney(statistics.expenses);

    return statistics;
}