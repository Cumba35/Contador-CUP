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

    if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new Error("El importe debe ser un entero positivo.");
    }

    return amount;
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

function calculateMovementEffect(movement) {
    const amount = Number(movement.amount) || 0;

    switch (movement.type) {
        case MOVEMENT_TYPES.INCOME:
            return amount;
        case MOVEMENT_TYPES.EXPENSE:
            return -amount;
        case MOVEMENT_TYPES.ADJUSTMENT:
            return amount;
        default:
            return 0;
    }
}

function recalculateBalance(movements = getMovements()) {
    const openingBalance = Number(getState().cash.openingBalance) || 0;

    const balance = movements.reduce(
        (total, movement) => total + calculateMovementEffect(movement),
        openingBalance
    );

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

    const movement = {
        id: generateId("movement"),
        type,
        amount: validateAmount(data.amount),
        description: validateText(data.description, "La descripción"),
        reference: String(data.reference ?? "").trim().slice(0, 100),
        notes: String(data.notes ?? "").trim().slice(0, 1000),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
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
        throw new Error("El saldo inicial debe ser un entero igual o mayor que cero.");
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

    const income = movements
        .filter(item => item.type === MOVEMENT_TYPES.INCOME)
        .reduce((sum, item) => sum + Number(item.amount), 0);

    const expenses = movements
        .filter(item => item.type === MOVEMENT_TYPES.EXPENSE)
        .reduce((sum, item) => sum + Number(item.amount), 0);

    const adjustments = movements
        .filter(item => item.type === MOVEMENT_TYPES.ADJUSTMENT)
        .reduce((sum, item) => sum + Number(item.amount), 0);

    return {
        openingBalance: Number(getState().cash.openingBalance) || 0,
        income,
        expenses,
        adjustments,
        currentBalance: recalculateBalance(),
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