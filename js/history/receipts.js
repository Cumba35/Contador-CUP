// js/history/receipts.js

import { APP_CONFIG } from "../config.js";
import { getRecordById } from "./records.js";
import {
    formatCurrency,
    formatDateTime,
    escapeHTML,
    downloadText
} from "../utils.js";

function validateRecord(record) {
    if (!record || typeof record !== "object") {
        throw new Error("No se recibió un conteo válido.");
    }

    if (!record.id) {
        throw new Error("El conteo no tiene identificador.");
    }

    return record;
}

function formatQuantity(value) {
    const quantity = Number(value ?? 0);

    if (!Number.isSafeInteger(quantity) || quantity < 0) {
        return "0";
    }

    return new Intl.NumberFormat("es-CU", {
        maximumFractionDigits: 0
    }).format(quantity);
}

function buildReceiptData(record) {
    const validRecord = validateRecord(record);

    const breakdown = Array.isArray(validRecord.breakdown)
        ? validRecord.breakdown
            .filter(item => Number(item.quantity) > 0)
            .map(item => ({
                label: String(item.label ?? "Denominación"),
                value: Number(item.value ?? 0),
                quantity: Number(item.quantity ?? 0),
                subtotal: Number(item.subtotal ?? 0)
            }))
        : [];

    return {
        application: APP_CONFIG.fullName,
        currency: validRecord.currency || APP_CONFIG.currency,
        id: validRecord.id,
        name: validRecord.name || "Conteo sin nombre",
        notes: validRecord.notes || "",
        createdAt: validRecord.createdAt,
        total: Number(validRecord.total ?? 0),
        totalBills: Number(validRecord.totalBills ?? 0),
        breakdown
    };
}

export function generateReceiptText(recordOrId) {
    const record = typeof recordOrId === "string"
        ? getRecordById(recordOrId)
        : recordOrId;

    if (!record) {
        throw new Error("No se encontró el conteo solicitado.");
    }

    const data = buildReceiptData(record);
    const separator = "----------------------------------------";
    const lines = [
        data.application,
        "RECIBO DE CONTEO DE EFECTIVO",
        separator,
        `Conteo: ${data.name}`,
        `Identificador: ${data.id}`,
        `Fecha: ${formatDateTime(data.createdAt)}`,
        separator,
        "DENOMINACIÓN       CANTIDAD       SUBTOTAL"
    ];

    for (const item of data.breakdown) {
        lines.push(
            `${item.label} | ${formatQuantity(item.quantity)} | ${formatCurrency(item.subtotal, {
                currency: data.currency
            })}`
        );
    }

    lines.push(
        separator,
        `Billetes contados: ${formatQuantity(data.totalBills)}`,
        `TOTAL: ${formatCurrency(data.total, {
            currency: data.currency
        })}`
    );

    if (data.notes) {
        lines.push(separator, "NOTAS:", data.notes);
    }

    lines.push(
        separator,
        "Recibo generado localmente por Contador-CUP."
    );

    return lines.join("\n");
}

export function generateReceiptHTML(recordOrId) {
    const record = typeof recordOrId === "string"
        ? getRecordById(recordOrId)
        : recordOrId;

    if (!record) {
        throw new Error("No se encontró el conteo solicitado.");
    }

    const data = buildReceiptData(record);

    const rows = data.breakdown.map(item => `
        <tr>
            <td>${escapeHTML(item.label)}</td>
            <td class="number">${escapeHTML(formatQuantity(item.quantity))}</td>
            <td class="number">${escapeHTML(formatCurrency(item.subtotal, {
                currency: data.currency
            }))}</td>
        </tr>
    `).join("");

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recibo - ${escapeHTML(data.name)}</title>
<style>
    body {
        max-width: 760px;
        margin: 32px auto;
        padding: 24px;
        color: #202124;
        font-family: Arial, sans-serif;
    }
    h1, h2 { margin-bottom: 8px; }
    .muted { color: #5f6368; }
    .total {
        margin-top: 24px;
        padding: 16px;
        border: 2px solid #202124;
        font-size: 1.4rem;
        font-weight: bold;
    }
    table {
        width: 100%;
        margin-top: 24px;
        border-collapse: collapse;
    }
    th, td {
        padding: 10px 8px;
        border-bottom: 1px solid #ddd;
        text-align: left;
    }
    .number { text-align: right; }
    .notes {
        margin-top: 20px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }
    .actions { margin-bottom: 24px; }
    @media print {
        body { margin: 0; padding: 12px; }
        .actions { display: none; }
    }
</style>
</head>
<body>
    <div class="actions">
        <button onclick="window.print()">Imprimir o guardar como PDF</button>
    </div>
    <h1>${escapeHTML(data.application)}</h1>
    <h2>Recibo de conteo de efectivo</h2>
    <p class="muted">Conteo: ${escapeHTML(data.name)}</p>
    <p>Fecha: ${escapeHTML(formatDateTime(data.createdAt))}</p>
    <p>Identificador: ${escapeHTML(data.id)}</p>
    <table>
        <thead>
            <tr>
                <th>Denominación</th>
                <th class="number">Cantidad</th>
                <th class="number">Subtotal</th>
            </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="3">Sin denominaciones contadas</td></tr>'}</tbody>
    </table>
    <p>Billetes contados: ${escapeHTML(formatQuantity(data.totalBills))}</p>
    <div class="total">Total: ${escapeHTML(formatCurrency(data.total, {
        currency: data.currency
    }))}</div>
    ${data.notes ? `<div class="notes"><strong>Notas:</strong>\n${escapeHTML(data.notes)}</div>` : ""}
    <p class="muted">Recibo generado localmente por Contador-CUP.</p>
</body>
</html>`;
}

export function downloadReceiptText(recordId) {
    const record = getRecordById(recordId);

    if (!record) {
        throw new Error("No se encontró el conteo solicitado.");
    }

    const content = generateReceiptText(record);
    const filename = `recibo-conteo-${record.id}.txt`;

    downloadText(content, filename, "text/plain;charset=utf-8");

    return filename;
}

export function downloadReceiptHTML(recordId) {
    const record = getRecordById(recordId);

    if (!record) {
        throw new Error("No se encontró el conteo solicitado.");
    }

    const content = generateReceiptHTML(record);
    const filename = `recibo-conteo-${record.id}.html`;

    downloadText(content, filename, "text/html;charset=utf-8");

    return filename;
}