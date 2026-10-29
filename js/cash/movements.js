
 // js/cash/movements.js

import { getState, setState } from "../state.js";
import { readStorage, writeStorage } from "../storage.js";
import { generateId } from "../utils.js";

const STORAGE_KEY = "cashMovements";

const MOVEMENT_TYPES = Object.freeze({
    INCOME: "income",
    EXPENSE: "expense",
    OPENING: "opening",
    ADJUSTMENT: "adjustment"
});

function validateAmount(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("El importe debe ser un número positivo.");
    }

    const cents = Math.round(amount * 100);

    if (
        !Number.isSafeInteger(cents) ||
        Math.abs(amount * 100 - cents) > 1e-7
    ) {
        throw new Error("El importe debe tener como máximo dos decimales.");
    }

    return cents / 100;
}

function toCents(value) {
    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount)) {
        return 0;
    }

    const cents = Math.round(amount * 100);
    return Number.isSafeInteger(cents) ? cents : 0;
}

function fromCents(cents) {
    return cents / 100;
}

function validateText(value, field, maximum = 200) {
    const text = String(value ?? "").trim();

    if (!text) {
        throw new Error(`${field} es obligatorio.`);
    }

    if (text.length > maximum) {
        throw new Error(`${field} no puede superar los ${maximum} caracteres.`);
    }

    return text;
}

function getMovements() {
    const movements = readStorage(STORAGE_KEY, []);
    return Array.isArray(movements) ? movements : [];
}

function saveMovements(movements) {
    writeStorage(STORAGE_KEY, movements);
    setState("cash.movements", movements);
    recalculateBalance(movements);

    return movements;
}

function calculateMovementEffectCents(movement) {
    const cents = toCents(movement.amount);

    switch (movement.type) {
        case MOVEMENT_TYPES.INCOME:
        case MOVEMENT_TYPES.ADJUSTMENT:
            return cents;
        case MOVEMENT_TYPES.EXPENSE:
            return -cents;
        default:
            return 0;
    }
}

function recalculateBalance(movements = getMovements()) {
    const openingBalanceCents = toCents(getState().cash.openingBalance);

    const balanceCents = movements.reduce(
        (total, movement) => total + calculateMovementEffectCents(movement),
        openingBalanceCents
    );

    if (!Number.isSafeInteger(balanceCents)) {
        throw new Error("El saldo de caja supera el límite numérico permitido.");
    }

    const balance = fromCents(balanceCents);
    setState("cash.currentBalance", balance);

    return balance;
}

export function listCashMovements() {
    return getMovements()
        .map(movement => structuredClone(movement))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getCashMovementById(id) {
    const movement = getMovements().find(item => item.id === id);
    return movement ? structuredClone(movement) : null;
}

export function addCashMovement(data = {}) {
    const allowedTypes = Object.values(MOVEMENT_TYPES);
    const type = String(data.type ?? "");

    if (!allowedTypes.includes(type) || type === MOVEMENT_TYPES.OPENING) {
        throw new Error("Selecciona un tipo de movimiento válido.");
    }

    const now = new Date().toISOString();

    const movement = {
        id: generateId("movement"),
        type,
        amount: validateAmount(data.amount),
        description: validateText(data.description, "La descripción"),
        reference: String(data.reference ?? "").trim().slice(0, 100),
        notes: String(data.notes ?? "").trim().slice(0, 1000),
        createdAt: now,
        updatedAt: now
    };

    saveMovements([...getMovements(), movement]);

    return structuredClone(movement);
}

export function updateCashMovement(id, changes = {}) {
    const movements = getMovements();
    const existing = movements.find(item => item.id === id);

    if (!existing) {
        throw new Error("No se encontró el movimiento de caja.");
    }

    const updated = { ...existing };

    if (changes.type !== undefined) {
        const type = String(changes.type);

        if (
            !Object.values(MOVEMENT_TYPES).includes(type) ||
            type === MOVEMENT_TYPES.OPENING
        ) {
            throw new Error("El tipo de movimiento no es válido.");
        }

        updated.type = type;
    }

    if (changes.amount !== undefined) {
        updated.amount = validateAmount(changes.amount);
    }

    if (changes.description !== undefined) {
        updated.description = validateText(
            changes.description,
            "La descripción"
        );
    }

    if (changes.reference !== undefined) {
        updated.reference = String(changes.reference ?? "").trim().slice(0, 100);
    }

    if (changes.notes !== undefined) {
        updated.notes = String(changes.notes ?? "").trim().slice(0, 1000);
    }

    updated.updatedAt = new Date().toISOString();

    saveMovements(
        movements.map(item => item.id === id ? updated : item)
    );

    return structuredClone(updated);
}

export function deleteCashMovement(id) {
    const movements = getMovements();
    const exists = movements.some(item => item.id === id);

    if (!exists) {
        return false;
    }

    saveMovements(movements.filter(item => item.id !== id));

    return true;
}

export function setOpeningBalance(value) {
    const amount = Number(value);

    if (!Number.isSafeInteger(amount) || amount < 0) {
        throw new Error(
            "El saldo inicial debe ser un entero igual o mayor que cero."
        );
    }

    setState("cash.openingBalance", amount);
    recalculateBalance();

    return amount;
}

export function getCashBalance() {
    return recalculateBalance();
}

export function getCashSummary() {
    const movements = getMovements();

    const totals = {
        income: 0,
        expenses: 0,
        adjustments: 0
    };

    for (const movement of movements) {
        const cents = toCents(movement.amount);

        switch (movement.type) {
            case MOVEMENT_TYPES.INCOME:
                totals.income += cents;
                break;
            case MOVEMENT_TYPES.EXPENSE:
                totals.expenses += cents;
                break;
            case MOVEMENT_TYPES.ADJUSTMENT:
                totals.adjustments += cents;
                break;
            default:
                break;
        }
    }

    return {
        openingBalance: Number(getState().cash.openingBalance) || 0,
        income: fromCents(totals.income),
        expenses: fromCents(totals.expenses),
        adjustments: fromCents(totals.adjustments),
        currentBalance: recalculateBalance(movements),
        movementCount: movements.length
    };
}

export function loadCashMovementsIntoState() {
    const movements = getMovements();

    setState("cash.movements", movements);
    recalculateBalance(movements);

    return movements.length;
}

export { MOVEMENT_TYPES };
