// js/settings/preferences.js

import { APP_CONFIG } from "../config.js";
import { getState, setState } from "../state.js";
import { readStorage, writeStorage } from "../storage.js";

const STORAGE_KEY = "settings";

const ALLOWED_THEMES = ["light", "dark", "system"];
const ALLOWED_LANGUAGES = ["es", "en"];

function validateSettings(settings) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
        throw new TypeError("La configuración no es válida.");
    }

    const normalized = {
        ...APP_CONFIG.defaults,
        ...settings
    };

    if (!ALLOWED_THEMES.includes(normalized.theme)) {
        throw new Error("Selecciona un tema válido.");
    }

    if (!ALLOWED_LANGUAGES.includes(normalized.language)) {
        throw new Error("Selecciona un idioma compatible.");
    }

    if (
        !Number.isInteger(normalized.decimalPlaces) ||
        normalized.decimalPlaces < 0 ||
        normalized.decimalPlaces > 4
    ) {
        throw new Error("Los decimales deben estar entre 0 y 4.");
    }

    if (
        !Number.isInteger(normalized.historyLimit) ||
        normalized.historyLimit < 10 ||
        normalized.historyLimit > 10000
    ) {
        throw new Error("El límite del historial debe estar entre 10 y 10000.");
    }

    if (
        !Number.isInteger(normalized.maximumUndoSteps) ||
        normalized.maximumUndoSteps < 1 ||
        normalized.maximumUndoSteps > 500
    ) {
        throw new Error("El límite de deshacer debe estar entre 1 y 500.");
    }

    for (const key of [
        "autoSave",
        "confirmBeforeDelete",
        "soundEnabled",
        "hapticEnabled"
    ]) {
        normalized[key] = Boolean(normalized[key]);
    }

    return normalized;
}

export function getPreferences() {
    const saved = readStorage(STORAGE_KEY, {});
    const current = getState().settings;

    return {
        ...APP_CONFIG.defaults,
        ...(saved && typeof saved === "object" ? saved : {}),
        ...current
    };
}

export function savePreferences(changes = {}) {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
        throw new TypeError("Los cambios de configuración no son válidos.");
    }

    const next = validateSettings({
        ...getPreferences(),
        ...changes
    });

    writeStorage(STORAGE_KEY, next);
    setState("settings", next);

    return { ...next };
}

export function updatePreference(key, value) {
    const allowedKeys = Object.keys(APP_CONFIG.defaults);

    if (!allowedKeys.includes(key)) {
        throw new Error(`La preferencia "${key}" no está permitida.`);
    }

    return savePreferences({ [key]: value });
}

export function resetPreferences() {
    const defaults = { ...APP_CONFIG.defaults };

    writeStorage(STORAGE_KEY, defaults);
    setState("settings", defaults);

    return { ...defaults };
}

export function loadPreferencesIntoState() {
    const saved = readStorage(STORAGE_KEY, {});
    const merged = validateSettings({
        ...APP_CONFIG.defaults,
        ...(saved && typeof saved === "object" ? saved : {})
    });

    setState("settings", merged);

    return { ...merged };
}

export function applyTheme(theme = getPreferences().theme, root = document.documentElement) {
    if (!ALLOWED_THEMES.includes(theme)) {
        throw new Error("El tema seleccionado no es válido.");
    }

    const systemPrefersDark = globalThis.matchMedia?.(
        "(prefers-color-scheme: dark)"
    ).matches ?? false;

    const resolvedTheme = theme === "system"
        ? (systemPrefersDark ? "dark" : "light")
        : theme;

    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;

    return {
        requestedTheme: theme,
        resolvedTheme
    };
}

export function applySavedTheme() {
    const theme = getPreferences().theme;
    return applyTheme(theme);
}

export function setTheme(theme) {
    const preferences = savePreferences({ theme });
    const result = applyTheme(preferences.theme);

    return {
        ...preferences,
        resolvedTheme: result.resolvedTheme
    };
}

export function getAvailableThemes() {
    return [
        { value: "system", label: "Según el dispositivo" },
        { value: "light", label: "Claro" },
        { value: "dark", label: "Oscuro" }
    ];
}

export function getAvailableLanguages() {
    return [
        { value: "es", label: "Español" },
        { value: "en", label: "English" }
    ];
}

export function getPreferenceSummary() {
    const preferences = getPreferences();

    return {
        theme: preferences.theme,
        language: preferences.language,
        autoSave: preferences.autoSave,
        confirmBeforeDelete: preferences.confirmBeforeDelete,
        soundEnabled: preferences.soundEnabled,
        hapticEnabled: preferences.hapticEnabled,
        historyLimit: preferences.historyLimit,
        maximumUndoSteps: preferences.maximumUndoSteps
    };
}