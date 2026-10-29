// js/reports/export-csv.js

import { listRecords } from "../history/records.js";
import {
    getDailyStatistics,
    getDenominationStatistics
} from "./statistics.js";
import { createCSV, downloadText } from "../utils.js";

function makeFilename(prefix) {
    const now = new Date();
    const timestamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0")
    ].join("");

    return `${prefix}-${timestamp}.csv`;
}

export function exportHistoryCSV() {
    const records = listRecords();

    const columns = [
        { key: "id", label: "Identificador" },
        { key: "name", label: "Nombre" },
        { key: "createdAt", label: "Fecha ISO" },
        { key: "total", label: "Total CUP" },
        { key: "totalBills", label: "Billetes contados" },
        { key: "denominationCount", label: "Denominaciones utilizadas" },
        { key: "notes", label: "Notas" },
        { key: "tags", label: "Etiquetas" }
    ];

    const rows = records.map(record => ({
        id: record.id,
        name: record.name ?? "",
        createdAt: record.createdAt ?? "",
        total: Number(record.total ?? 0),
        totalBills: Number(record.totalBills ?? 0),
        denominationCount: Number(record.denominationCount ?? 0),
        notes: record.notes ?? "",
        tags: Array.isArray(record.tags) ? record.tags.join(", ") : ""
    }));

    const csv = createCSV(rows, columns);
    const filename = makeFilename("contador-cup-historial");

    downloadText(csv, filename, "text/csv;charset=utf-8");

    return {
        filename,
        exportedRecords: rows.length
    };
}

export function exportDailyStatisticsCSV(startDate = "", endDate = "") {
    const rows = getDailyStatistics(startDate, endDate);

    const columns = [
        { key: "date", label: "Fecha" },
        { key: "count", label: "Cantidad de conteos" },
        { key: "totalAmount", label: "Importe total CUP" },
        { key: "totalBills", label: "Billetes contados" }
    ];

    const csv = createCSV(rows, columns);
    const filename = makeFilename("contador-cup-estadisticas-diarias");

    downloadText(csv, filename, "text/csv;charset=utf-8");

    return {
        filename,
        exportedRows: rows.length
    };
}

export function exportDenominationStatisticsCSV(startDate = "", endDate = "") {
    const rows = getDenominationStatistics(startDate, endDate);

    const columns = [
        { key: "denominationId", label: "Identificador" },
        { key: "label", label: "Denominación" },
        { key: "value", label: "Valor CUP" },
        { key: "quantity", label: "Cantidad contada" },
        { key: "subtotal", label: "Subtotal CUP" }
    ];

    const csv = createCSV(rows, columns);
    const filename = makeFilename("contador-cup-denominaciones");

    downloadText(csv, filename, "text/csv;charset=utf-8");

    return {
        filename,
        exportedRows: rows.length
    };
}

export function createHistoryCSVText() {
    const records = listRecords();

    const columns = [
        { key: "id", label: "Identificador" },
        { key: "name", label: "Nombre" },
        { key: "createdAt", label: "Fecha ISO" },
        { key: "total", label: "Total CUP" },
        { key: "totalBills", label: "Billetes contados" },
        { key: "notes", label: "Notas" }
    ];

    const rows = records.map(record => ({
        id: record.id,
        name: record.name ?? "",
        createdAt: record.createdAt ?? "",
        total: Number(record.total ?? 0),
        totalBills: Number(record.totalBills ?? 0),
        notes: record.notes ?? ""
    }));

    return createCSV(rows, columns);
}