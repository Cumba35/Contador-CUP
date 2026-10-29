// js/counter/calculator.js

import { APP_CONFIG } from "../config.js";
import { getState, setState } from "../state.js";

const MAX_QUANTITY = APP_CONFIG.limits.denominationQuantity;

function validateQuantity(quantity) {
    const value = Number(quantity);

    if (
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > MAX_QUANTITY
    ) {
        throw new Error(
            `La cantidad debe ser un entero entre 0 y ${MAX_QUANTITY}.`
        );
    }

    return value;
}

function getDenomination(id) {
    const denomination = getState().denominations.find(
        item => item.id === id
    );

    if (!denomination) {
        throw new Error("La denominación seleccionada no existe.");
    }

    if (!denomination.enabled) {
        throw new Error("Esta denominación está desactivada.");
    }

    return denomination;
}

function calculateTotal(quantities, denominations) {
    const denominationMap = new Map(
        denominations.map(item => [item.id, item])
    );

    let total = 0;

    for (const [id, quantity] of Object.entries(quantities)) {
        const denomination = denominationMap.get(id);

        if (!denomination) {
            continue;
        }

        const validQuantity = validateQuantity(quantity);
        const subtotal = denomination.value * validQuantity;

        if (!Number.isSafeInteger(subtotal)) {
            throw new Error("El subtotal supera el límite numérico seguro.");
        }

        total += subtotal;

        if (!Number.isSafeInteger(total)) {
            throw new Error("El total supera el límite numérico seguro.");
        }
    }

    return total;
}

function updateCounter(quantities) {
    const state = getState();

    const total = calculateTotal(
        quantities,
        state.denominations
    );

    setState("counter.quantities", { ...quantities });
    setState("counter.total", total);
    setState("counter.isDirty", true);

    return {
        quantities: { ...quantities },
        total
    };
}

export function getCounterTotal() {
    return getState().counter.total;
}

export function getCounterQuantities() {
    return { ...getState().counter.quantities };
}

export function getSubtotal(denominationId) {
    const state = getState();
    const denomination = state.denominations.find(
        item => item.id === denominationId
    );

    if (!denomination) {
        return 0;
    }

    const quantity = state.counter.quantities[denominationId] ?? 0;

    return denomination.value * quantity;
}

export function setQuantity(denominationId, quantity) {
    const denomination = getDenomination(denominationId);
    const validQuantity = validateQuantity(quantity);
    const quantities = getCounterQuantities();

    quantities[denomination.id] = validQuantity;

    return updateCounter(quantities);
}

export function incrementQuantity(denominationId, amount = 1) {
    const denomination = getDenomination(denominationId);
    const increment = validateQuantity(amount);
    const quantities = getCounterQuantities();

    const current = validateQuantity(
        quantities[denomination.id] ?? 0
    );

    const next = current + increment;

    if (next > MAX_QUANTITY) {
        throw new Error("Se alcanzó el límite de cantidad permitido.");
    }

    quantities[denomination.id] = next;

    return updateCounter(quantities);
}

export function decrementQuantity(denominationId, amount = 1) {
    const denomination = getDenomination(denominationId);
    const decrement = validateQuantity(amount);
    const quantities = getCounterQuantities();

    const current = validateQuantity(
        quantities[denomination.id] ?? 0
    );

    quantities[denomination.id] = Math.max(0, current - decrement);

    return updateCounter(quantities);
}

export function clearQuantity(denominationId) {
    return setQuantity(denominationId, 0);
}

export function calculateCurrentCount() {
    const state = getState();

    const total = calculateTotal(
        state.counter.quantities,
        state.denominations
    );

    setState("counter.total", total);

    return total;
}

export function resetCounter() {
    const quantities = {};

    for (const denomination of getState().denominations) {
        quantities[denomination.id] = 0;
    }

    setState("counter.quantities", quantities);
    setState("counter.total", 0);
    setState("counter.isDirty", false);
    setState("counter.draftName", "");
    setState("counter.draftId", null);

    return {
        quantities: { ...quantities },
        total: 0
    };
}

export function loadCounterQuantities(quantities = {}) {
    if (
        !quantities ||
        typeof quantities !== "object" ||
        Array.isArray(quantities)
    ) {
        throw new TypeError("Las cantidades recibidas no son válidas.");
    }

    const normalized = {};

    for (const denomination of getState().denominations) {
        const rawQuantity = quantities[denomination.id] ?? 0;
        normalized[denomination.id] = validateQuantity(rawQuantity);
    }

    const total = calculateTotal(
        normalized,
        getState().denominations
    );

    setState("counter.quantities", normalized);
    setState("counter.total", total);
    setState("counter.isDirty", false);

    return {
        quantities: { ...normalized },
        total
    };
}

export function getCounterBreakdown() {
    const state = getState();

    return state.denominations
        .filter(denomination => denomination.enabled)
        .map(denomination => {
            const quantity = validateQuantity(
                state.counter.quantities[denomination.id] ?? 0
            );

            return {
                denominationId: denomination.id,
                label: denomination.label,
                value: denomination.value,
                quantity,
                subtotal: denomination.value * quantity
            };
        })
        .filter(item => item.quantity > 0);
}

export function getCounterSummary() {
    const breakdown = getCounterBreakdown();

    return {
        total: breakdown.reduce(
            (sum, item) => sum + item.subtotal,
            0
        ),
        totalBills: breakdown.reduce(
            (sum, item) => sum + item.quantity,
            0
        ),
        denominationCount: breakdown.length,
        breakdown
    };
}