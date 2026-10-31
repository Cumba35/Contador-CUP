
// js/app.js

import { APP_CONFIG } from "./config.js";
import { getState, setState, markAppInitialized, setAppError, clearAppError } from "./state.js";
import { readStorage, writeStorage, checkStorageAvailability } from "./storage.js";
import { initializeNavigation, navigateTo, APP_VIEWS, openNovaAppsHome } from "./navigation.js";

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
    canRedo,
    clearUndoRedoHistory
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

import { compareRecords } from "./history/comparison.js";

import {
    downloadReceiptHTML,
    downloadReceiptText
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
    deleteCashMovement,
    setOpeningBalance,
    loadCashMovementsIntoState
} from "./cash/movements.js";

import {
    listMachines,
    registerMachine,
    removeMachine,
    setActiveMachine,
    loadMachinesIntoState,
    MACHINE_TYPES
} from "./machines/registry.js";

import {
    connectMachine,
    disconnectMachine,
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
    escapeHTML
} from "./utils.js";

import {
    el,
    value,
    checked,
    text,
    notify,
    safelyAsync,
    confirmAction
} from "./ui/helpers.js";

import { initializeUIEvents } from "./ui/events.js";

import { renderCounter } from "./ui/render-counter.js";

import {
    renderHistory,
    renderDrafts,
    renderComparisonOptions,
    renderComparisonResult
} from "./ui/render-history.js";

import { renderReports } from "./ui/render-reports.js";
import { renderCash } from "./ui/render-cash.js";
import { renderMachines } from "./ui/render-machines.js";
import { renderDenominationSettings } from "./ui/render-settings.js";

let initialized = false;
let removeUIEvents = null;

function persistCurrentCount() {
    const counter = getState().counter;

    writeStorage("currentCount", {
        quantities: counter.quantities,
        total: counter.total,
        draftId: counter.draftId,
        draftName: counter.draftName,
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

function renderAll() {
    renderCounter();
    renderDrafts();
    renderHistory();
    renderComparisonOptions();
    renderReports();
    renderCash();
    renderMachines();
    renderDenominationSettings();
    updateNavigation();
    updateUndoButtons();
}

function updateUndoButtons() {
    const undoButton = el("undo-button");
    const redoButton = el("redo-button");

    if (undoButton) {
        undoButton.disabled = !canUndo();
    }

    if (redoButton) {
        redoButton.disabled = !canRedo();
    }
}

function updateNavigation() {
    const currentView = getState().app.currentView;

    document.querySelectorAll("[data-view-panel]").forEach(panel => {
        panel.hidden = panel.dataset.viewPanel !== currentView;
    });

    document.querySelectorAll('[data-action="navigate"]').forEach(button => {
        const active = button.dataset.view === currentView;

        button.classList.toggle("is-active", active);

        if (active) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });

    const activePanel = document.querySelector(
        `[data-view-panel="${CSS.escape(currentView)}"]`
    );

    const heading = activePanel?.querySelector("h2");

    if (heading && el("page-title")) {
        el("page-title").textContent = heading.textContent;
    }
}

function navigate(view) {
    navigateTo(view);
    updateNavigation();

    if (view === APP_VIEWS.COUNTER) {
        renderCounter();
    } else if (view === APP_VIEWS.DRAFTS) {
        renderDrafts();
    } else if (view === APP_VIEWS.HISTORY) {
        renderHistory();
    } else if (view === APP_VIEWS.COMPARISON) {
        renderComparisonOptions();
    } else if (view === APP_VIEWS.REPORTS) {
        renderReports();
    } else if (view === APP_VIEWS.CASH) {
        renderCash();
    } else if (view === APP_VIEWS.MACHINES) {
        renderMachines();
    } else if (view === APP_VIEWS.DENOMINATIONS) {
        renderDenominationSettings();
    }
}

function updateHistoryFilters() {
    setHistoryFilters({
        search: value("history-search"),
        startDate: value("history-start-date"),
        endDate: value("history-end-date"),
        minAmount: value("history-min-amount"),
        maxAmount: value("history-max-amount")
    });

    renderHistory();
}

function updateQuantityInput(input) {
    const id = input.dataset.id;

    if (!id) {
        return;
    }

    const quantity = Number(input.value);

    if (
        !Number.isSafeInteger(quantity) ||
        quantity < 0 ||
        quantity > APP_CONFIG.limits.denominationQuantity
    ) {
        input.setCustomValidity("Introduce una cantidad entera válida.");
        input.reportValidity();
        return;
    }

    input.setCustomValidity("");

    captureUndoState();
    setQuantity(id, quantity);
    persistCurrentCount();

    const denomination = getState().denominations.find(
        item => item.id === id
    );

    if (denomination) {
        text(
            `subtotal-${id}`,
            formatCurrency(denomination.value * quantity)
        );
    }

    const summary = getCounterSummary();

    text("counter-total", formatCurrency(summary.total));
    text("counter-bills", formatNumber(summary.totalBills, 0));

    updateUndoButtons();
}

function handleInput(event) {
    const target = event.target;

    if (target.matches('[data-action="quantity"]')) {
        updateQuantityInput(target);
        return;
    }

    const historyFields = [
        "history-search",
        "history-start-date",
        "history-end-date",
        "history-min-amount",
        "history-max-amount"
    ];

    if (historyFields.includes(target.id)) {
        safelyAsync(async () => updateHistoryFilters());
    }
}

function handleChange(event) {
    const target = event.target;

    if (target.matches('[data-action="quantity"]')) {
        updateQuantityInput(target);
    }

    if (
        target.id === "report-start-date" ||
        target.id === "report-end-date"
    ) {
        renderReports();
    }
}

function getFormData(form) {
    const formName = form.dataset.appForm;

    switch (formName) {
        case "save-count":
            return {
                name: value("count-name"),
                notes: value("count-notes")
            };

        case "save-draft":
            return {
                name: value("draft-name")
            };

        case "add-cash-movement":
            return {
                type: value("movement-type"),
                amount: value("movement-amount"),
                description: value("movement-description"),
                reference: value("movement-reference"),
                notes: value("movement-notes")
            };

        case "register-machine": {
            const typeMap = {
                counter: MACHINE_TYPES.BILL_COUNTER,
                detector: MACHINE_TYPES.COUNTERFEIT_DETECTOR,
                sorter: MACHINE_TYPES.BILL_SORTER,
                other: MACHINE_TYPES.OTHER
            };

            return {
                name: value("machine-name"),
                type: typeMap[value("machine-type")] ?? value("machine-type"),
                brand: value("machine-brand"),
                model: value("machine-model"),
                serialNumber: value("machine-serial"),

                // El campo es de tipo archivo. No se debe guardar
                // su ruta temporal como si fuera una imagen válida.
                image: "",

                connectionType: value("machine-connection-type", "unknown"),
                connectionDetails: value("machine-connection-details"),
                protocol: value("machine-protocol"),
                description: value("machine-description")
            };
        }

        case "add-denomination":
            return {
                value: value("new-denomination-value"),
                label: value("new-denomination-label")
            };

        case "save-settings":
            return {
                theme: value("setting-theme", "system"),
                language: value("setting-language", "es"),
                autoSave: checked("setting-auto-save"),
                confirmBeforeDelete: checked("setting-confirm-delete"),
                soundEnabled: checked("setting-sound"),
                hapticEnabled: checked("setting-haptic")
            };

        default:
            return null;
    }
}

async function handleFormSubmit(event) {
    const form = event.target.closest("form[data-app-form]");

    if (!form) {
        return;
    }

    event.preventDefault();

    await safelyAsync(async () => {
        const formName = form.dataset.appForm;
        const data = getFormData(form);

        if (!data) {
            throw new Error("No se reconoce este formulario.");
        }

        switch (formName) {
            case "save-count": {
                const record = saveCurrentCount(data);

                renderHistory();
                renderReports();

                notify(
                    `Conteo guardado: ${formatCurrency(record.total)}.`,
                    "success"
                );

                form.reset();
                break;
            }

            case "save-draft": {
                saveCurrentDraft(data.name);

                persistCurrentCount();
                renderDrafts();
                renderCounter();

                notify("Borrador guardado.", "success");
                break;
            }

            case "add-cash-movement":
                addCashMovement(data);
                renderCash();
                form.reset();
                notify("Movimiento registrado.", "success");
                break;

            case "register-machine":
                registerMachine(data);
                persistMachineRegistry();
                renderMachines();
                form.reset();
                notify("Máquina registrada.", "success");
                break;

            case "add-denomination":
                createDenomination(data);
                renderDenominationSettings();
                renderCounter();
                form.reset();
                notify("Denominación añadida.", "success");
                break;

            case "save-settings":
                savePreferences(data);
                applySavedTheme();
                notify("Configuración guardada.", "success");
                break;

            default:
                throw new Error("Acción de formulario desconocida.");
        }
    });
}

async function copyDonationValue(inputId, description) {
    const input = el(inputId);
    const content = input?.value?.trim();

    if (!content) {
        throw new Error(`No se encontró ${description}.`);
    }

    if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
    } else {
        const temporaryInput = document.createElement("textarea");

        temporaryInput.value = content;
        temporaryInput.setAttribute("readonly", "");
        temporaryInput.style.position = "fixed";
        temporaryInput.style.opacity = "0";
        temporaryInput.style.pointerEvents = "none";

        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        temporaryInput.setSelectionRange(0, temporaryInput.value.length);

        const copied = document.execCommand("copy");
        temporaryInput.remove();

        if (!copied) {
            throw new Error(
                "No se pudo copiar. Selecciona y copia el dato manualmente."
            );
        }
    }

    notify(`${description} copiado.`, "success");
}

async function handleClick(event) {
    const button = event.target.closest("[data-action]");

    if (!button || button.disabled) {
        return;
    }

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

            case "save-draft-as-new":
                saveDraftAsNew(value("draft-name"));
                persistCurrentCount();
                renderDrafts();
                renderCounter();
                notify("Nuevo borrador guardado.", "success");
                break;

            case "load-draft":
                loadDraft(id);
                persistCurrentCount();
                renderCounter();
                navigate(APP_VIEWS.COUNTER);
                notify("Borrador cargado.", "success");
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

            case "receipt-record":
                downloadReceiptHTML(id);
                break;

            case "receipt-text":
                downloadReceiptText(id);
                break;

            case "compare-records": {
                const firstId = value("comparison-record-a");
                const secondId = value("comparison-record-b");

                if (!firstId || !secondId) {
                    throw new Error(
                        "Selecciona los dos conteos que deseas comparar."
                    );
                }

                renderComparisonResult(
                    compareRecords(firstId, secondId)
                );
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

                const approved = confirmAction(
                    `Se importará el respaldo de ${inspected.preview.application}. ¿Quieres reemplazar los datos existentes?`
                );

                if (!approved) {
                    break;
                }

                restoreBackup(inspected.backup, {
                    overwrite: true
                });

                notify(
                    "Respaldo restaurado. La aplicación se recargará.",
                    "success"
                );

                globalThis.setTimeout(() => {
                    globalThis.location.reload();
                }, 800);

                break;
            }

            case "copy-donation-card":
                await copyDonationValue(
                    "donation-card",
                    "Número de tarjeta"
                );
                break;

            case "copy-donation-phone":
                await copyDonationValue(
                    "donation-phone",
                    "Número de teléfono"
                );
                break;

            case "open-nova-home":
                openNovaAppsHome();
                break;

            default:
                break;
        }
    });
}

/**
 * Recupera el saldo inicial sin sobrescribir el valor guardado
 * en el formato nuevo de cashMovements.
 */
function loadOpeningBalance() {
    const savedSettings = readStorage("settings", {});
    const savedCash = readStorage("cashMovements", null);

    const isValidAmount = value => {
        if (value === undefined || value === null || value === "") {
            return false;
        }

        const amount = Number(value);

        return (
            Number.isFinite(amount) &&
            amount >= 0 &&
            amount <= 999999999999.99
        );
    };

    let amount;

    // El objeto nuevo de caja tiene prioridad sobre settings.
    if (
        savedCash &&
        !Array.isArray(savedCash) &&
        typeof savedCash === "object" &&
        isValidAmount(savedCash.openingBalance)
    ) {
        amount = Number(savedCash.openingBalance);
    } else if (isValidAmount(savedSettings?.openingBalance)) {
        // Compatibilidad con respaldos antiguos.
        amount = Number(savedSettings.openingBalance);
    } else if (isValidAmount(getState().cash?.openingBalance)) {
        amount = Number(getState().cash.openingBalance);
    } else {
        amount = 0;
    }

    setOpeningBalance(amount);

    const input = el("opening-balance-input");

    if (input) {
        input.value = String(getState().cash.openingBalance);
    }
}

function loadSettingsIntoControls() {
    const settings = getState().settings;

    const controls = {
        "setting-theme": settings.theme,
        "setting-language": settings.language
    };

    for (const [id, setting] of Object.entries(controls)) {
        if (el(id)) {
            el(id).value = setting;
        }
    }

    const checkboxes = {
        "setting-auto-save": settings.autoSave,
        "setting-confirm-delete": settings.confirmBeforeDelete,
        "setting-sound": settings.soundEnabled,
        "setting-haptic": settings.hapticEnabled
    };

    for (const [id, setting] of Object.entries(checkboxes)) {
        if (el(id)) {
            el(id).checked = Boolean(setting);
        }
    }
}

function showStorageWarning() {
    if (!checkStorageAvailability()) {
        notify(
            "El almacenamiento local no está disponible. Los datos no podrán guardarse.",
            "error"
        );
    }
}

function initializeApplication() {
    if (initialized) {
        return;
    }

    initialized = true;

    try {
        loadPreferencesIntoState();
        loadDenominationsIntoState();
        restoreCurrentCount();

        loadHistoryIntoState();
        loadCashMovementsIntoState();
        loadMachinesIntoState();
        loadOpeningBalance();

        initializeNavigation();
        applySavedTheme();
        loadSettingsIntoControls();

        const capabilities = getConnectionCapabilities();

        text(
            "machine-connection-capabilities",
            capabilities.note
        );

        removeUIEvents = initializeUIEvents({
            onClick: handleClick,
            onInput: handleInput,
            onChange: handleChange
        });

        document.addEventListener("submit", handleFormSubmit);

        renderAll();

        markAppInitialized();
        clearAppError();

        showStorageWarning();

    } catch (error) {
        initialized = false;

        const message = error instanceof Error
            ? error.message
            : String(error);

        setAppError(message);

        const errorElement = el("app-error");

        if (errorElement) {
            errorElement.textContent = message;
            errorElement.hidden = false;
        }

        notify(message, "error");

        console.error("Error al iniciar Contador-CUP:", error);
    }
}

function cleanupApplication() {
    if (removeUIEvents) {
        removeUIEvents();
        removeUIEvents = null;
    }

    document.removeEventListener("submit", handleFormSubmit);
    initialized = false;
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeApplication,
        { once: true }
    );
} else {
    initializeApplication();
}

globalThis.addEventListener?.("pagehide", cleanupApplication);
