// js/history/records.js

import { APP_CONFIG } from "../config.js";
import { getState, setState } from "../state.js";
import { readStorage, writeStorage } from "../storage.js";
import { generateId } from "../utils.js";
import { getCounterSummary } from "../counter/calculator.js";

const STORAGE_KEY = "history";

function getRecords() {
    const records = readStorage(STORAGE_KEY, []);
    return Array.isArray(records) ? records : [];
}

function saveRecords(records) {
    const limit = APP_CONFIG.defaults.historyLimit;
    const boundedRecords = records.slice(-limit);

    writeStorage(STORAGE_KEY, boundedRecords);
    setState("history.records", boundedRecords);

    return boundedRecords;
}

function validateRecordName(name) {
    const normalized = String(name ?? "").trim();

    if (normalized.length > 120) {
        throw new Error("El nombre no puede superar los 120 caracteres.");
    }

    return normalized;
}

function normalizeQuantities(quantities) {
    if (!quantities || typeof quantities !== "object" || Array.isArray(quantities)) {
        throw new TypeError("Las cantidades del conteo no son válidas.");
    }

    const normalized = {};

    for (const denomination of getState().denominations) {
        const quantity = Number(quantities[denomination.id] ?? 0);

        if (!Number.isSafeInteger(quantity) || quantity < 0) {
            throw new Error(`Cantidad inválida para ${denomination.label}.`);
        }

        normalized[denomination.id] = quantity;
    }

    return normalized;
}

export function listRecords() {
    return getRecords()
        .map(record => structuredClone(record))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function getRecordById(id) {
    const record = getRecords().find(item => item.id === id);
    return record ? structuredClone(record) : null;
}

export function saveCurrentCount(options = {}) {
    const {
        name = "",
        notes = "",
        tags = []
    } = options;

    const summary = getCounterSummary();
    const state = getState();
    const quantities = normalizeQuantities(state.counter.quantities);
    const now = new Date().toISOString();

    const record = {
        id: generateId("count"),
        name: validateRecordName(name),
        notes: String(notes ?? "").trim().slice(0, 2000),
        tags: Array.isArray(tags)
            ? [...new Set(tags.map(tag => String(tag).trim()).filter(Boolean))].slice(0, 30)
            : [],
        quantities,
        breakdown: summary.breakdown.map(item => ({ ...item })),
        total: summary.total,
        totalBills: summary.totalBills,
        denominationCount: summary.denominationCount,
        currency: APP_CONFIG.currency,
        createdAt: now,
        updatedAt: now
    };

    saveRecords([...getRecords(), record]);

    setState("counter.isDirty", false);

    return structuredClone(record);
}

export function updateRecord(id, changes = {}) {
    const records = getRecords();
    const existing = records.find(item => item.id === id);

    if (!existing) {
        throw new Error("No se encontró el conteo guardado.");
    }

    const updated = {
        ...existing,
        updatedAt: new Date().toISOString()
    };

    if (changes.name !== undefined) {
        updated.name = validateRecordName(changes.name);
    }

    if (changes.notes !== undefined) {
        updated.notes = String(changes.notes ?? "").trim().slice(0, 2000);
    }

    if (changes.tags !== undefined) {
        if (!Array.isArray(changes.tags)) {
            throw new TypeError("Las etiquetas deben ser una lista.");
        }

        updated.tags = [
            ...new Set(changes.tags.map(tag => String(tag).trim()).filter(Boolean))
        ].slice(0, 30);
    }

    saveRecords(records.map(item => item.id === id ? updated : item));

    return structuredClone(updated);
}

export function deleteRecord(id) {
    const records = getRecords();
    const exists = records.some(item => item.id === id);

    if (!exists) {
        return false;
    }

    saveRecords(records.filter(item => item.id !== id));

    const selectedIds = getState().history.selectedIds.filter(
        selectedId => selectedId !== id
    );

    setState("history.selectedIds", selectedIds);

    return true;
}

export function deleteRecords(ids) {
    if (!Array.isArray(ids)) {
        throw new TypeError("Debes proporcionar una lista de identificadores.");
    }

    const idsToDelete = new Set(ids);
    const records = getRecords();
    const remaining = records.filter(item => !idsToDelete.has(item.id));
    const deletedCount = records.length - remaining.length;

    if (deletedCount > 0) {
        saveRecords(remaining);
    }

    setState(
        "history.selectedIds",
        getState().history.selectedIds.filter(id => !idsToDelete.has(id))
    );

    return deletedCount;
}

export function restoreRecordToCounter(id) {
    const record = getRecordById(id);

    if (!record) {
        throw new Error("No se encontró el conteo guardado.");
    }

    const currentIds = new Set(
        getState().denominations.map(item => item.id)
    );

    const quantities = {};

    for (const [denominationId, quantity] of Object.entries(record.quantities ?? {})) {
        if (currentIds.has(denominationId)) {
            quantities[denominationId] = quantity;
        }
    }

    for (const denomination of getState().denominations) {
        if (!(denomination.id in quantities)) {
            quantities[denomination.id] = 0;
        }
    }

    setState("counter.draftId", null);
    setState("counter.draftName", "");
    setState("counter.isDirty", false);

    return quantities;
}

export function getHistoryStatistics() {
    const records = getRecords();

    return {
        count: records.length,
        totalAmount: records.reduce((sum, record) => sum + Number(record.total || 0), 0),
        totalBills: records.reduce((sum, record) => sum + Number(record.totalBills || 0), 0),
        latestRecord: records.length
            ? structuredClone(
                records.reduce((latest, record) =>
                    new Date(record.createdAt) > new Date(latest.createdAt)
                        ? record
                        : latest
                )
            )
            : null
    };
}

export function loadHistoryIntoState() {
    const records = getRecords();
    setState("history.records", records);
    return records.length;
}