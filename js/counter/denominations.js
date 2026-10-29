// js/counter/denominations.js

import { APP_CONFIG } from "../config.js";
import { getState, setState } from "../state.js";
import { generateId } from "../utils.js";

const MAX_CUSTOM_DENOMINATIONS =
    APP_CONFIG.limits.customDenominations;

function normalizeDenomination(denomination) {
    return {
        id: denomination.id,
        value: Number(denomination.value),
        label: String(denomination.label),
        enabled: denomination.enabled !== false,
        custom: denomination.custom === true,
        createdAt: denomination.createdAt ?? null,
        updatedAt: denomination.updatedAt ?? null
    };
}

function validateValue(value) {
    const amount = Number(value);

    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        amount > APP_CONFIG.limits.denominationValue
    ) {
        throw new Error(
            "La denominación debe ser un número entero positivo válido."
        );
    }

    return amount;
}

function validateLabel(label) {
    const normalized = String(label ?? "").trim();

    if (!normalized) {
        throw new Error("El nombre de la denominación es obligatorio.");
    }

    if (normalized.length > 60) {
        throw new Error("El nombre no puede superar los 60 caracteres.");
    }

    return normalized;
}

function getCurrentDenominations() {
    const denominations = getState().denominations;

    if (!Array.isArray(denominations)) {
        throw new Error("La lista de denominaciones no es válida.");
    }

    return denominations;
}

function saveDenominations(denominations) {
    const normalized = denominations
        .map(normalizeDenomination)
        .sort((a, b) => b.value - a.value);

    setState("denominations", normalized);

    return normalized;
}

export function getDenominations() {
    return getCurrentDenominations().map(item => ({ ...item }));
}

export function getEnabledDenominations() {
    return getCurrentDenominations()
        .filter(item => item.enabled)
        .map(item => ({ ...item }));
}

export function getDenominationById(id) {
    const denomination = getCurrentDenominations()
        .find(item => item.id === id);

    return denomination ? { ...denomination } : null;
}

export function getDenominationsByValue(value) {
    const amount = Number(value);

    return getCurrentDenominations()
        .filter(item => item.value === amount)
        .map(item => ({ ...item }));
}

export function addCustomDenomination(data) {
    if (!data || typeof data !== "object") {
        throw new TypeError("Los datos de la denominación no son válidos.");
    }

    const denominations = getCurrentDenominations();
    const customCount = denominations.filter(item => item.custom).length;

    if (customCount >= MAX_CUSTOM_DENOMINATIONS) {
        throw new Error(
            `Solo se permiten ${MAX_CUSTOM_DENOMINATIONS} denominaciones personalizadas.`
        );
    }

    const value = validateValue(data.value);
    const label = validateLabel(data.label || `${value} CUP`);

    const duplicate = denominations.some(item =>
        item.value === value &&
        item.label.toLocaleLowerCase() === label.toLocaleLowerCase()
    );

    if (duplicate) {
        throw new Error(
            "Ya existe una denominación con el mismo valor y nombre."
        );
    }

    const now = new Date().toISOString();

    const denomination = {
        id: generateId("denomination"),
        value,
        label,
        enabled: data.enabled !== false,
        custom: true,
        createdAt: now,
        updatedAt: now
    };

    saveDenominations([...denominations, denomination]);

    return { ...denomination };
}

export function updateDenomination(id, changes) {
    if (!changes || typeof changes !== "object") {
        throw new TypeError("Los cambios no son válidos.");
    }

    const denominations = getCurrentDenominations();
    const existing = denominations.find(item => item.id === id);

    if (!existing) {
        throw new Error("No se encontró la denominación solicitada.");
    }

    if (!existing.custom) {
        throw new Error(
            "Las denominaciones predeterminadas no pueden editarse. Puedes activar, desactivar o añadir una personalizada."
        );
    }

    const value = changes.value !== undefined
        ? validateValue(changes.value)
        : existing.value;

    const label = changes.label !== undefined
        ? validateLabel(changes.label)
        : existing.label;

    const duplicate = denominations.some(item =>
        item.id !== id &&
        item.value === value &&
        item.label.toLocaleLowerCase() === label.toLocaleLowerCase()
    );

    if (duplicate) {
        throw new Error(
            "Ya existe otra denominación con el mismo valor y nombre."
        );
    }

    const updated = {
        ...existing,
        value,
        label,
        enabled: changes.enabled === undefined
            ? existing.enabled
            : Boolean(changes.enabled),
        updatedAt: new Date().toISOString()
    };

    saveDenominations(
        denominations.map(item => item.id === id ? updated : item)
    );

    return { ...updated };
}

export function setDenominationEnabled(id, enabled) {
    const denomination = getDenominationById(id);

    if (!denomination) {
        throw new Error("No se encontró la denominación solicitada.");
    }

    return updateEnabledStatus(id, Boolean(enabled));
}

function updateEnabledStatus(id, enabled) {
    const denominations = getCurrentDenominations();

    saveDenominations(
        denominations.map(item => item.id === id
            ? {
                ...item,
                enabled,
                updatedAt: new Date().toISOString()
            }
            : item
        )
    );

    return getDenominationById(id);
}

export function removeCustomDenomination(id) {
    const denominations = getCurrentDenominations();
    const denomination = denominations.find(item => item.id === id);

    if (!denomination) {
        throw new Error("No se encontró la denominación solicitada.");
    }

    if (!denomination.custom) {
        throw new Error(
            "No puedes eliminar una denominación predeterminada."
        );
    }

    saveDenominations(
        denominations.filter(item => item.id !== id)
    );

    return true;
}

export function restoreDefaultDenominations() {
    const current = getCurrentDenominations();
    const custom = current.filter(item => item.custom);

    const defaults = APP_CONFIG.denominations.map(item => ({
        ...item,
        custom: false,
        createdAt: null,
        updatedAt: null
    }));

    const merged = [
        ...defaults.map(item => {
            const previous = current.find(old => old.id === item.id);

            return previous
                ? { ...item, enabled: previous.enabled }
                : item;
        }),
        ...custom
    ];

    saveDenominations(merged);

    return getDenominations();
}

export function validateDenominationList(list) {
    if (!Array.isArray(list)) {
        return {
            valid: false,
            errors: ["La lista debe ser un arreglo."]
        };
    }

    const errors = [];
    const ids = new Set();

    for (const item of list) {
        if (!item || typeof item !== "object") {
            errors.push("Hay una denominación con datos incorrectos.");
            continue;
        }

        if (typeof item.id !== "string" || !item.id.trim()) {
            errors.push("Hay una denominación sin identificador.");
        } else if (ids.has(item.id)) {
            errors.push(`Identificador duplicado: ${item.id}`);
        } else {
            ids.add(item.id);
        }

        try {
            validateValue(item.value);
        } catch (error) {
            errors.push(error.message);
        }

        try {
            validateLabel(item.label);
        } catch (error) {
            errors.push(error.message);
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}