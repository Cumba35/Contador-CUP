// js/history/filters.js

import { getState, setState } from "../state.js";
import { listRecords } from "./records.js";
import { normalizeText } from "../utils.js";

function parseDateStart(value) {
    if (!value) return null;

    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function parseDateEnd(value) {
    if (!value) return null;

    const date = new Date(`${value}T23:59:59.999`);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function validateAmount(value, fieldName) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`${fieldName} debe ser un número positivo o cero.`);
    }

    return amount;
}

export function getHistoryFilters() {
    return { ...getState().history.filters };
}

export function setHistoryFilters(changes = {}) {
    const current = getHistoryFilters();
    const next = { ...current };

    if (changes.search !== undefined) {
        next.search = String(changes.search ?? "").slice(0, 200);
    }

    if (changes.startDate !== undefined) {
        next.startDate = String(changes.startDate ?? "");
    }

    if (changes.endDate !== undefined) {
        next.endDate = String(changes.endDate ?? "");
    }

    if (changes.minAmount !== undefined) {
        next.minAmount = validateAmount(changes.minAmount, "El importe mínimo");
    }

    if (changes.maxAmount !== undefined) {
        next.maxAmount = validateAmount(changes.maxAmount, "El importe máximo");
    }

    if (
        next.minAmount !== null &&
        next.maxAmount !== null &&
        next.minAmount > next.maxAmount
    ) {
        throw new Error("El importe mínimo no puede superar el máximo.");
    }

    const start = parseDateStart(next.startDate);
    const end = parseDateEnd(next.endDate);

    if (start !== null && end !== null && start > end) {
        throw new Error("La fecha inicial no puede ser posterior a la final.");
    }

    setState("history.filters", next);

    return { ...next };
}

export function resetHistoryFilters() {
    const defaults = {
        search: "",
        startDate: "",
        endDate: "",
        minAmount: null,
        maxAmount: null
    };

    setState("history.filters", defaults);

    return { ...defaults };
}

export function filterHistory(records = listRecords(), overrides = {}) {
    if (!Array.isArray(records)) {
        throw new TypeError("La lista de conteos no es válida.");
    }

    const filters = {
        ...getHistoryFilters(),
        ...overrides
    };

    const search = normalizeText(filters.search);
    const start = parseDateStart(filters.startDate);
    const end = parseDateEnd(filters.endDate);
    const min = validateAmount(filters.minAmount, "El importe mínimo");
    const max = validateAmount(filters.maxAmount, "El importe máximo");

    return records.filter(record => {
        const amount = Number(record.total ?? 0);
        const timestamp = new Date(record.createdAt).getTime();

        if (search) {
            const searchableText = normalizeText([
                record.name,
                record.notes,
                ...(Array.isArray(record.tags) ? record.tags : []),
                record.id,
                record.total
            ].join(" "));

            if (!searchableText.includes(search)) {
                return false;
            }
        }

        if (start !== null && (!Number.isFinite(timestamp) || timestamp < start)) {
            return false;
        }

        if (end !== null && (!Number.isFinite(timestamp) || timestamp > end)) {
            return false;
        }

        if (min !== null && amount < min) {
            return false;
        }

        if (max !== null && amount > max) {
            return false;
        }

        return true;
    });
}

export function getFilteredHistorySummary(records) {
    const filtered = filterHistory(records);

    return {
        count: filtered.length,
        totalAmount: filtered.reduce((sum, record) => sum + Number(record.total || 0), 0),
        totalBills: filtered.reduce((sum, record) => sum + Number(record.totalBills || 0), 0),
        records: filtered
    };
}

export function selectHistoryRecord(id, selected = true) {
    const current = new Set(getState().history.selectedIds);

    if (selected) {
        current.add(id);
    } else {
        current.delete(id);
    }

    setState("history.selectedIds", [...current]);

    return [...current];
}

export function selectAllHistoryRecords(records = filterHistory()) {
    setState(
        "history.selectedIds",
        records.map(record => record.id)
    );

    return getState().history.selectedIds.slice();
}

export function clearHistorySelection() {
    setState("history.selectedIds", []);
    return [];
}

export function getSelectedHistoryRecords() {
    const selectedIds = new Set(getState().history.selectedIds);

    return listRecords().filter(record => selectedIds.has(record.id));
}