// js/counter/draft.js

import { getState, setState } from "../state.js";
import { readStorage, writeStorage } from "../storage.js";
import {
    generateId,
    deepClone
} from "../utils.js";

import {
    getCounterQuantities,
    getCounterTotal,
    loadCounterQuantities,
    resetCounter
} from "./calculator.js";

const STORAGE_KEY = "drafts";
const MAX_DRAFTS = 1000;
const MAX_NAME_LENGTH = 100;

function getDrafts() {
    const drafts = readStorage(STORAGE_KEY, []);

    if (!Array.isArray(drafts)) {
        return [];
    }

    return drafts.filter(draft =>
        draft &&
        typeof draft === "object" &&
        typeof draft.id === "string" &&
        typeof draft.name === "string" &&
        draft.quantities &&
        typeof draft.quantities === "object" &&
        !Array.isArray(draft.quantities)
    );
}

function saveDrafts(drafts) {
    if (!Array.isArray(drafts)) {
        throw new TypeError("La lista de borradores no es válida.");
    }

    if (drafts.length > MAX_DRAFTS) {
        throw new Error(
            `No se pueden guardar más de ${MAX_DRAFTS} borradores.`
        );
    }

    writeStorage(STORAGE_KEY, drafts);

    return drafts;
}

function validateDraftName(name) {
    const normalized = String(name ?? "").trim();

    if (!normalized) {
        throw new Error("Escribe un nombre para el borrador.");
    }

    if (normalized.length > MAX_NAME_LENGTH) {
        throw new Error(
            `El nombre no puede superar los ${MAX_NAME_LENGTH} caracteres.`
        );
    }

    return normalized;
}

function createDraftSnapshot(name, existing = {}) {
    const state = getState();
    const now = new Date().toISOString();

    return {
        id: existing.id ?? generateId("draft"),
        name,
        quantities: getCounterQuantities(),
        total: getCounterTotal(),
        denominations: Array.isArray(state.denominations)
            ? deepClone(state.denominations)
            : [],
        createdAt: existing.createdAt ?? now,
        updatedAt: now
    };
}

function cloneDraft(draft) {
    return deepClone(draft);
}

function sortDrafts(drafts) {
    return drafts.sort((a, b) => {
        const dateA = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const dateB = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();

        return dateB - dateA;
    });
}

export function listDrafts() {
    return sortDrafts(
        getDrafts().map(cloneDraft)
    );
}

export function getDraftById(id) {
    if (!id) {
        return null;
    }

    const draft = getDrafts().find(item => item.id === id);

    return draft ? cloneDraft(draft) : null;
}

export function saveCurrentDraft(name) {
    const normalizedName = validateDraftName(name);
    const currentId = getState().counter.draftId;
    const drafts = getDrafts();

    const existing = currentId
        ? drafts.find(item => item.id === currentId)
        : null;

    if (!existing && drafts.length >= MAX_DRAFTS) {
        throw new Error("Se alcanzó el límite de borradores guardados.");
    }

    const draft = createDraftSnapshot(
        normalizedName,
        existing ?? {}
    );

    const updatedDrafts = existing
        ? drafts.map(item =>
            item.id === draft.id ? draft : item
        )
        : [...drafts, draft];

    saveDrafts(updatedDrafts);

    setState("counter.draftId", draft.id);
    setState("counter.draftName", draft.name);
    setState("counter.isDirty", false);

    return cloneDraft(draft);
}

export function saveDraftAsNew(name) {
    const normalizedName = validateDraftName(name);
    const drafts = getDrafts();

    if (drafts.length >= MAX_DRAFTS) {
        throw new Error("Se alcanzó el límite de borradores guardados.");
    }

    const draft = createDraftSnapshot(normalizedName);

    saveDrafts([...drafts, draft]);

    setState("counter.draftId", draft.id);
    setState("counter.draftName", draft.name);
    setState("counter.isDirty", false);

    return cloneDraft(draft);
}

export function loadDraft(id) {
    const draft = getDraftById(id);

    if (!draft) {
        throw new Error("No se encontró el borrador.");
    }

    loadCounterQuantities(draft.quantities);

    setState("counter.draftId", draft.id);
    setState("counter.draftName", draft.name);
    setState("counter.isDirty", false);

    return cloneDraft(draft);
}

export function deleteDraft(id) {
    if (!id) {
        return false;
    }

    const drafts = getDrafts();
    const exists = drafts.some(item => item.id === id);

    if (!exists) {
        return false;
    }

    saveDrafts(
        drafts.filter(item => item.id !== id)
    );

    if (getState().counter.draftId === id) {
        setState("counter.draftId", null);
        setState("counter.draftName", "");
    }

    return true;
}

export function duplicateDraft(id, newName) {
    const original = getDraftById(id);

    if (!original) {
        throw new Error("No se encontró el borrador original.");
    }

    const drafts = getDrafts();

    if (drafts.length >= MAX_DRAFTS) {
        throw new Error("Se alcanzó el límite de borradores guardados.");
    }

    const name = validateDraftName(
        newName || `${original.name} (copia)`
    );

    const now = new Date().toISOString();

    const copy = {
        ...original,
        id: generateId("draft"),
        name,
        quantities: deepClone(original.quantities),
        denominations: deepClone(original.denominations ?? []),
        createdAt: now,
        updatedAt: now
    };

    saveDrafts([...drafts, copy]);

    return cloneDraft(copy);
}

export function clearDraftAndCounter() {
    resetCounter();

    setState("counter.draftId", null);
    setState("counter.draftName", "");
    setState("counter.isDirty", false);
}

export function getDraftCount() {
    return getDrafts().length;
}

export function getDraftStorageSummary() {
    const drafts = getDrafts();

    return {
        count: drafts.length,
        maximum: MAX_DRAFTS,
        available: Math.max(0, MAX_DRAFTS - drafts.length)
    };
}