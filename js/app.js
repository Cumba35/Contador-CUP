// js/app.js

import { APP_CONFIG } from "./config.js";
import { getState, setState, markAppInitialized, setAppError } from "./state.js";
import { readStorage, writeStorage, checkStorageAvailability } from "./storage.js";
import { initializeNavigation, navigateTo, APP_VIEWS } from "./navigation.js";

import {
    loadCounterQuantities,
    getCounterSummary,
    setQuantity,
    incrementQuantity,
    decrementQuantity,
    resetCounter
} from "./counter/calculator.js";

import {
    saveCurrentDraft,
    saveDraftAsNew,
    listDrafts,
    loadDraft,
    deleteDraft
} from "./counter/draft.js";

import {
    captureUndoState,
    undo,
    redo,
    canUndo,
    canRedo
} from "./counter/undo-redo.js";

import {
    saveCurrentCount,
    listRecords,
    deleteRecord,
    restoreRecordToCounter,
    loadHistoryIntoState
} from "./history/records.js";

import {
    filterHistory,
    setHistoryFilters,
    resetHistoryFilters
} from "./history/filters.js";

import {
    compareRecords
} from "./history/comparison.js";

import {
    generateReceiptHTML,
    downloadReceiptText,
    downloadReceiptHTML
} from "./history/receipts.js";

import {
    getOverallStatistics,
    getDailyStatistics,
    getDenominationStatistics
} from "./reports/statistics.js";

import {
    exportHistoryCSV,
    exportDailyStatisticsCSV,
    exportDenominationStatisticsCSV
} from "./reports/export-csv.js";

import {
    addCashMovement,
    updateCashMovement,
    deleteCashMovement,
    setOpeningBalance,
    getCashSummary,
    listCashMovements
} from "./cash/movements.js";

import {
    listMachines,
    registerMachine,
    updateMachine,
    removeMachine,
    setActiveMachine,
    loadMachinesIntoState,
    MACHINE_TYPES,
    MACHINE_CONNECTION_TYPES
} from "./machines/registry.js";

import {
    connectMachine,
    disconnectMachine,
    getConnectionStatus,
    getConnectionCapabilities
} from "./machines/connections.js";

import {
    downloadBackup,
    getBackupPreview
} from "./backup/export.js";

import {
    readBackupFile,
    restoreBackup
} from "./backup/import.js";

import {
    loadPreferencesIntoState,
    savePreferences,
    setTheme,
    applySavedTheme
} from "./settings/preferences.js";

import {
    loadDenominationsIntoState,
    createDenomination,
    editDenomination,
    deleteDenomination
} from "./settings/custom-denominations.js";

import {
    formatCurrency,
    formatNumber,
    formatDateTime,
    escapeHTML,
    getTodayLocalDate
} from "./utils.js";

const ROOT_SELECTOR = "#app";
const NOTIFICATION_DURATION = 3500;

let root = null;
let notificationTimer = null;
let initialized = false;

function $(selector, parent = document) {
    return parent.querySelector(selector);
}

function $$(selector, parent = document) {
    return [...parent.querySelectorAll(selector)];
}

function getElement(id) {
    return document.getElementById(id);
}

function getValue(id, fallback = "") {
    const element = getElement(id);
    return element ? element.value : fallback;
}

function getChecked(id) {
    return Boolean(getElement(id)?.checked);
}

function setText(id, value) {
    const element = getElement(id);

    if (element) {
        element.textContent = String(value ?? "");
    }
}

function setHTML(id, value) {
    const element = getElement(id);

    if (element) {
        element.innerHTML = value;
    }
}

function showElement(element, visible = true) {
    if (!element) return;

    element.hidden = !visible;
    element.setAttribute("aria-hidden", String(!visible));
}

function notify(message, type = "info") {
    const container = getElement("toast-container");

    if (!container) {
        console.info(`[Contador-CUP] ${message}`);
        return;
    }

    container.replaceChildren();

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    toast.textContent = String(message);

    container.appendChild(toast);
    showElement(container, true);

    clearTimeout(notificationTimer);

    notificationTimer = setTimeout(() => {
        toast.remove();

        if (!container.children.length) {
            showElement(container, false);
        }
    }, NOTIFICATION_DURATION);
}

function handleError(error) {
    const message = error instanceof Error
        ? error.message
        : String(error ?? "Se produjo un error inesperado.");

    setAppError(message);
    notify(message, "error");

    return {
        success: false,
        error: message
    };
}

function runSafely(callback) {
    try {
        return callback();
    } catch (error) {
        return handleError(error);
    }
}

async function runSafelyAsync(callback) {
    try {
        return await callback();
    } catch (error) {
        return handleError(error);
    }
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

    if (!saved || typeof saved !== "object") {
        loadCounterQuantities({});
        return;
    }

    loadCounterQuantities(saved.quantities ?? {});

    if (saved.draftId) {
        setState("counter.draftId", saved.draftId);
    }

    if (saved.draftName) {
        setState("counter.draftName", saved.draftName);
    }

    setState("counter.isDirty", false);
}

function persistSettingsFromState() {
    const settings = getState().settings;
    writeStorage("settings", settings);
}

function persistMachineRegistry() {
    writeStorage("machines", listMachines());
}

function persistCashState() {
    const state = getState();

    writeStorage("cashMovements", state.cash.movements);
    writeStorage("settings", state.settings);
}

function refreshCounterDisplay() {
    const summary = getCounterSummary();

    setText("counter-total", formatCurrency(summary.total));
    setText("counter-bills", formatNumber(summary.totalBills, 0));
    setText("counter-denomination-count", formatNumber(summary.denominationCount, 0));

    for (const denomination of getState().denominations) {
        const quantity = getState().counter.quantities[denomination.id] ?? 0;

        const quantityElement = getElement(`quantity-${denomination.id}`);
        if (quantityElement) {
            quantityElement.value = String(quantity);
        }

        const subtotalElement = getElement(`subtotal-${denomination.id}`);
        if (subtotalElement) {
            subtotalElement.textContent = formatCurrency(
                denomination.value * quantity
            );
        }
    }

    setText(
        "current-draft-name",
        getState().counter.draftName || "Conteo sin guardar"
    );

    updateUndoRedoButtons();
}

function renderDenominations() {
    const container = getElement("denomination-list");

    if (!container) return;

    const denominations = getState().denominations
        .filter(item => item.enabled)
        .sort((a, b) => b.value - a.value);

    container.innerHTML = denominations.map(denomination => {
        const quantity = getState().counter.quantities[denomination.id] ?? 0;

        return `
            <article class="denomination-card" data-denomination-id="${escapeHTML(denomination.id)}">
                <div class="denomination-header">
                    <span class="denomination-value">${escapeHTML(denomination.label)}</span>
                </div>

                <div class="denomination-controls">
                    <button
                        class="btn-icon"
                        type="button"
                        data-action="decrement"
                        data-id="${escapeHTML(denomination.id)}"
                        aria-label="Restar un billete de ${escapeHTML(denomination.label)}"
                    >−</button>

                    <input
                        id="quantity-${escapeHTML(denomination.id)}"
                        type="number"
                        min="0"
                        max="${APP_CONFIG.limits.denominationQuantity}"
                        step="1"
                        inputmode="numeric"
                        value="${quantity}"
                        data-action="quantity"
                        data-id="${escapeHTML(denomination.id)}"
                        aria-label="Cantidad de ${escapeHTML(denomination.label)}"
                    >

                    <button
                        class="btn-icon"
                        type="button"
                        data-action="increment"
                        data-id="${escapeHTML(denomination.id)}"
                        aria-label="Añadir un billete de ${escapeHTML(denomination.label)}"
                    >+</button>
                </div>

                <div class="denomination-subtotal">
                    Subtotal:
                    <strong id="subtotal-${escapeHTML(denomination.id)}">${formatCurrency(denomination.value * quantity)}</strong>
                </div>
            </article>
        `;
    }).join("");

    refreshCounterDisplay();
}

function renderHistory() {
    const container = getElement("history-list");

    if (!container) return;

    const records = filterHistory(listRecords());

    if (!records.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3 class="empty-state-title">No hay conteos</h3>
                <p>No existen registros que coincidan con los filtros.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = records.map(record => `
        <article class="list-item">
            <div class="list-item-content">
                <strong>${escapeHTML(record.name || "Conteo sin nombre")}</strong>
                <div class="text-muted text-small">${escapeHTML(formatDateTime(record.createdAt))}</div>
                <div class="numeric">${escapeHTML(formatCurrency(record.total))}</div>
                <div class="text-small">${escapeHTML(formatNumber(record.totalBills, 0))} billetes</div>
            </div>

            <div class="list-item-actions">
                <button class="btn btn-secondary btn-sm" data-action="restore-record" data-id="${escapeHTML(record.id)}">Cargar</button>
                <button class="btn btn-secondary btn-sm" data-action="receipt-record" data-id="${escapeHTML(record.id)}">Recibo</button>
                <button class="btn btn-danger btn-sm" data-action="delete-record" data-id="${escapeHTML(record.id)}">Eliminar</button>
            </div>
        </article>
    `).join("");
}

function renderDrafts() {
    const container = getElement("draft-list");

    if (!container) return;

    const drafts = listDrafts();

    if (!drafts.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3 class="empty-state-title">No hay borradores</h3>
                <p>Guarda un conteo para continuar más tarde.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = drafts.map(draft => `
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
        </article>
    `).join("");
}

function renderReports() {
    const statistics = getOverallStatistics();

    setText("report-count", formatNumber(statistics.count, 0));
    setText("report-total", formatCurrency(statistics.totalAmount));
    setText("report-bills", formatNumber(statistics.totalBills, 0));
    setText("report-average", formatCurrency(statistics.averageAmount));

    const dailyContainer = getElement("daily-report-list");

    if (dailyContainer) {
        const days = getDailyStatistics();

        dailyContainer.innerHTML = days.length
            ? days.map(day => `
                <tr>
                    <td>${escapeHTML(day.date)}</td>
                    <td>${formatNumber(day.count, 0)}</td>
                    <td>${escapeHTML(formatCurrency(day.totalAmount))}</td>
                    <td>${formatNumber(day.totalBills, 0)}</td>
                </tr>
            `).join("")
            : `<tr><td colspan="4">No hay datos disponibles.</td></tr>`;
    }

    const denominationContainer = getElement("denomination-report-list");

    if (denominationContainer) {
        const items = getDenominationStatistics();

        denominationContainer.innerHTML = items.map(item => `
            <tr>
                <td>${escapeHTML(item.label)}</td>
                <td>${formatNumber(item.quantity, 0)}</td>
                <td>${escapeHTML(formatCurrency(item.subtotal))}</td>
            </tr>
        `).join("");
    }
}

function renderCash() {
    const summary = getCashSummary();

    setText("cash-opening-balance", formatCurrency(summary.openingBalance));
    setText("cash-income", formatCurrency(summary.income));
    setText("cash-expenses", formatCurrency(summary.expenses));
    setText("cash-adjustments", formatCurrency(summary.adjustments));
    setText("cash-current-balance", formatCurrency(summary.currentBalance));
    setText("cash-movement-count", formatNumber(summary.movementCount, 0));

    const container = getElement("cash-movement-list");

    if (!container) return;

    const movements = listCashMovements();

    container.innerHTML = movements.length
        ? movements.map(movement => `
            <article class="list-item">
                <div class="list-item-content">
                    <strong>${escapeHTML(movement.description)}</strong>
                    <div class="text-muted text-small">${escapeHTML(formatDateTime(movement.createdAt))}</div>
                    <div>${escapeHTML(movement.type)} · ${escapeHTML(formatCurrency(movement.amount))}</div>
                </div>

                <div class="list-item-actions">
                    <button class="btn btn-danger btn-sm" data-action="delete-movement" data-id="${escapeHTML(movement.id)}">Eliminar</button>
                </div>
            </article>
        `).join("")
        : `<div class="empty-state"><p>No hay movimientos de caja.</p></div>`;
}

function renderMachines() {
    const container = getElement("machine-list");

    setText("machine-connection-capabilities",
        getConnectionCapabilities().note
    );

    if (!container) return;

    const machines = listMachines();

    if (!machines.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3 class="empty-state-title">No hay máquinas registradas</h3>
                <p>Añade una máquina para guardar su marca, modelo y conexión.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = machines.map(machine => {
        const status = getConnectionStatus(machine.id);
        const selected = getState().machines.activeMachineId === machine.id;

        return `
            <article class="machine-card">
                <div class="machine-image">
                    ${machine.image
                        ? `<img src="${escapeHTML(machine.image)}" alt="${escapeHTML(machine.name)}" loading="lazy">`
                        : `<span aria-hidden="true">Máquina de dinero</span>`
                    }
                </div>

                <div class="machine-details">
                    <h3>${escapeHTML(machine.name)}</h3>
                    <p>${escapeHTML(machine.brand)} ${escapeHTML(machine.model)}</p>
                    <p class="text-muted text-small">Conexión: ${escapeHTML(machine.connectionType)}</p>
                    <p class="connection-status" data-status="${escapeHTML(status.status)}">${escapeHTML(status.message)}</p>
                    <p class="text-small">Conteo automático: ${machine.automaticCountingEnabled ? "habilitado" : "no disponible"}</p>
                </div>

                <div class="list-item-actions">
                    <button class="btn btn-secondary btn-sm" data-action="select-machine" data-id="${escapeHTML(machine.id)}">${selected ? "Seleccionada" : "Seleccionar"}</button>
                    <button class="btn btn-secondary btn-sm" data-action="connect-machine" data-id="${escapeHTML(machine.id)}">Conectar</button>
                    <button class="btn btn-secondary btn-sm" data-action="disconnect-machine" data-id="${escapeHTML(machine.id)}">Desconectar</button>
                    <button class="btn btn-danger btn-sm" data-action="delete-machine" data-id="${escapeHTML(machine.id)}">Eliminar</button>
                </div>
            </article>
        `;
    }).join("");
}

function renderDenominationSettings() {
    const container = getElement("denomination-settings-list");

    if (!container) return;

    container.innerHTML = getState().denominations.map(item => `
        <article class="list-item">
            <div class="list-item-content">
                <strong>${escapeHTML(item.label)}</strong>
                <div class="text-muted text-small">
                    ${item.custom ? "Personalizada" : "Predeterminada"}
                    · ${item.enabled ? "Activa" : "Desactivada"}
                </div>
            </div>

            <div class="list-item-actions">
                <button class="btn btn-secondary btn-sm" data-action="toggle-denomination" data-id="${escapeHTML(item.id)}" data-enabled="${item.enabled ? "false" : "true"}">${item.enabled ? "Desactivar" : "Activar"}</button>
                ${item.custom
                    ? `<button class="btn btn-danger btn-sm" data-action="delete-denomination" data-id="${escapeHTML(item.id)}">Eliminar</button>`
                    : ""
                }
            </div>
        </article>
    `).join("");
}

function renderAll() {
    renderDenominations();
    renderHistory();
    renderDrafts();
    renderReports();
    renderCash();
    renderMachines();
    renderDenominationSettings();
    refreshCounterDisplay();
}

function updateUndoRedoButtons() {
    const undoButton = getElement("undo-button");
    const redoButton = getElement("redo-button");

    if (undoButton) undoButton.disabled = !canUndo();
    if (redoButton) redoButton.disabled = !canRedo();
}

function askForConfirmation(message) {
    const settings = getState().settings;

    if (!settings.confirmBeforeDelete) {
        return true;
    }

    return globalThis.confirm(String(message));
}

function saveCountFromForm() {
    const name = getValue("count-name").trim();
    const notes = getValue("count-notes").trim();

    const record = saveCurrentCount({ name, notes });

    notify("Conteo guardado correctamente.", "success");

    renderHistory();
    refreshCounterDisplay();

    return record;
}

function handleQuantityChange(input) {
    const id = input.dataset.id;
    const value = Number(input.value);

    captureUndoState();

    setQuantity(id, value);
    persistCurrentCount();
    refreshCounterDisplay();
}

function handleClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button || button.disabled) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    runSafely(() => {
        switch (action) {
            case "navigate":
                navigateTo(button.dataset.view);
                break;

            case "increment":
                captureUndoState();
                incrementQuantity(id);
                persistCurrentCount();
                refreshCounterDisplay();
                break;

            case "decrement":
                captureUndoState();
                decrementQuantity(id);
                persistCurrentCount();
                refreshCounterDisplay();
                break;

            case "reset-counter":
                if (askForConfirmation("¿Quieres borrar el conteo actual?")) {
                    captureUndoState();
                    resetCounter();
                    persistCurrentCount();
                    refreshCounterDisplay();
                    notify("Conteo reiniciado.", "success");
                }
                break;

            case "save-count":
                saveCountFromForm();
                break;

            case "save-draft":
                saveCurrentDraft(getValue("draft-name"));
                persistCurrentCount();
                renderDrafts();
                notify("Borrador guardado.", "success");
                break;

            case "save-draft-as-new":
                saveDraftAsNew(getValue("draft-name"));
                persistCurrentCount();
                renderDrafts();
                notify("Nuevo borrador guardado.", "success");
                break;

            case "load-draft":
                if (askForConfirmation("¿Quieres cargar este borrador?")) {
                    loadDraft(id);
                    persistCurrentCount();
                    refreshCounterDisplay();
                    notify("Borrador cargado.", "success");
                    navigateTo(APP_VIEWS.COUNTER);
                }
                break;

            case "delete-draft":
                if (askForConfirmation("¿Quieres eliminar este borrador?")) {
                    deleteDraft(id);
                    renderDrafts();
                    notify("Borrador eliminado.", "success");
                }
                break;

            case "undo":
                if (undo().success) {
                    persistCurrentCount();
                    refreshCounterDisplay();
                }
                break;

            case "redo":
                if (redo().success) {
                    persistCurrentCount();
                    refreshCounterDisplay();
                }
                break;

            case "restore-record": {
                const quantities = restoreRecordToCounter(id);
                loadCounterQuantities(quantities);
                persistCurrentCount();
                refreshCounterDisplay();
                navigateTo(APP_VIEWS.COUNTER);
                notify("Conteo cargado desde el historial.", "success");
                break;
            }

            case "delete-record":
                if (askForConfirmation("¿Quieres eliminar este conteo del historial?")) {
                    deleteRecord(id);
                    renderHistory();
                    renderReports();
                    notify("Conteo eliminado.", "success");
                }
                break;

            case "receipt-record":
                downloadReceiptHTML(id);
                break;

            case "receipt-text":
                downloadReceiptText(id);
                break;

            case "export-history":
                exportHistoryCSV();
                notify("Historial exportado.", "success");
                break;

            case "export-daily":
                exportDailyStatisticsCSV(
                    getValue("report-start-date"),
                    getValue("report-end-date")
                );
                notify("Estadísticas diarias exportadas.", "success");
                break;

            case "export-denominations":
                exportDenominationStatisticsCSV(
                    getValue("report-start-date"),
                    getValue("report-end-date")
                );
                notify("Estadísticas por denominación exportadas.", "success");
                break;

            case "add-cash-movement":
                addCashMovement({
                    type: getValue("movement-type"),
                    amount: Number(getValue("movement-amount")),
                    description: getValue("movement-description"),
                    reference: getValue("movement-reference"),
                    notes: getValue("movement-notes")
                });
                renderCash();
                notify("Movimiento registrado.", "success");
                break;

            case "delete-movement":
                if (askForConfirmation("¿Quieres eliminar este movimiento de caja?")) {
                    deleteCashMovement(id);
                    renderCash();
                    notify("Movimiento eliminado.", "success");
                }
                break;

            case "set-opening-balance":
                setOpeningBalance(Number(getValue("opening-balance-input")));
                renderCash();
                notify("Saldo inicial actualizado.", "success");
                break;

            case "register-machine":
                registerMachine({
                    name: getValue("machine-name"),
                    type: getValue("machine-type"),
                    brand: getValue("machine-brand"),
                    model: getValue("machine-model"),
                    serialNumber: getValue("machine-serial"),
                    image: getValue("machine-image"),
                    description: getValue("machine-description"),
                    connectionType: getValue("machine-connection-type"),
                    connectionDetails: getValue("machine-connection-details"),
                    protocol: getValue("machine-protocol")
                });
                persistMachineRegistry();
                renderMachines();
                notify("Máquina registrada. La conexión todavía debe verificarse.", "success");
                break;

            case "select-machine":
                setActiveMachine(id);
                renderMachines();
                notify("Máquina seleccionada.", "success");
                break;

            case "connect-machine":
                return runSafelyAsync(async () => {
                    const result = await connectMachine(id);
                    renderMachines();
                    notify(result.message, result.success ? "success" : "warning");
                });

            case "disconnect-machine":
                return runSafelyAsync(async () => {
                    const result = await disconnectMachine(id);
                    renderMachines();
                    notify(result.message, "info");
                });

            case "delete-machine":
                if (askForConfirmation("¿Quieres eliminar esta máquina del registro?")) {
                    removeMachine(id);
                    persistMachineRegistry();
                    renderMachines();
                    notify("Máquina eliminada.", "success");
                }
                break;

            case "add-denomination":
                createDenomination({
                    value: Number(getValue("new-denomination-value")),
                    label: getValue("new-denomination-label"),
                    enabled: true
                });
                renderDenominations();
                renderDenominationSettings();
                notify("Denominación añadida.", "success");
                break;

            case "toggle-denomination":
                editDenomination(id, {
                    enabled: button.dataset.enabled === "true"
                });
                renderDenominations();
                renderDenominationSettings();
                break;

            case "delete-denomination":
                if (askForConfirmation("¿Quieres eliminar esta denominación personalizada?")) {
                    deleteDenomination(id);
                    persistCurrentCount();
                    renderDenominations();
                    renderDenominationSettings();
                    notify("Denominación eliminada.", "success");
                }
                break;

            case "save-settings":
                savePreferences({
                    theme: getValue("setting-theme", getState().settings.theme),
                    language: getValue("setting-language", getState().settings.language),
                    autoSave: getChecked("setting-auto-save"),
                    confirmBeforeDelete: getChecked("setting-confirm-delete"),
                    soundEnabled: getChecked("setting-sound"),
                    hapticEnabled: getChecked("setting-haptic")
                });
                applySavedTheme();
                notify("Configuración guardada.", "success");
                break;

            case "theme-light":
                setTheme("light");
                break;

            case "theme-dark":
                setTheme("dark");
                break;

            case "theme-system":
                setTheme("system");
                break;

            case "export-backup":
                downloadBackup();
                notify("Copia de seguridad descargada.", "success");
                break;

            case "show-backup-preview": {
                const preview = getBackupPreview();
                setText("backup-preview", JSON.stringify(preview, null, 2));
                break;
            }

            case "import-backup":
                return runSafelyAsync(async () => {
                    const fileInput = getElement("backup-file");
                    const file = fileInput?.files?.[0];

                    if (!file) {
                        throw new Error("Selecciona un archivo de respaldo.");
                    }

                    const inspected = await readBackupFile(file);

                    const confirmed = globalThis.confirm(
                        `Se importará el respaldo de ${inspected.preview.application}. ¿Quieres continuar y reemplazar los datos existentes?`
                    );

                    if (!confirmed) return;

                    restoreBackup(inspected.backup, { overwrite: true });

                    notify("Respaldo importado. Recarga la aplicación para completar la restauración.", "success");
                });

            case "open-nova-apps":
                navigateTo(APP_VIEWS.NOVA_APPS);
                break;

            case "open-nova-home":
                globalThis.open(
                    "https://cumba35.github.io/Nova-APPS/",
                    "_blank",
                    "noopener,noreferrer"
                );
                break;

            case "open-receipt-preview": {
                const record = listRecords().find(item => item.id === id);

                if (!record) {
                    throw new Error("No se encontró el conteo.");
                }

                const html = generateReceiptHTML(record);
                const blob = new Blob([html], { type: "text/html;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                globalThis.open(url, "_blank", "noopener,noreferrer");
                setTimeout(() => URL.revokeObjectURL(url), 60000);
                break;
            }

            default:
                console.warn("Acción no reconocida:", action);
        }
    });
}

function handleInput(event) {
    const target = event.target;

    if (target.matches('[data-action="quantity"]')) {
        runSafely(() => handleQuantityChange(target));
    }
}

function handleChange(event) {
    const target = event.target;

    if (target.matches("[data-history-filter]")) {
        runSafely(() => {
            setHistoryFilters({
                search: getValue("history-search"),
                startDate: getValue("history-start-date"),
                endDate: getValue("history-end-date"),
                minAmount: getValue("history-min-amount") || null,
                maxAmount: getValue("history-max-amount") || null
            });

            renderHistory();
        });
    }

    if (target.id === "report-start-date" || target.id === "report-end-date") {
        renderReports();
    }

    if (target.id === "setting-theme") {
        runSafely(() => setTheme(target.value));
    }
}

function handleSubmit(event) {
    const form = event.target.closest("form");

    if (!form) return;

    if (!form.matches("[data-app-form]")) return;

    event.preventDefault();

    const action = form.dataset.appForm;

    runSafely(() => {
        switch (action) {
            case "save-count":
                saveCountFromForm();
                break;

            case "save-draft":
                saveCurrentDraft(getValue("draft-name"));
                persistCurrentCount();
                renderDrafts();
                notify("Borrador guardado.", "success");
                break;

            case "register-machine":
                registerMachine({
                    name: getValue("machine-name"),
                    type: getValue("machine-type"),
                    brand: getValue("machine-brand"),
                    model: getValue("machine-model"),
                    serialNumber: getValue("machine-serial"),
                    image: getValue("machine-image"),
                    description: getValue("machine-description"),
                    connectionType: getValue("machine-connection-type"),
                    connectionDetails: getValue("machine-connection-details"),
                    protocol: getValue("machine-protocol")
                });
                persistMachineRegistry();
                renderMachines();
                notify("Máquina registrada.", "success");
                break;

            case "add-denomination":
                createDenomination({
                    value: Number(getValue("new-denomination-value")),
                    label: getValue("new-denomination-label"),
                    enabled: true
                });
                renderDenominations();
                renderDenominationSettings();
                notify("Denominación añadida.", "success");
                break;

            default:
                console.warn("Formulario no reconocido:", action);
        }
    });
}

function handleKeyboard(event) {
    const target = event.target;

    if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
    ) {
        return;
    }

    const modifier = event.ctrlKey || event.metaKey;

    if (!modifier) return;

    const key = event.key.toLowerCase();

    if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        runSafely(() => {
            undo();
            persistCurrentCount();
            refreshCounterDisplay();
        });
    } else if (
        key === "y" ||
        (key === "z" && event.shiftKey)
    ) {
        event.preventDefault();
        runSafely(() => {
            redo();
            persistCurrentCount();
            refreshCounterDisplay();
        });
    } else if (key === "s") {
        event.preventDefault();
        runSafely(() => saveCountFromForm());
    }
}

function registerEventListeners() {
    root.addEventListener("click", handleClick);
    root.addEventListener("input", handleInput);
    root.addEventListener("change", handleChange);
    root.addEventListener("submit", handleSubmit);
    document.addEventListener("keydown", handleKeyboard);

    window.addEventListener("online", () => {
        notify("Conexión a Internet disponible.", "success");
    });

    window.addEventListener("offline", () => {
        notify("Sin conexión a Internet. Los datos locales siguen disponibles.", "warning");
    });

    window.addEventListener("beforeunload", () => {
        try {
            persistCurrentCount();
        } catch (error) {
            console.error("No se pudo guardar el conteo antes de salir:", error);
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

    const savedOpeningBalance = readStorage("settings", {})?.openingBalance;

    if (Number.isSafeInteger(savedOpeningBalance) && savedOpeningBalance >= 0) {
        setOpeningBalance(savedOpeningBalance);
    }

    const movements = readStorage("cashMovements", []);

    if (Array.isArray(movements)) {
        setState("cash.movements", movements);
    }

    const machines = listMachines();

    if (
        getState().machines.activeMachineId &&
        !machines.some(item => item.id === getState().machines.activeMachineId)
    ) {
        setState("machines.activeMachineId", null);
    }
}

function initializeNavigationLinks() {
    const currentHash = window.location.hash;

    initializeNavigation();

    if (currentHash) {
        try {
            const view = currentHash.replace(/^#/, "");
            navigateTo(view, { updateHash: false });
        } catch {
            navigateTo(APP_VIEWS.COUNTER);
        }
    }
}

function registerStateListeners() {
    const stateSubscription = getState;

    if (typeof stateSubscription !== "function") {
        return;
    }

    window.addEventListener("contador-cup:navigate", event => {
        const view = event.detail?.view;

        $$("[data-view-panel]", root).forEach(panel => {
            const active = panel.dataset.viewPanel === view;
            showElement(panel, active);
        });

        $$("[data-action='navigate']", root).forEach(button => {
            if (button.dataset.view === view) {
                button.setAttribute("aria-current", "page");
                button.classList.add("is-active");
            } else {
                button.removeAttribute("aria-current");
                button.classList.remove("is-active");
            }
        });

        const heading = getElement("page-title");

        if (heading) {
            heading.textContent = view;
        }
    });
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    if (
        location.protocol !== "https:" &&
        location.hostname !== "localhost" &&
        location.hostname !== "127.0.0.1"
    ) {
        return;
    }

    navigator.serviceWorker.register("./sw.js").catch(error => {
        console.warn("No se pudo registrar el servicio sin conexión:", error);
    });
}

export async function initializeApp() {
    if (initialized) {
        return {
            success: true,
            alreadyInitialized: true
        };
    }

    root = $(ROOT_SELECTOR);

    if (!root) {
        throw new Error(`No se encontró el elemento ${ROOT_SELECTOR}.`);
    }

    if (!checkStorageAvailability()) {
        notify(
            "El almacenamiento local no está disponible. Los datos no se pueden guardar de forma fiable.",
            "warning"
        );
    }

    initializeStoredData();
    initializeNavigationLinks();
    registerEventListeners();
    registerStateListeners();

    renderAll();

    markAppInitialized();
    initialized = true;

    if (getState().settings.autoSave) {
        persistCurrentCount();
    }

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

    return {
        success: true,
        refreshedAt: new Date().toISOString()
    };
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

function start() {
    initializeApp().catch(error => {
        console.error("Error al iniciar Contador-CUP:", error);

        if (root) {
            const errorElement = getElement("app-error");

            if (errorElement) {
                errorElement.textContent =
                    error instanceof Error ? error.message : String(error);
                showElement(errorElement, true);
            }
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
    start();
}