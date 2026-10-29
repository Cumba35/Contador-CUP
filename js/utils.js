// js/utils.js

export function generateId(prefix = "id") {
    const randomId = globalThis.crypto?.randomUUID?.();

    if (randomId) {
        return `${prefix}_${randomId}`;
    }

    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function formatCurrency(value, options = {}) {
    const {
        currency = "CUP",
        minimumFractionDigits = 2,
        maximumFractionDigits = 2
    } = options;

    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "0,00 CUP";
    }

    return new Intl.NumberFormat("es-CU", {
        style: "currency",
        currency,
        minimumFractionDigits,
        maximumFractionDigits
    }).format(amount);
}

export function formatNumber(value, maximumFractionDigits = 2) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "0";
    }

    return new Intl.NumberFormat("es-CU", {
        maximumFractionDigits
    }).format(number);
}

export function parseAmount(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value !== "string") {
        return 0;
    }

    const normalized = value
        .trim()
        .replace(/\s/g, "")
        .replace(/[^\d,.-]/g, "")
        .replace(",", ".");

    if (!normalized || normalized === "." || normalized === "-") {
        return 0;
    }

    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : 0;
}

export function toNonNegativeInteger(value, fallback = 0) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
        return fallback;
    }

    return Math.floor(number);
}

export function clampNumber(value, minimum, maximum) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return minimum;
    }

    return Math.min(Math.max(number, minimum), maximum);
}

export function formatDate(value, options = {}) {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Fecha no válida";
    }

    return new Intl.DateTimeFormat("es-CU", {
        dateStyle: "medium",
        ...options
    }).format(date);
}

export function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Fecha no válida";
    }

    return new Intl.DateTimeFormat("es-CU", {
        dateStyle: "short",
        timeStyle: "short"
    }).format(date);
}

export function getTodayLocalDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function isValidDate(value) {
    return !Number.isNaN(new Date(value).getTime());
}

export function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

export function deepClone(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
}

export function debounce(callback, delay = 250) {
    let timeoutId;

    return (...args) => {
        clearTimeout(timeoutId);

        timeoutId = setTimeout(() => {
            callback(...args);
        }, delay);
    };
}

export function downloadBlob(blob, filename) {
    if (!(blob instanceof Blob)) {
        throw new TypeError("El archivo que se intenta descargar no es válido.");
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.hidden = true;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text, filename, mimeType = "text/plain;charset=utf-8") {
    const blob = new Blob([text], { type: mimeType });

    downloadBlob(blob, filename);
}

export function createCSV(rows, columns, separator = ";") {
    const escapeCell = value => {
        const text = String(value ?? "");

        if (
            text.includes('"') ||
            text.includes("\n") ||
            text.includes("\r") ||
            text.includes(separator)
        ) {
            return `"${text.replace(/"/g, '""')}"`;
        }

        return text;
    };

    const header = columns
        .map(column => escapeCell(column.label))
        .join(separator);

    const body = rows.map(row => {
        return columns
            .map(column => escapeCell(row[column.key]))
            .join(separator);
    });

    return "\uFEFF" + [header, ...body].join("\r\n");
}

export function safeParseJSON(value, fallback = null) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

export function assert(condition, message = "Se produjo un error.") {
    if (!condition) {
        throw new Error(message);
    }
}

export function normalizeText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLocaleLowerCase("es");
}