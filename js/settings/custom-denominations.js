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

function persistDenominations() {
    const denominations = getState().denominations;
    const validation = validateDenominationList(denominations);

    if (!validation.valid) {
        throw new Error(validation.errors.join(" "));
    }

    writeStorage(STORAGE_KEY, denominations);

    return denominations.map(item => ({ ...item }));
}

export function createDenomination(data) {
    const denomination = addCustomDenomination(data);
    persistDenominations();

    return denomination;
}

export function editDenomination(id, changes) {
    const denomination = updateDenomination(id, changes);
    persistDenominations();

    return denomination;
}

export function deleteDenomination(id) {
    const denomination = getState().denominations.find(
        item => item.id === id
    );

    if (!denomination) {
        throw new Error("No se encontró la denominación.");
    }

    if (!denomination.custom) {
        throw new Error("Solo se pueden eliminar denominaciones personalizadas.");
    }

    removeCustomDenomination(id);
    persistDenominations();

    const quantities = { ...getState().counter.quantities };
    delete quantities[id];

    setState("counter.quantities", quantities);

    return true;
}

export function resetDenominationsToDefaults() {
    const denominations = restoreDefaultDenominations();
    persistDenominations();

    const validIds = new Set(denominations.map(item => item.id));
    const quantities = {};

    for (const denomination of denominations) {
        quantities[denomination.id] = Number(
            getState().counter.quantities[denomination.id] ?? 0
        );
    }

    for (const id of Object.keys(quantities)) {
        if (!validIds.has(id)) {
            delete quantities[id];
        }
    }

    setState("counter.quantities", quantities);

    return denominations;
}

export function importCustomDenominations(list, options = {}) {
    const { replaceCustom = false } = options;

    if (!Array.isArray(list)) {
        throw new TypeError("La lista importada debe ser un arreglo.");
    }

    if (list.length > APP_CONFIG.limits.customDenominations) {
        throw new Error(
            `No se pueden importar más de ${APP_CONFIG.limits.customDenominations} denominaciones.`
        );
    }

    const current = getState().denominations;
    const defaults = current.filter(item => !item.custom);
    const existingCustom = current.filter(item => item.custom);

    const incoming = list.map(item => ({
        id: item.id,
        value: Number(item.value),
        label: String(item.label ?? "").trim(),
        enabled: item.enabled !== false,
        custom: true
    }));

    const candidates = [
        ...defaults,
        ...(replaceCustom ? [] : existingCustom),
        ...incoming
    ];

    const validation = validateDenominationList(candidates);

    if (!validation.valid) {
        throw new Error(validation.errors.join(" "));
    }

    const ids = new Set();
    const signatures = new Set();

    for (const item of candidates) {
        if (ids.has(item.id)) {
            throw new Error(`Identificador duplicado: ${item.id}`);
        }

        ids.add(item.id);

        const signature = `${item.value}:${item.label.toLocaleLowerCase()}`;

        if (signatures.has(signature)) {
            throw new Error(
                `La denominación "${item.label}" está duplicada.`
            );
        }

        signatures.add(signature);
    }

    setState("denominations", candidates);
    persistDenominations();

    return candidates.map(item => ({ ...item }));
}

export function exportCustomDenominations() {
    const denominations = getState().denominations
        .filter(item => item.custom)
        .map(item => ({
            id: item.id,
            value: item.value,
            label: item.label,
            enabled: item.enabled,
            custom: true
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

    setState("denominations", saved.map(item => ({ ...item })));

    return saved.length;
}

export function getCustomDenominationSummary() {
    const denominations = getState().denominations;
    const custom = denominations.filter(item => item.custom);

    return {
        total: denominations.length,
        customCount: custom.length,
        enabledCount: denominations.filter(item => item.enabled).length,
        disabledCount: denominations.filter(item => !item.enabled).length,
        maximumCustom: APP_CONFIG.limits.customDenominations,
        remainingCustomSlots: Math.max(
            0,
            APP_CONFIG.limits.customDenominations - custom.length
        )
    };
}