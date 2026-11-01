// js/history/filters.js

import { getState, setState } from "../state.js";
import { listRecords } from "./records.js";
import { normalizeText } from "../utils.js";

function validateDate(value, fieldName) {
    if (value === null || value === undefined || value === "") {
        return "";
    }

    const normalized = String(value).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        throw new Error(`${fieldName} no tiene un formato de fecha válido.`);
    }

    const [year, month, day] = normalized.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        throw new Error(`${fieldName} no es una fecha válida.`);
    }

    return normalized;
}

function parseDateStart(value) {
    if (!value) return null;

    const date = new Date(`${value}T00:00:00`);

    return Number.isNaN(date.getTime())
        ? null
        : date.getTime();
}

function parseDateEnd(value) {
    if (!value) return null;

    const date = new Date(`${value}T23:59:59.999`);

    return Number.isNaN(date.getTime())
        ? null
        : date.getTime();
}

function validateAmount(value, fieldName) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(
            `${fieldName} debe ser un número positivo o cero.`
        );
    }

    return amount;
}

function normalizeFilters(filters) {
    const normalized = {
        search: String(filters.search ?? "").slice(0, 200),
        startDate: validateDate(
            filters.startDate,
            "La fecha inicial"
        ),
        endDate: validateDate(
            filters.endDate,
            "La fecha final"
        ),
        minAmount: validateAmount(
            filters.minAmount,
            "El importe mínimo"
        ),
        maxAmount: validateAmount(
            filters.maxAmount,
            "El importe máximo"
        )
    };

    if (
        normalized.minAmount !== null &&
        normalized.maxAmount !== null &&
        normalized.minAmount > normalized.maxAmount
    ) {
        throw new Error(
            "El importe mínimo no puede superar el máximo."
        );
    }

    const start = parseDateStart(normalized.startDate);
    const end = parseDateEnd(normalized.endDate);

    if (start !== null && end !== null && start > end) {
        throw new Error(
            "La fecha inicial no puede ser posterior a la final."
        );
    }

    return normalized;
}

export function getHistoryFilters() {
    return { ...getState().history.filters };
}

export function setHistoryFilters(changes = {}) {
    if (
        !changes ||
        typeof changes !== "object" ||
        Array.isArray(changes)
    ) {
        throw new TypeError("Los filtros recibidos no son válidos.");
    }

    const current = getHistoryFilters();

    const next = normalizeFilters({
        ...current,
        ...changes
    });

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
        throw new TypeError(
            "La lista de conteos no es válida."
        );
    }

    if (
        !overrides ||
        typeof overrides !== "object" ||
        Array.isArray(overrides)
    ) {
        throw new TypeError(
            "Los filtros adicionales no son válidos."
        );
    }

    const filters = normalizeFilters({
        ...getHistoryFilters(),
        ...overrides
    });

    const search = normalizeText(filters.search);
    const start = parseDateStart(filters.startDate);
    const end = parseDateEnd(filters.endDate);
    const min = filters.minAmount;
    const max = filters.maxAmount;

    return records.filter(record => {
        if (!record || typeof record !== "object") {
            return false;
        }

        const amount = Number(record.total ?? 0);
        const timestamp = new Date(record.createdAt).getTime();

        if (!Number.isFinite(amount) || amount < 0) {
            return false;
        }

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

        if (
            start !== null &&
            (!Number.isFinite(timestamp) || timestamp < start)
        ) {
            return false;
        }

        if (
            end !== null &&
            (!Number.isFinite(timestamp) || timestamp > end)
        ) {
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
        totalAmount: filtered.reduce(
            (sum, record) => sum + Number(record.total || 0),
            0
        ),
        totalBills: filtered.reduce(
            (sum, record) => sum + Number(record.totalBills || 0),
            0
        ),
        records: filtered
    };
}

export function selectHistoryRecord(id, selected = true) {
    if (typeof id !== "string" || !id.trim()) {
        throw new TypeError(
            "El identificador del conteo no es válido."
        );
    }

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
    if (!Array.isArray(records)) {
        throw new TypeError(
            "La lista de conteos seleccionados no es válida."
        );
    }

    setState(
        "history.selectedIds",
        records
            .filter(record => record && typeof record.id === "string")
            .map(record => record.id)
    );

    return getState().history.selectedIds.slice();
}

export function clearHistorySelection() {
    setState("history.selectedIds", []);

    return [];
}

export function getSelectedHistoryRecords() {
    const selectedIds = new Set(
        getState().history.selectedIds
    );

    return listRecords().filter(
        record => selectedIds.has(record.id)
    );
}