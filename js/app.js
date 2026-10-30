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
}async function handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    await safelyAsync(async () => {
        switch (action) {
            case "navigate":
                navigate(button.dataset.view);
                break;

            case "increment":
                captureUndoState();
                incrementQuantity(id);
                persistCurrentCount();
                renderCounter();
                break;

            case "decrement":
                captureUndoState();
                decrementQuantity(id);
                persistCurrentCount();
                renderCounter();
                break;

            case "reset-counter":
                if (confirmAction("¿Quieres reiniciar el conteo actual?")) {
                    captureUndoState();
                    resetCounter();
                    persistCurrentCount();
                    renderCounter();
                    notify("Conteo reiniciado.", "success");
                }
                break;

            case "undo":
                if (undo()) {
                    persistCurrentCount();
                    renderCounter();
                }
                break;

            case "redo":
                if (redo()) {
                    persistCurrentCount();
                    renderCounter();
                }
                break;

            case "save-draft":
                saveCurrentDraft();
                renderDrafts();
                notify("Borrador guardado.", "success");
                break;

            case "save-draft-as-new":
                saveDraftAsNew();
                renderDrafts();
                notify("Nuevo borrador guardado.", "success");
                break;

            case "load-draft":
                if (loadDraft(id)) {
                    persistCurrentCount();
                    renderCounter();
                    navigate(APP_VIEWS.COUNTER);
                    notify("Borrador cargado.", "success");
                }
                break;

            case "delete-draft":
                if (confirmAction("¿Quieres eliminar este borrador?")) {
                    deleteDraft(id);
                    renderDrafts();
                    notify("Borrador eliminado.", "success");
                }
                break;

            case "restore-record":
                restoreRecordToCounter(id);
                persistCurrentCount();
                renderCounter();
                navigate(APP_VIEWS.COUNTER);
                notify("Conteo restaurado.", "success");
                break;

            case "delete-record":
                if (confirmAction("¿Quieres eliminar este registro?")) {
                    deleteRecord(id);
                    renderHistory();
                    renderReports();
                    notify("Registro eliminado.", "success");
                }
                break;

            case "receipt-record": {
                const record = listRecords().find(item => item.id === id);
                if (!record) throw new Error("No se encontró el registro.");
                downloadReceiptHTML(record);
                break;
            }

            case "receipt-text": {
                const record = listRecords().find(item => item.id === id);
                if (!record) throw new Error("No se encontró el registro.");
                downloadReceiptText(record);
                break;
            }

            case "compare-records": {
                const firstId = value("comparison-record-a");
                const secondId = value("comparison-record-b");

                if (!firstId || !secondId) {
                    throw new Error("Selecciona los dos conteos que deseas comparar.");
                }

                if (firstId === secondId) {
                    throw new Error("Selecciona dos conteos diferentes.");
                }

                const result = compareRecords(firstId, secondId);
                renderComparisonResult(result);
                break;
            }

            case "export-history":
                exportHistoryCSV();
                notify("Historial exportado.", "success");
                break;

            case "export-daily":
                exportDailyStatisticsCSV(
                    value("report-start-date"),
                    value("report-end-date")
                );
                notify("Estadísticas diarias exportadas.", "success");
                break;

            case "export-denominations":
                exportDenominationStatisticsCSV(
                    value("report-start-date"),
                    value("report-end-date")
                );
                notify("Estadísticas por denominación exportadas.", "success");
                break;

            case "delete-movement":
                if (confirmAction("¿Quieres eliminar este movimiento de caja?")) {
                    deleteCashMovement(id);
                    renderCash();
                    notify("Movimiento eliminado.", "success");
                }
                break;

            case "set-opening-balance": {
                const amount = Number(value("opening-balance-input"));

                setOpeningBalance(amount);
                persistOpeningBalance(amount);
                renderCash();
                notify("Saldo inicial actualizado.", "success");
                break;
            }

            case "select-machine":
                setActiveMachine(id);
                renderMachines();
                notify("Máquina seleccionada.", "success");
                break;

            case "connect-machine": {
                const result = await connectMachine(id);
                renderMachines();
                notify(
                    result.message,
                    result.success ? "success" : "warning"
                );
                break;
            }

            case "disconnect-machine": {
                const result = await disconnectMachine(id);
                renderMachines();
                notify(result.message, "info");
                break;
            }

            case "delete-machine":
                if (confirmAction("¿Quieres eliminar esta máquina del registro?")) {
                    removeMachine(id);
                    persistMachineRegistry();
                    renderMachines();
                    notify("Máquina eliminada.", "success");
                }
                break;

            case "toggle-denomination": {
                const denomination = getState().denominations.find(
                    item => item.id === id
                );

                if (!denomination) {
                    throw new Error("No se encontró la denominación.");
                }

                editDenomination(id, {
                    enabled: !denomination.enabled
                });

                renderDenominationSettings();
                renderCounter();
                break;
            }

            case "delete-denomination":
                if (confirmAction("¿Quieres eliminar esta denominación?")) {
                    deleteDenomination(id);
                    renderDenominationSettings();
                    renderCounter();
                    notify("Denominación eliminada.", "success");
                }
                break;

            case "theme-light":
                setTheme("light");
                applySavedTheme();
                break;

            case "theme-dark":
                setTheme("dark");
                applySavedTheme();
                break;

            case "theme-system":
                setTheme("system");
                applySavedTheme();
                break;

            case "export-backup":
                downloadBackup();
                notify("Copia de seguridad descargada.", "success");
                break;

            case "show-backup-preview":
                text(
                    "backup-preview",
                    JSON.stringify(getBackupPreview(), null, 2)
                );
                break;

            case "import-backup": {
                const file = el("backup-file")?.files?.[0];

                if (!file) {
                    throw new Error("Selecciona un archivo de respaldo.");
                }

                const inspected = await readBackupFile(file);

                const approved = globalThis.confirm(
                    `Se importará el respaldo de ${inspected.preview.application}. ¿Quieres reemplazar los datos existentes?`
                );

                if (!approved) break;

                restoreBackup(inspected.backup, {
                    overwrite: true
                });

                notify(
                    "Respaldo restaurado. La aplicación se recargará.",
                    "success"
                );

                setTimeout(() => window.location.reload(), 800);
                break;
            }

            case "open-nova-home":
                window.open(
                    "https://cumba35.github.io/Nova-APPS/",
                    "_blank",
                    "noopener,noreferrer"
                );
                break;

            default:
                break;
        }
    });
}