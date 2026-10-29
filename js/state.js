// js/state.js

import { APP_CONFIG } from "./config.js";

function cloneData(value) {
    return structuredClone(value);
}

function createInitialState() {
    return {
        app: {
            initialized: false,
            currentView: "counter",
            lastError: null
        },

        settings: {
            ...APP_CONFIG.defaults
        },

        denominations: APP_CONFIG.denominations.map(item => ({
            ...item
        })),

        counter: {
            quantities: {},
            total: 0,
            draftName: "",
            draftId: null,
            isDirty: false
        },

        history: {
            records: [],
            filters: {
                search: "",
                startDate: "",
                endDate: "",
                minAmount: null,
                maxAmount: null
            },
            selectedIds: []
        },

        cash: {
            openingBalance: 0,
            movements: [],
            currentBalance: 0
        },

        machines: {
            registry: [],
            activeMachineId: null,
            connectionStatus: "disconnected"
        },

        reports: {
            startDate: "",
            endDate: "",
            generatedAt: null
        },

        backup: {
            lastExportAt: null,
            lastImportAt: null,
            processing: false
        },

        ui: {
            sidebarOpen: false,
            modal: null,
            toast: null,
            loading: false
        }
    };
}

let state = createInitialState();

const listeners = new Set();

export function getState() {
    return state;
}

export function getStateSnapshot() {
    return cloneData(state);
}

export function subscribe(listener) {
    if (typeof listener !== "function") {
        throw new TypeError("El suscriptor debe ser una función.");
    }

    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

function notify(change) {
    for (const listener of listeners) {
        try {
            listener(state, change);
        } catch (error) {
            console.error("Error en un suscriptor del estado:", error);
        }
    }
}

function getNestedValue(object, path) {
    return path.split(".").reduce((current, key) => {
        if (current === null || current === undefined) {
            return undefined;
        }

        return current[key];
    }, object);
}

function setNestedValue(object, path, value) {
    const keys = path.split(".");
    const finalKey = keys.pop();

    const target = keys.reduce((current, key) => {
        if (
            current[key] === null ||
            typeof current[key] !== "object"
        ) {
            current[key] = {};
        }

        return current[key];
    }, object);

    target[finalKey] = value;
}

export function setState(path, value) {
    if (typeof path !== "string" || !path.trim()) {
        throw new TypeError("La ruta del estado no es válida.");
    }

    const previousValue = getNestedValue(state, path);
    const nextValue = typeof value === "function"
        ? value(previousValue)
        : value;

    if (Object.is(previousValue, nextValue)) {
        return nextValue;
    }

    setNestedValue(state, path, nextValue);

    notify({
        type: "update",
        path,
        previousValue,
        value: nextValue
    });

    return nextValue;
}

export function updateState(updater) {
    if (typeof updater !== "function") {
        throw new TypeError("El actualizador debe ser una función.");
    }

    const nextState = updater(getStateSnapshot());

    if (
        !nextState ||
        typeof nextState !== "object" ||
        Array.isArray(nextState)
    ) {
        throw new TypeError("El estado actualizado no es válido.");
    }

    state = nextState;

    notify({
        type: "replace",
        path: null,
        value: state
    });

    return state;
}

export function resetState() {
    state = createInitialState();

    notify({
        type: "reset",
        path: null,
        value: state
    });

    return state;
}

export function markAppInitialized() {
    return setState("app.initialized", true);
}

export function setAppError(error) {
    const message = error instanceof Error
        ? error.message
        : String(error ?? "Error desconocido");

    return setState("app.lastError", message);
}

export function clearAppError() {
    return setState("app.lastError", null);
}