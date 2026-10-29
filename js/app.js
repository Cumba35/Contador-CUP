
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
    if (el(id)) el(id).textContent = String(content ?? "");
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
    return !getState().settings.confirmBeforeDelete || globalThis.confirm(message);
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

    if (saved?.draftId) setState("counter.draftId", saved.draftId);
    if (saved?.draftName) setState("counter.draftName", saved.draftName);
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
    if (el("undo-button")) el("undo-button").disabled = !canUndo();
    if (el("redo-button")) el("redo-button").disabled = !canRedo();
}

function renderCounter() {
    const summary = getCounterSummary();

    text("counter-total", formatCurrency(summary.total));
    text("counter-bills", formatNumber(summary.totalBills, 0));
    text("counter-denomination-count", formatNumber(
        getState().denominations.filter(item => item.enabled).length, 0
    ));
    text("current-draft-name", getState().counter.draftName || "Conteo sin guardar");

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
                            <button class="btn-icon" type="button"
                                data-action="decrement" data-id="${id}"
                                aria-label="Restar ${label}">−</button>
                            <input id="quantity-${id}" type="number" min="0"
                                max="${APP_CONFIG.limits.denominationQuantity}"
                                step="1" inputmode="numeric" value="${quantity}"
                                data-action="quantity" data-id="${id}"
                                aria-label="Cantidad de ${label}">
                            <button class="btn-icon" type="button"
                                data-action="increment" data-id="${id}"
                                aria-label="Añadir ${label}">+</button>
                        </div>
                        <div class="denomination-subtotal">
                            Subtotal:
                            <strong id="subtotal-${id}">${formatCurrency(item.value * quantity)}</strong>
                        </div>
                    </article>`;
            }).join("");
    }

    updateUndoButtons();
}

function renderHistory() {
    const container = el("history-list");
    if (!container) return;

    const records = filterHistory(listRecords());

    container.innerHTML = records.length ? records.map(record => `
        <article class="list-item">
            <div class="list-item-content">
                <strong>${escapeHTML(record.name || "Conteo sin nombre")}</strong>
                <div class="text-muted text-small">${escapeHTML(formatDateTime(record.createdAt))}</div>
                <div>${escapeHTML(formatCurrency(record.total))}</div>
                <div class="text-small">${formatNumber(record.totalBills, 0)} billetes</div>
            </div>
            <div class="list-item-actions">
                <button class="btn btn-secondary btn-sm" data-action="restore-record" data-id="${escapeHTML(record.id)}">Cargar</button>
                <button class="btn btn-secondary btn-sm" data-action="receipt-record" data-id="${escapeHTML(record.id)}">Recibo HTML</button>
                <button class="btn btn-secondary btn-sm" data-action="receipt-text" data-id="${escapeHTML(record.id)}">Recibo TXT</button>
                <button class="btn btn-danger btn-sm" data-action="delete-record" data-id="${escapeHTML(record.id)}">Eliminar</button>
            </div>
        </article>`).join("") : `
        <div class="empty-state">
            <h3 class="empty-state-title">No hay conteos</h3>
            <p>No existen registros que coincidan con los filtros.</p>
        </div>`;

    renderComparisonOptions();
}

function renderDrafts() {
    const container = el("draft-list");
    if (!container) return;

    const drafts = listDrafts();
    container.innerHTML = drafts.length ? drafts.map(draft => `
        <article class="list-item">
            <div class="list-item-content">
                <strong>${escapeHTML(draft.name)}</strong>
                <div class="text-muted text-small">${escapeHTML(formatDateTime(draft.updatedAt))}</div>
                <div>${escapeHTML(formatCurrency(draft.total))}</div>
            </div>
            <div class="list-item-actions">
                <button class="btn btn-secondary btn-sm" data-action="load-draft" data-id="${escapeHTML(draft.id)}">Abrir</button>
                <button class="btn btn-danger btn-sm" data-action="delete-draft" data-id="${escapeHTML(draft.id)}">Eliminar</button>
            </div>
        </article>`).join("") : `
        <div class="empty-state">
            <h3 class="empty-state-title">No hay borradores</h3>
            <p>Guarda un conteo para continuar más tarde.</p>
        </div>`;
}

function renderComparisonOptions() {
    const records = listRecords();

    for (const id of ["comparison-record-a", "comparison-record-b"]) {
        const select = el(id);
        if (!select) continue;

        const previous = select.value;
        select.innerHTML = '<option value="">Selecciona un conteo</option>' +
            records.map(record => `
                <option value="${escapeHTML(record.id)}">
                    ${escapeHTML(record.name || "Conteo sin nombre")} —
                    ${escapeHTML(formatDateTime(record.createdAt))} —
                    ${escapeHTML(formatCurrency(record.total))}
                </option>`).join("");

        if (records.some(record => record.id === previous)) select.value = previous;
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
        </tr>`).join("");

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
                <strong>${escapeHTML(formatCurrency(result.differences.total.value))}</strong>
            </article>
        </div>
        <div class="table-wrapper">
            <table>
                <thead><tr>
                    <th>Denominación</th><th>Primero</th><th>Segundo</th>
                    <th>Dif. cantidad</th><th>Subtotal 1</th><th>Subtotal 2</th>
                    <th>Dif. subtotal</th>
                </tr></thead>
                <tbody>${rows || '<tr><td colspan="7">Sin datos para comparar.</td></tr>'}</tbody>
            </table>
        </div>`;
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
        daily.innerHTML = rows.length ? rows.map(day => `
            <tr>
                <td>${escapeHTML(day.date)}</td>
                <td>${formatNumber(day.count, 0)}</td>
                <td>${escapeHTML(formatCurrency(day.totalAmount))}</td>
                <td>${formatNumber(day.totalBills, 0)}</td>
            </tr>`).join("") : '<tr><td colspan="4">No hay datos disponibles.</td></tr>';
    }

    const denominations = el("denomination-report-list");
    if (denominations) {
        denominations.innerHTML = getDenominationStatistics(start, end).map(item => `
            <tr>
                <td>${escapeHTML(item.label)}</td>
                <td>${formatNumber(item.quantity, 0)}</td>
                <td>${escapeHTML(formatCurrency(item.subtotal))}</td>
            </tr>`).join("");
    }
}

function renderCash() {
    const summary = getCashSummary();

    text("cash-opening-balance", formatCurrency(summary.openingBalance));
    text("cash-income", formatCurrency(summary.income));
    text("cash-expenses", formatCurrency(summary.expenses));
    text("cash-adjustments", formatCurrency(summary.adjustments));
    text("cash-current-balance", formatCurrency(summary.currentBalance));
    text("cash-movement-count", formatNumber(summary.movementCount, 0));

    const input = el("opening-balance-input");
    if (input && document.activeElement !== input) input.value = String(summary.openingBalance);

    const container = el("cash-movement-list");
    if (!container) return;

    const movements = listCashMovements();
    container.innerHTML = movements.length ? movements.map(item => `
        <article class="list-item">
            <div class="list-item-content">
                <strong>${escapeHTML(item.description)}</strong>
                <div class="text-muted text-small">${escapeHTML(formatDateTime(item.createdAt))}</div>
                <div>${escapeHTML(item.type)} · ${escapeHTML(formatCurrency(item.amount))}</div>
                ${item.reference ? `<div class="text-small">Referencia: ${escapeHTML(item.reference)}</div>` : ""}
            </div>
            <div class="list-item-actions">
                <button class="btn btn-danger btn-sm" data-action="delete-movement" data-id="${escapeHTML(item.id)}">Eliminar</button>
            </div>
        </article>`).join("") : '<div class="empty-state"><p>No hay movimientos de caja.</p></div>';
}

function renderMachines() {
    const container = el("machine-list");
    const capabilities = getConnectionCapabilities();
    text("machine-connection-capabilities", capabilities.note || "Las conexiones requieren compatibilidad y protocolos verificados.");

    if (!container) return;
    const machines = listMachines();

    container.innerHTML = machines.length ? machines.map(machine => {
        const status = getConnectionStatus(machine.id);
        const selected = getState().machines.activeMachineId === machine.id;

        return `
            <article class="machine-card">
                <div class="machine-image">
                    ${machine.image
                        ? `<img src="${escapeHTML(machine.image)}" alt="${escapeHTML(machine.name)}" loading="lazy">`
                        : '<span>Máquina de dinero</span>'}
                </div>
                <div class="machine-details">
                    <h3>${escapeHTML(machine.name)}</h3>
                    <p>${escapeHTML(machine.brand)} ${escapeHTML(machine.model)}</p>
                    <p class="text-small">Conexión: ${escapeHTML(machine.connectionType)}</p>
                    <p class="connection-status">${escapeHTML(status.message)}</p>
                    <p class="text-small">Conteo automático: no disponible hasta verificar el protocolo.</p>
                </div>
                <div class="list-item-actions">
                    <button class="btn btn-secondary btn-sm" data-action="select-machine" data-id="${escapeHTML(machine.id)}">${selected ? "Seleccionada" : "Seleccionar"}</button>
                    <button class="btn btn-secondary btn-sm" data-action="connect-machine" data-id="${escapeHTML(machine.id)}">Conectar</button>
                    <button class="btn btn-secondary btn-sm" data-action="disconnect-machine" data-id="${escapeHTML(machine.id)}">Desconectar</button>
                    <button class="btn btn-danger btn-sm" data-action="delete-machine" data-id="${escapeHTML(machine.id)}">Eliminar</button>
                </div>
            </article>`;
    }).join("") : `
        <div class="empty-state">
            <h3 class="empty-state-title">No hay máquinas registradas</h3>
            <p>Añade una máquina para guardar su marca, modelo y conexión.</p>
        </div>`;
}

function renderDenominationSettings() {
    const container = el("denomination-settings-list");
    if (!container) return;

    container.innerHTML = getState().denominations.map(item => `
        <article class="list-item">
            <div class="list-item-content">
                <strong>${escapeHTML(item.label)}</strong>
                <div class="text-muted text-small">
                    ${item.custom ? "Personalizada" : "Predeterminada"} ·
                    ${item.enabled ? "Activa" : "Desactivada"}
                </div>
            </div>
            <div class="list-item-actions">
                <button class="btn btn-secondary btn-sm" data-action="toggle-denomination"
                    data-id="${escapeHTML(item.id)}" data-enabled="${!item.enabled}">
                    ${item.enabled ? "Desactivar" : "Activar"}
                </button>
                ${item.custom ? `<button class="btn btn-danger btn-sm" data-action="delete-denomination" data-id="${escapeHTML(item.id)}">Eliminar</button>` : ""}
            </div>
        </article>`).join("");
}

function renderSettings() {
    const settings = getState().settings;
    const fields = {
        "setting-theme": settings.theme,
        "setting-language": settings.language
    };

    for (const [id, val] of Object.entries(fields)) {
        if (el(id)) el(id).value = val;
    }

    for (const [id, val] of Object.entries({
        "setting-auto-save": settings.autoSave,
        "setting-confirm-delete": settings.confirmBeforeDelete,
        "setting-sound": settings.soundEnabled,
        "setting-haptic": settings.hapticEnabled
    })) {
        if (el(id)) el(id).checked = Boolean(val);
    }
}

function renderAll() {
    renderCounter();
    renderHistory();
    renderDrafts();
    renderComparisonOptions();
    renderReports();
    renderCash();
    renderMachines();
    renderDenominationSettings();
    renderSettings();
}

function navigate(view) {
    navigateTo(view);
    const label = {
        counter: "Contador de efectivo",
        drafts: "Borradores",
        history: "Historial de conteos",
        comparison: "Comparación de conteos",
        reports: "Informes y estadísticas",
        cash: "Administración de caja",
        machines: "Máquinas externas",
        denominations: "Denominaciones",
        settings: "Configuración",
        backup: "Copias de seguridad",
        about: "Acerca de Contador CUP",
        "nova-apps": "Otras aplicaciones de Nova"
    }[view] || view;

    $$("[data-view-panel]", root).forEach(panel => {
        panel.hidden = panel.dataset.viewPanel !== view;
    });

    $$("[data-action='navigate']", root).forEach(button => {
        const active = button.dataset.view === view;
        button.classList.toggle("is-active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });

    text("page-title", label);
    window.location.hash = view;
}

function saveCountFromForm() {
    const record = saveCurrentCount({
        name: value("count-name").trim(),
        notes: value("count-notes").trim()
    });
    renderHistory();
    renderReports();
    notify("Conteo guardado en el historial.", "success");
    return record;
}

function machineDataFromForm() {
    const typeMap = {
        counter: MACHINE_TYPES.BILL_COUNTER,
        detector: MACHINE_TYPES.COUNTERFEIT_DETECTOR,
        sorter: MACHINE_TYPES.BILL_SORTER,
        other: MACHINE_TYPES.OTHER
    };

    return {
        name: value("machine-name").trim(),
        type: typeMap[value("machine-type")] ?? MACHINE_TYPES.OTHER,
        brand: value("machine-brand").trim(),
        model: value("machine-model").trim(),
        serialNumber: value("machine-serial").trim(),
        image: value("machine-image").trim(),
        description: value("machine-description").trim(),
        connectionType: value("machine-connection-type", "unknown"),
        connectionDetails: value("machine-connection-details").trim(),
        protocol: value("machine-protocol").trim()
    };
}

async function handleClick(event) {
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
                if (confirmAction("¿Quieres borrar el conteo actual?")) {
                    captureUndoState();
                    resetCounter();
                    persistCurrentCount();
                    renderCounter();
                    notify("Conteo reiniciado.", "success");
                }
                break;

            case "undo":
                if (undo().success) {
                    persistCurrentCount();
                    renderCounter();
                }
                break;

            case "redo":
                if (redo().success) {
                    persistCurrentCount();
                    renderCounter();
                }
                break;

            case "save-draft":
                safely(() => {
                    saveCurrentDraft(value("draft-name"));
                    persistCurrentCount();
                    renderDrafts();
                    notify("Borrador guardado.", "success");
                });
                break;

            case "save-draft-as-new":
                saveDraftAsNew(value("draft-name"));
                persistCurrentCount();
                renderDrafts();
                notify("Nuevo borrador guardado.", "success");
                break;

            case "load-draft":
                if (confirmAction("¿Quieres cargar este borrador?")) {
                    loadDraft(id);
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
                loadCounterQuantities(restoreRecordToCounter(id));
                persistCurrentCount();
                renderCounter();
                navigate(APP_VIEWS.COUNTER);
                notify("Conteo cargado desde el historial.", "success");
                break;

            case "delete-record":
                if (confirmAction("¿Quieres eliminar este conteo del historial?")) {
                    deleteRecord(id);
                    renderHistory();
                    renderReports();
                    notify("Conteo eliminado.", "success");
                }
                break;

            case "receipt-record":
                downloadReceiptHTML(id);
                notify("Recibo HTML descargado.", "success");
                break;

            case "receipt-text":
                downloadReceiptText(id);
                notify("Recibo de texto descargado.", "success");
                break;

            case "compare-records":
                renderComparisonResult(compareRecords(
                    value("comparison-record-a"),
                    value("comparison-record-b")
                ));
                break;

            case "export-history":
                exportHistoryCSV();
                notify("Historial exportado.", "success");
                break;

            case "export-daily":
                exportDailyStatisticsCSV(value("report-start-date"), value("report-end-date"));
                notify("Estadísticas diarias exportadas.", "success");
                break;

            case "export-denominations":
                exportDenominationStatisticsCSV(value("report-start-date"), value("report-end-date"));
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
                notify(result.message, result.success ? "success" : "warning");
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

            case "toggle-denomination":
                editDenomination(id, { enabled: button.dataset.enabled === "true" });
                renderAll();
                persistCurrentCount();
                break;

            case "delete-denomination":
                if (confirmAction("¿Quieres eliminar esta denominación personalizada?")) {
                    deleteDenomination(id);
                    persistCurrentCount();
                    renderAll();
                    notify("Denominación eliminada.", "success");
                }
                break;

            case "theme-light":
                setTheme("light");
                renderSettings();
                break;

            case "theme-dark":
                setTheme("dark");
                renderSettings();
                break;

            case "theme-system":
                setTheme("system");
                renderSettings();
                break;

            case "export-backup":
                downloadBackup();
                notify("Copia de seguridad descargada.", "success");
                break;

            case "show-backup-preview":
                text("backup-preview", JSON.stringify(getBackupPreview(), null, 2));
                break;

            case "import-backup": {
                const file = el("backup-file")?.files?.[0];
                if (!file) throw new Error("Selecciona un archivo de respaldo.");

                const inspected = await readBackupFile(file);
                const approved = globalThis.confirm(
                    `Se importará el respaldo de ${inspected.preview.application}. ¿Quieres reemplazar los datos existentes?`
                );
                if (!approved) break;

                restoreBackup(inspected.backup, { overwrite: true });
                notify("Respaldo restaurado. La aplicación se recargará.", "success");
                setTimeout(() => window.location.reload(), 800);
                break;
            }

            case "open-nova-home":
                window.open("https://cumba35.github.io/Nova-APPS/", "_blank", "noopener,noreferrer");
                break;

            default:
                break;
        }
    });
}

function handleInput(event) {
    const input = event.target;
    if (!input.matches('[data-action="quantity"]')) return;

    safely(() => {
        if (input.value.trim() === "") return;

        const quantity = Number(input.value);
        captureUndoState();
        setQuantity(input.dataset.id, quantity);
        persistCurrentCount();

        const denomination = getState().denominations.find(item => item.id === input.dataset.id);
        if (denomination) {
            text(`subtotal-${denomination.id}`, formatCurrency(denomination.value * quantity));
        }

        const summary = getCounterSummary();
        text("counter-total", formatCurrency(summary.total));
        text("counter-bills", formatNumber(summary.totalBills, 0));
        updateUndoButtons();
    });
}

function handleChange(event) {
    const target = event.target;

    if (target.matches("[data-history-filter]")) {
        safely(() => {
            setHistoryFilters({
                search: value("history-search"),
                startDate: value("history-start-date"),
                endDate: value("history-end-date"),
                minAmount: value("history-min-amount") || null,
                maxAmount: value("history-max-amount") || null
            });
            renderHistory();
        });
    }

    if (target.id === "report-start-date" || target.id === "report-end-date") {
        safely(renderReports);
    }

    if (target.id === "setting-theme") {
        safely(() => setTheme(target.value));
    }
}

function handleSubmit(event) {
    const form = event.target.closest("form[data-app-form]");
    if (!form) return;

    event.preventDefault();

    safely(() => {
        switch (form.dataset.appForm) {
            case "save-count":
                saveCountFromForm();
                form.reset();
                break;

            case "save-draft":
                saveCurrentDraft(value("draft-name"));
                persistCurrentCount();
                renderDrafts();
                notify("Borrador guardado.", "success");
                break;

            case "add-cash-movement":
                addCashMovement({
                    type: value("movement-type"),
                    amount: Number(value("movement-amount")),
                    description: value("movement-description"),
                    reference: value("movement-reference"),
                    notes: value("movement-notes")
                });
                renderCash();
                form.reset();
                notify("Movimiento de caja registrado.", "success");
                break;

            case "register-machine":
                registerMachine(machineDataFromForm());
                persistMachineRegistry();
                renderMachines();
                form.reset();
                notify("Máquina registrada; la compatibilidad no está verificada.", "success");
                break;

            case "add-denomination":
                createDenomination({
                    value: Number(value("new-denomination-value")),
                    label: value("new-denomination-label"),
                    enabled: true
                });
                renderAll();
                form.reset();
                notify("Denominación añadida.", "success");
                break;

            case "save-settings":
                savePreferences({
                    theme: value("setting-theme", getState().settings.theme),
                    language: value("setting-language", getState().settings.language),
                    autoSave: checked("setting-auto-save"),
                    confirmBeforeDelete: checked("setting-confirm-delete"),
                    soundEnabled: checked("setting-sound"),
                    hapticEnabled: checked("setting-haptic"),
                    openingBalance: getState().cash.openingBalance
                });
                applySavedTheme();
                notify("Configuración guardada.", "success");
                break;

            default:
                throw new Error("Formulario no reconocido.");
        }
    });
}

function registerListeners() {
    root.addEventListener("click", event => {
        void handleClick(event);
    });
    root.addEventListener("input", handleInput);
    root.addEventListener("change", handleChange);
    root.addEventListener("submit", handleSubmit);

    window.addEventListener("contador-cup:navigate", event => {
        const view = event.detail?.view;
        if (view) {
            $$("[data-view-panel]", root).forEach(panel => {
                panel.hidden = panel.dataset.viewPanel !== view;
            });
            $$("[data-action='navigate']", root).forEach(button => {
                const active = button.dataset.view === view;
                button.classList.toggle("is-active", active);
                if (active) button.setAttribute("aria-current", "page");
                else button.removeAttribute("aria-current");
            });
        }
    });

    window.addEventListener("beforeunload", () => {
        try {
            persistCurrentCount();
        } catch (error) {
            console.error("No se pudo guardar el conteo:", error);
        }
    });
}

function initializeStoredData() {
    loadPreferencesIntoState();
    applySavedTheme();
    loadDenominationsIntoState();
    restoreCurrentCount();
    loadHistoryIntoState();
    loadMachinesIntoState();

    const settings = readStorage("settings", {});
    const openingBalance = Number(settings?.openingBalance ?? 0);
    setOpeningBalance(Number.isSafeInteger(openingBalance) && openingBalance >= 0
        ? openingBalance : 0);

    loadCashMovementsIntoState();
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (!["https:", "http:"].includes(location.protocol)) return;
    if (location.protocol === "http:" &&
        !["localhost", "127.0.0.1"].includes(location.hostname)) return;

    navigator.serviceWorker.register("./sw.js").catch(error => {
        console.warn("No se pudo registrar el servicio sin conexión:", error);
    });
}

export async function initializeApp() {
    if (initialized) return { success: true, alreadyInitialized: true };

    root = $("#app");
    if (!root) throw new Error("No se encontró el elemento #app.");

    if (!checkStorageAvailability()) {
        notify("El almacenamiento local no está disponible. No se pueden garantizar los guardados.", "warning");
    }

    initializeStoredData();
    initializeNavigation();
    registerListeners();
    renderAll();

    const initialView = location.hash.replace(/^#/, "");
    const validViews = Object.values(APP_VIEWS);
    navigate(validViews.includes(initialView) ? initialView : APP_VIEWS.COUNTER);

    markAppInitialized();
    initialized = true;

    if (getState().settings.autoSave) persistCurrentCount();
    registerServiceWorker();

    return {
        success: true,
        application: APP_CONFIG.name,
        version: APP_CONFIG.version,
        initializedAt: new Date().toISOString()
    };
}

export function refreshApp() {
    renderAll();
    return { success: true, refreshedAt: new Date().toISOString() };
}

export function getAppStatus() {
    return {
        initialized,
        application: APP_CONFIG.name,
        version: APP_CONFIG.version,
        storageAvailable: checkStorageAvailability(),
        currentView: getState().app.currentView,
        machineCount: listMachines().length,
        historyCount: listRecords().length,
        online: navigator.onLine
    };
}

async function start() {
    try {
        await initializeApp();
    } catch (error) {
        console.error("Error al iniciar Contador-CUP:", error);
        if (el("app-error")) {
            el("app-error").textContent = error instanceof Error ? error.message : String(error);
            el("app-error").hidden = false;
        }
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
    void start();
}
