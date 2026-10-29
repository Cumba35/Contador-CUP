import { APP_CONFIG } from "./config.js";
import { getState, setState, markAppInitialized, setAppError } from "./state.js";
import { readStorage, writeStorage, checkStorageAvailability } from "./storage.js";
import { initializeNavigation, navigateTo, APP_VIEWS } from "./navigation.js";

import {
    loadCounterQuantities, getCounterSummary, setQuantity,
    incrementQuantity, decrementQuantity, resetCounter
} from "./counter/calculator.js";

import {
    saveCurrentDraft, saveDraftAsNew, listDrafts, loadDraft, deleteDraft
} from "./counter/draft.js";

import {
    captureUndoState, undo, redo, canUndo, canRedo
} from "./counter/undo-redo.js";

import {
    saveCurrentCount, listRecords, deleteRecord,
    restoreRecordToCounter, loadHistoryIntoState
} from "./history/records.js";

import { filterHistory, setHistoryFilters } from "./history/filters.js";
import { compareRecords } from "./history/comparison.js";
import { downloadReceiptHTML, downloadReceiptText } from "./history/receipts.js";

import {
    getOverallStatistics, getDailyStatistics, getDenominationStatistics
} from "./reports/statistics.js";

import {
    exportHistoryCSV, exportDailyStatisticsCSV, exportDenominationStatisticsCSV
} from "./reports/export-csv.js";

import {
    addCashMovement, deleteCashMovement, setOpeningBalance,
    getCashSummary, listCashMovements, loadCashMovementsIntoState
} from "./cash/movements.js";

import {
    listMachines, registerMachine, removeMachine, setActiveMachine,
    loadMachinesIntoState, MACHINE_TYPES
} from "./machines/registry.js";

import {
    connectMachine, disconnectMachine,
    getConnectionStatus, getConnectionCapabilities
} from "./machines/connections.js";

import { downloadBackup, getBackupPreview } from "./backup/export.js";
import { readBackupFile, restoreBackup } from "./backup/import.js";

import {
    loadPreferencesIntoState, savePreferences,
    setTheme, applySavedTheme
} from "./settings/preferences.js";

import {
    loadDenominationsIntoState, createDenomination,
    editDenomination, deleteDenomination
} from "./settings/custom-denominations.js";

import {
    formatCurrency, formatNumber, formatDateTime, escapeHTML
} from "./utils.js";

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const el = id => document.getElementById(id);
const value = (id, fallback = "") => el(id)?.value ?? fallback;
const checked = id => Boolean(el(id)?.checked);

let root;
let initialized = false;
let toastTimer;

function text(id, content) {
    if (el(id)) {
        el(id).textContent = String(content ?? "");
    }
}

function notify(message, type = "info") {
    const container = el("toast-container");

    if (!container) {
        console.info(`[Contador-CUP] ${message}`);
        return;
    }

    container.replaceChildren();

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.textContent = String(message);

    container.append(toast);
    container.hidden = false;

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.remove();
        container.hidden = !container.children.length;
    }, 3500);
}

function safely(callback) {
    try {
        return callback();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setAppError(message);
        notify(message, "error");
        return null;
    }
}

async function safelyAsync(callback) {
    try {
        return await callback();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setAppError(message);
        notify(message, "error");
        return null;
    }
}

function confirmAction(message) {
    return !getState().settings.confirmBeforeDelete ||
        globalThis.confirm(message);
}

function persistCurrentCount() {
    const state = getState();

    writeStorage("currentCount", {
        quantities: state.counter.quantities,
        total: state.counter.total,
        draftId: state.counter.draftId,
        draftName: state.counter.draftName,
        savedAt: new Date().toISOString()
    });
}

function restoreCurrentCount() {
    const saved = readStorage("currentCount", null);

    loadCounterQuantities(saved?.quantities ?? {});

    if (saved?.draftId) {
        setState("counter.draftId", saved.draftId);
    }

    if (saved?.draftName) {
        setState("counter.draftName", saved.draftName);
    }

    setState("counter.isDirty", false);
}

function persistMachineRegistry() {
    writeStorage("machines", listMachines());
}

function persistOpeningBalance(amount) {
    writeStorage("settings", {
        ...getState().settings,
        openingBalance: amount
    });
}

function updateUndoButtons() {
    if (el("undo-button")) {
        el("undo-button").disabled = !canUndo();
    }

    if (el("redo-button")) {
        el("redo-button").disabled = !canRedo();
    }
}

function renderCounter() {
    const summary = getCounterSummary();

    text("counter-total", formatCurrency(summary.total));
    text("counter-bills", formatNumber(summary.totalBills, 0));

    text(
        "counter-denomination-count",
        formatNumber(
            getState().denominations.filter(item => item.enabled).length,
            0
        )
    );

    text(
        "current-draft-name",
        getState().counter.draftName || "Conteo sin guardar"
    );

    const container = el("denomination-list");

    if (container) {
        container.innerHTML = getState().denominations
            .filter(item => item.enabled)
            .sort((a, b) => b.value - a.value)
            .map(item => {
                const quantity = getState().counter.quantities[item.id] ?? 0;
                const id = escapeHTML(item.id);
                const label = escapeHTML(item.label);

                return `
                    <article class="denomination-card">
                        <div class="denomination-value">${label}</div>

                        <div class="denomination-controls">
                            <button
                                class="btn-icon"
                                type="button"
                                data-action="decrement"
                                data-id="${id}"
                                aria-label="Restar ${label}"
                            >−</button>

                            <input
                                id="quantity-${id}"
                                type="number"
                                min="0"
                                max="${APP_CONFIG.limits.denominationQuantity}"
                                step="1"
                                inputmode="numeric"
                                value="${quantity}"
                                data-action="quantity"
                                data-id="${id}"
                                aria-label="Cantidad de ${label}"
                            >

                            <button
                                class="btn-icon"
                                type="button"
                                data-action="increment"
                                data-id="${id}"
                                aria-label="Añadir ${label}"
                            >+</button>
                        </div>

                        <div class="denomination-subtotal">
                            Subtotal:
                            <strong id="subtotal-${id}">
                                ${formatCurrency(item.value * quantity)}
                            </strong>
                        </div>
                    </article>`;
            })
            .join("");
    }

    updateUndoButtons();
}

function renderHistory() {
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

                    <div>${escapeHTML(formatCurrency(record.total))}</div>

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

function renderDrafts() {
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

                    <div>${escapeHTML(formatCurrency(draft.total))}</div>
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

function renderComparisonOptions() {
    const records = listRecords();

    for (const id of ["comparison-record-a", "comparison-record-b"]) {
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

function renderComparisonResult(result) {
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
                <strong>${escapeHTML(formatCurrency(result.first.total))}</strong>
            </article>

            <article class="stat-card">
                <span>${escapeHTML(result.second.name)}</span>
                <strong>${escapeHTML(formatCurrency(result.second.total))}</strong>
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

function renderReports() {
    const stats = getOverallStatistics();

    text("report-count", formatNumber(stats.count, 0));
    text("report-total", formatCurrency(stats.totalAmount));
    text("report-bills", formatNumber(stats.totalBills, 0));
    text("report-average", formatCurrency(stats.averageAmount));

    const start = el("report-start-date")?.value ?? "";
    const end = el("report-end-date")?.value ?? "";

    const daily = el("daily-report-list");

    if (daily) {
        const rows = getDailyStatistics(start, end);

        daily.innerHTML = rows.length
            ? rows.map(day => `
                <tr>
                    <td>${escapeHTML(day.date)}</td>
                    <td>${formatNumber(day.count, 0)}</td>
                    <td>${escapeHTML(formatCurrency(day.totalAmount))}</td>
                    <td>${formatNumber(day.totalBills, 0)}</td>
                </tr>
            `).join("")
            : '<tr><td colspan="4">No hay datos disponibles.</td></tr>';
    }

    const denominations = el("denomination-report-list");

    if (denominations) {
        denominations.innerHTML = getDenominationStatistics(start, end)
            .map(item => `
                <tr>
                    <td>${escapeHTML(item.label)}</td>
                    <td>${formatNumber(item.quantity, 0)}</td>
                    <td>${escapeHTML(formatCurrency(item.subtotal))}</td>
                </tr>
            `).join("");
    }
}