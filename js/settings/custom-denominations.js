
// js/settings/custom-denominations.js

import { APP_CONFIG } from "../config.js";
import { getState, setState } from "../state.js";
import { readStorage, writeStorage } from "../storage.js";

import {
    addCustomDenomination,
    updateDenomination,
    removeCustomDenomination,
    restoreDefaultDenominations,
    validateDenominationList
} from "../counter/denominations.js";

const STORAGE_KEY = "denominations";

function validateAndPersist(denominations) {
    const validation = validateDenominationList(denominations);

    if (!validation.valid) {
        throw new Error(validation.errors.join(" "));
    }

    const customCount = denominations.filter(
        item => item.custom === true
    ).length;

    if (customCount > APP_CONFIG.limits.customDenominations) {
        throw new Error(
            `No se permiten más de ${APP_CONFIG.limits.customDenominations} denominaciones personalizadas.`
        );
    }

    writeStorage(STORAGE_KEY, denominations);

    return denominations.map(item => ({ ...item }));
}

function restorePreviousState(previousDenominations, previousQuantities) {
    setState("denominations", previousDenominations);
    setState("counter.quantities", previousQuantities);
}

function executeDenominationChange(operation) {
    const previousDenominations = getState().denominations.map(
        item => ({ ...item })
    );

    const previousQuantities = {
        ...getState().counter.quantities
    };

    try {
        const result = operation();

        validateAndPersist(getState().denominations);

        return result;
    } catch (error) {
        restorePreviousState(
            previousDenominations,
            previousQuantities
        );

        throw error;
    }
}

export function createDenomination(data) {
    return executeDenominationChange(() => {
        return addCustomDenomination(data);
    });
}

export function editDenomination(id, changes) {
    return executeDenominationChange(() => {
        return updateDenomination(id, changes);
    });
}

export function deleteDenomination(id) {
    return executeDenominationChange(() => {
        const denomination = getState().denominations.find(
            item => item.id === id
        );

        if (!denomination) {
            throw new Error("No se encontró la denominación.");
        }

        if (!denomination.custom) {
            throw new Error(
                "Solo se pueden eliminar denominaciones personalizadas."
            );
        }

        removeCustomDenomination(id);

        const quantities = {
            ...getState().counter.quantities
        };

        delete quantities[id];

        setState("counter.quantities", quantities);

        return true;
    });
}

export function resetDenominationsToDefaults() {
    return executeDenominationChange(() => {
        const denominations = restoreDefaultDenominations();
        const validIds = new Set(
            denominations.map(item => item.id)
        );

        const previousQuantities = getState().counter.quantities;
        const quantities = {};

        for (const denomination of denominations) {
            quantities[denomination.id] = Number(
                previousQuantities[denomination.id] ?? 0
            );
        }

        for (const id of Object.keys(previousQuantities)) {
            if (!validIds.has(id)) {
                delete quantities[id];
            }
        }

        setState("counter.quantities", quantities);

        return denominations;
    });
}

export function importCustomDenominations(list, options = {}) {
    if (!Array.isArray(list)) {
        throw new TypeError(
            "La lista importada debe ser un arreglo."
        );
    }

    const { replaceCustom = false } = options;

    if (typeof replaceCustom !== "boolean") {
        throw new TypeError(
            "La opción replaceCustom debe ser booleana."
        );
    }

    if (list.length > APP_CONFIG.limits.customDenominations) {
        throw new Error(
            `No se pueden importar más de ${APP_CONFIG.limits.customDenominations} denominaciones.`
        );
    }

    const current = getState().denominations;

    const defaults = current.filter(
        item => item.custom !== true
    );

    const existingCustom = current.filter(
        item => item.custom === true
    );

    const incoming = list.map((item, index) => {
        if (
            !item ||
            typeof item !== "object" ||
            Array.isArray(item)
        ) {
            throw new Error(
                `La denominación importada número ${index + 1} no es válida.`
            );
        }

        if (
            typeof item.id !== "string" ||
            !item.id.trim()
        ) {
            throw new Error(
                `La denominación importada número ${index + 1} no tiene un identificador válido.`
            );
        }

        return {
            id: item.id.trim(),
            value: Number(item.value),
            label: String(item.label ?? "").trim(),
            enabled: item.enabled !== false,
            custom: true,
            createdAt: item.createdAt ?? null,
            updatedAt: item.updatedAt ?? null
        };
    });

    const candidates = [
        ...defaults,
        ...(replaceCustom ? [] : existingCustom),
        ...incoming
    ];

    const validation = validateDenominationList(candidates);

    if (!validation.valid) {
        throw new Error(validation.errors.join(" "));
    }

    const customCount = candidates.filter(
        item => item.custom === true
    ).length;

    if (customCount > APP_CONFIG.limits.customDenominations) {
        throw new Error(
            `La importación superaría el límite de ${APP_CONFIG.limits.customDenominations} denominaciones personalizadas.`
        );
    }

    const previousDenominations = current.map(
        item => ({ ...item })
    );

    const previousQuantities = {
        ...getState().counter.quantities
    };

    try {
        const saved = validateAndPersist(candidates);

        setState("denominations", saved);

        const validIds = new Set(
            saved.map(item => item.id)
        );

        const quantities = {};

        for (const [id, quantity] of Object.entries(
            previousQuantities
        )) {
            if (validIds.has(id)) {
                quantities[id] = quantity;
            }
        }

        for (const denomination of saved) {
            if (!(denomination.id in quantities)) {
                quantities[denomination.id] = 0;
            }
        }

        setState("counter.quantities", quantities);

        return saved.map(item => ({ ...item }));
    } catch (error) {
        restorePreviousState(
            previousDenominations,
            previousQuantities
        );

        throw error;
    }
}

export function exportCustomDenominations() {
    const denominations = getState().denominations
        .filter(item => item.custom === true)
        .map(item => ({
            id: item.id,
            value: item.value,
            label: item.label,
            enabled: item.enabled,
            custom: true,
            createdAt: item.createdAt ?? null,
            updatedAt: item.updatedAt ?? null
        }));

    return {
        application: APP_CONFIG.name,
        type: "custom-denominations",
        version: APP_CONFIG.version,
        exportedAt: new Date().toISOString(),
        denominations
    };
}

export function loadDenominationsIntoState() {
    const saved = readStorage(STORAGE_KEY, null);

    if (!Array.isArray(saved)) {
        return getState().denominations.length;
    }

    const validation = validateDenominationList(saved);

    if (!validation.valid) {
        throw new Error(
            `Las denominaciones guardadas no son válidas: ${validation.errors.join(" ")}`
        );
    }

    const customCount = saved.filter(
        item => item.custom === true
    ).length;

    if (customCount > APP_CONFIG.limits.customDenominations) {
        throw new Error(
            "Las denominaciones guardadas superan el límite permitido."
        );
    }

    setState(
        "denominations",
        saved.map(item => ({ ...item }))
    );

    return saved.length;
}

export function getCustomDenominationSummary() {
    const denominations = getState().denominations;

    const custom = denominations.filter(
        item => item.custom === true
    );

    const enabledCount = denominations.filter(
        item => item.enabled !== false
    ).length;

    return {
        total: denominations.length,
        customCount: custom.length,
        enabledCount,
        disabledCount: denominations.length - enabledCount,
        maximumCustom: APP_CONFIG.limits.customDenominations,
        remainingCustomSlots: Math.max(
            0,
            APP_CONFIG.limits.customDenominations - custom.length
        )
    };
}
