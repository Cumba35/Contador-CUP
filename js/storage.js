// js/storage.js

import { APP_CONFIG, getStorageKey } from "./config.js";

const STORAGE_PREFIX = APP_CONFIG.storage.prefix;

function getFullKey(key) {
    return getStorageKey(key);
}

function isStorageAvailable() {
    try {
        const testKey = `${STORAGE_PREFIX}__test__`;
        localStorage.setItem(testKey, "1");
        localStorage.removeItem(testKey);
        return true;
    } catch {
        return false;
    }
}

export function checkStorageAvailability() {
    return isStorageAvailable();
}

export function readStorage(key, fallback = null) {
    if (!isStorageAvailable()) {
        return fallback;
    }

    try {
        const raw = localStorage.getItem(getFullKey(key));

        if (raw === null) {
            return fallback;
        }

        return JSON.parse(raw);
    } catch (error) {
        console.error(`Error leyendo almacenamiento (${key}):`, error);
        return fallback;
    }
}

export function writeStorage(key, value) {
    if (!isStorageAvailable()) {
        throw new Error(
            "El almacenamiento local no está disponible en este dispositivo."
        );
    }

    try {
        const serialized = JSON.stringify(value);

        if (serialized === undefined) {
            throw new TypeError("Los datos no se pueden convertir a JSON.");
        }

        localStorage.setItem(getFullKey(key), serialized);

        return true;
    } catch (error) {
        if (error instanceof DOMException && error.name === "QuotaExceededError") {
            throw new Error(
                "No queda espacio suficiente para guardar los datos."
            );
        }

        throw error;
    }
}

export function removeStorage(key) {
    if (!isStorageAvailable()) {
        return false;
    }

    try {
        localStorage.removeItem(getFullKey(key));
        return true;
    } catch (error) {
        console.error(`Error eliminando almacenamiento (${key}):`, error);
        return false;
    }
}

export function clearAppStorage() {
    if (!isStorageAvailable()) {
        return false;
    }

    try {
        const keysToRemove = [];

        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);

            if (key?.startsWith(STORAGE_PREFIX)) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(key => localStorage.removeItem(key));

        return true;
    } catch (error) {
        console.error("Error limpiando los datos de la aplicación:", error);
        return false;
    }
}

export function getStorageUsage() {
    if (!isStorageAvailable()) {
        return {
            available: false,
            bytes: 0,
            kilobytes: 0
        };
    }

    let bytes = 0;

    try {
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);

            if (key?.startsWith(STORAGE_PREFIX)) {
                const value = localStorage.getItem(key) ?? "";
                bytes += new Blob([key, value]).size;
            }
        }
    } catch (error) {
        console.error("Error calculando el uso del almacenamiento:", error);
    }

    return {
        available: true,
        bytes,
        kilobytes: Number((bytes / 1024).toFixed(2))
    };
}

export function exportStorageData() {
    const data = {};

    for (const key of Object.values(APP_CONFIG.storage.keys)) {
        data[key] = readStorage(key, null);
    }

    return {
        application: APP_CONFIG.name,
        version: APP_CONFIG.version,
        schemaVersion: APP_CONFIG.storage.currentVersion,
        exportedAt: new Date().toISOString(),
        data
    };
}

export function importStorageData(backup, options = {}) {
    const { overwrite = false } = options;

    if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
        throw new TypeError("El archivo de respaldo no tiene un formato válido.");
    }

    if (backup.application !== APP_CONFIG.name) {
        throw new Error("El respaldo no pertenece a esta aplicación.");
    }

    if (
        !backup.data ||
        typeof backup.data !== "object" ||
        Array.isArray(backup.data)
    ) {
        throw new Error("El respaldo no contiene datos válidos.");
    }

    const allowedKeys = Object.values(APP_CONFIG.storage.keys);
    const entries = Object.entries(backup.data);

    for (const [key] of entries) {
        if (!allowedKeys.includes(key)) {
            throw new Error(`El respaldo contiene una clave desconocida: ${key}`);
        }
    }

    if (!overwrite) {
        const containsExistingData = allowedKeys.some(key => {
            return readStorage(key, null) !== null;
        });

        if (containsExistingData) {
            throw new Error(
                "Ya existen datos guardados. Confirma la sobrescritura para continuar."
            );
        }
    }

    const previousData = {};

    for (const key of allowedKeys) {
        previousData[key] = readStorage(key, null);
    }

    try {
        for (const [key, value] of entries) {
            writeStorage(key, value);
        }

        return {
            success: true,
            importedKeys: entries.length
        };
    } catch (error) {
        for (const key of allowedKeys) {
            try {
                if (previousData[key] === null) {
                    removeStorage(key);
                } else {
                    writeStorage(key, previousData[key]);
                }
            } catch (rollbackError) {
                console.error("Error restaurando los datos anteriores:", rollbackError);
            }
        }

        throw error;
    }
}