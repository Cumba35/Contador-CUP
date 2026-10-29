// js/counter/draft.js

import { getState, setState } from "../state.js";
import { readStorage, writeStorage } from "../storage.js";
import { generateId } from "../utils.js";
import {
    getCounterQuantities,
    getCounterTotal,
    loadCounterQuantities,
    resetCounter
} from "./calculator.js";

const STORAGE_KEY = "drafts";

function getDrafts() {
    const drafts = readStorage(STORAGE_KEY, []);

    if (!Array.isArray(drafts)) {
        return [];
    }

    return drafts;
}

function saveDrafts(drafts) {
    writeStorage(STORAGE_KEY, drafts);
    return drafts;
}

function validateDraftName(name) {
    const normalized = String(name ?? "").trim();

    if (!normalized) {
        throw new Error("Escribe un nombre para el borrador.");
    }

    if (normalized.length > 100) {
        throw new Error("El nombre no puede superar los 100 caracteres.");
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
        denominations: state.denominations.map(item => ({ ...item })),
        createdAt: existing.createdAt ?? now,
        updatedAt: now
    };
}

export function listDrafts() {
    return getDrafts()
        .map(draft => structuredClone(draft))
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function getDraftById(id) {
    const draft = getDrafts().find(item => item.id === id);

    return draft ? structuredClone(draft) : null;
}

export function saveCurrentDraft(name) {
    const normalizedName = validateDraftName(name);
    const currentId = getState().counter.draftId;
    const drafts = getDrafts();

    const existing = currentId
        ? drafts.find(item => item.id === currentId)
        : null;

    const draft = createDraftSnapshot(normalizedName, existing ?? {});

    const updatedDrafts = existing
        ? drafts.map(item => item.id === draft.id ? draft : item)
        : [...drafts, draft];

    saveDrafts(updatedDrafts);

    setState("counter.draftId", draft.id);
    setState("counter.draftName", draft.name);
    setState("counter.isDirty", false);

    return structuredClone(draft);
}

export function saveDraftAsNew(name) {
    const normalizedName = validateDraftName(name);
    const draft = createDraftSnapshot(normalizedName);

    saveDrafts([...getDrafts(), draft]);

    setState("counter.draftId", draft.id);
    setState("counter.draftName", draft.name);
    setState("counter.isDirty", false);

    return structuredClone(draft);
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

    return structuredClone(draft);
}

export function deleteDraft(id) {
    const drafts = getDrafts();
    const exists = drafts.some(item => item.id === id);

    if (!exists) {
        return false;
    }

    saveDrafts(drafts.filter(item => item.id !== id));

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

    const name = validateDraftName(
        newName || `${original.name} (copia)`
    );

    const copy = {
        ...original,
        id: generateId("draft"),
        name,
        quantities: { ...original.quantities },
        denominations: original.denominations.map(item => ({ ...item })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    saveDrafts([...getDrafts(), copy]);

    return structuredClone(copy);
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