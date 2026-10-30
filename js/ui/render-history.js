import { getState } from "../state.js";
import { listDrafts } from "../counter/draft.js";
import { filterHistory } from "../history/filters.js";
import { listRecords } from "../history/records.js";

import {
    formatCurrency,
    formatNumber,
    formatDateTime,
    escapeHTML
} from "../utils.js";

import { el } from "./helpers.js";

export function renderHistory() {
    const container = el("history-list");
    if (!container) return;

    const records = filterHistory(listRecords());

    container.innerHTML = records.length
        ? records.map(record => `
            <article class="list-item">
                <div class="list-item-content">
                    <strong>
                        ${escapeHTML(record.name || "Conteo sin nombre")}
                    </strong>

                    <div class="text-muted text-small">
                        ${escapeHTML(formatDateTime(record.createdAt))}
                    </div>

                    <div>
                        ${escapeHTML(formatCurrency(record.total))}
                    </div>

                    <div class="text-small">
                        ${formatNumber(record.totalBills, 0)} billetes
                    </div>
                </div>

                <div class="list-item-actions">
                    <button class="btn btn-secondary btn-sm"
                        data-action="restore-record"
                        data-id="${escapeHTML(record.id)}">
                        Cargar
                    </button>

                    <button class="btn btn-secondary btn-sm"
                        data-action="receipt-record"
                        data-id="${escapeHTML(record.id)}">
                        Recibo HTML
                    </button>

                    <button class="btn btn-secondary btn-sm"
                        data-action="receipt-text"
                        data-id="${escapeHTML(record.id)}">
                        Recibo TXT
                    </button>

                    <button class="btn btn-danger btn-sm"
                        data-action="delete-record"
                        data-id="${escapeHTML(record.id)}">
                        Eliminar
                    </button>
                </div>
            </article>
        `).join("")
        : `
            <div class="empty-state">
                <h3 class="empty-state-title">No hay conteos</h3>
                <p>No existen registros que coincidan con los filtros.</p>
            </div>
        `;

    renderComparisonOptions();
}

export function renderDrafts() {
    const container = el("draft-list");
    if (!container) return;

    const drafts = listDrafts();

    container.innerHTML = drafts.length
        ? drafts.map(draft => `
            <article class="list-item">
                <div class="list-item-content">
                    <strong>${escapeHTML(draft.name)}</strong>

                    <div class="text-muted text-small">
                        ${escapeHTML(formatDateTime(draft.updatedAt))}
                    </div>

                    <div>
                        ${escapeHTML(formatCurrency(draft.total))}
                    </div>
                </div>

                <div class="list-item-actions">
                    <button class="btn btn-secondary btn-sm"
                        data-action="load-draft"
                        data-id="${escapeHTML(draft.id)}">
                        Abrir
                    </button>

                    <button class="btn btn-danger btn-sm"
                        data-action="delete-draft"
                        data-id="${escapeHTML(draft.id)}">
                        Eliminar
                    </button>
                </div>
            </article>
        `).join("")
        : `
            <div class="empty-state">
                <h3 class="empty-state-title">No hay borradores</h3>
                <p>Guarda un conteo para continuar más tarde.</p>
            </div>
        `;
}

export function renderComparisonOptions() {
    const records = listRecords();

    for (const id of [
        "comparison-record-a",
        "comparison-record-b"
    ]) {
        const select = el(id);
        if (!select) continue;

        const previous = select.value;

        select.innerHTML =
            '<option value="">Selecciona un conteo</option>' +
            records.map(record => `
                <option value="${escapeHTML(record.id)}">
                    ${escapeHTML(record.name || "Conteo sin nombre")} —
                    ${escapeHTML(formatDateTime(record.createdAt))} —
                    ${escapeHTML(formatCurrency(record.total))}
                </option>
            `).join("");

        if (records.some(record => record.id === previous)) {
            select.value = previous;
        }
    }
}

export function renderComparisonResult(result) {
    const container = el("comparison-result");
    if (!container) return;

    const rows = result.denominations.map(item => `
        <tr>
            <td>${escapeHTML(item.label)}</td>
            <td>${formatNumber(item.firstQuantity, 0)}</td>
            <td>${formatNumber(item.secondQuantity, 0)}</td>
            <td>${formatNumber(item.quantityDifference, 0)}</td>
            <td>${escapeHTML(formatCurrency(item.firstSubtotal))}</td>
            <td>${escapeHTML(formatCurrency(item.secondSubtotal))}</td>
            <td>${escapeHTML(formatCurrency(item.subtotalDifference))}</td>
        </tr>
    `).join("");

    container.innerHTML = `
        <div class="stat-grid">
            <article class="stat-card">
                <span>${escapeHTML(result.first.name)}</span>
                <strong>
                    ${escapeHTML(formatCurrency(result.first.total))}
                </strong>
            </article>

            <article class="stat-card">
                <span>${escapeHTML(result.second.name)}</span>
                <strong>
                    ${escapeHTML(formatCurrency(result.second.total))}
                </strong>
            </article>

            <article class="stat-card">
                <span>Diferencia total</span>
                <strong>
                    ${escapeHTML(formatCurrency(result.differences.total.value))}
                </strong>
            </article>
        </div>

        <div class="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th>Denominación</th>
                        <th>Primero</th>
                        <th>Segundo</th>
                        <th>Dif. cantidad</th>
                        <th>Subtotal 1</th>
                        <th>Subtotal 2</th>
                        <th>Dif. subtotal</th>
                    </tr>
                </thead>

                <tbody>
                    ${rows || '<tr><td colspan="7">Sin datos para comparar.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}