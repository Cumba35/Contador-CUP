// js/storage.js

import { APP_CONFIG, getStorageKey } from "./config.js";

const STORAGE_PREFIX = APP_CONFIG.storage.prefix;

function getFullKey(key) {
    return getStorageKey(key);
}

/**
 * Obtiene localStorage sin provocar errores
 * si el navegador bloquea su acceso.
 */
function getStorage() {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

/**
 * Comprueba si se puede escribir en localStorage.
 * Esta comprobación se reserva para operaciones
 * que necesitan conocer la disponibilidad de escritura.
 */
function isStorageAvailable() {
    const storage = getStorage();

    if (!storage) {
        return false;
    }

    const testKey = `${STORAGE_PREFIX}__test__`;

    try {
        storage.setItem(testKey, "1");
        storage.removeItem(testKey);

        return true;
    } catch {
        try {
            storage.removeItem(testKey);
        } catch {
            // No se pudo limpiar la clave de prueba.
        }

        return false;
    }
}

export function checkStorageAvailability() {
    return isStorageAvailable();
}

/**
 * Lee los datos sin exigir que el almacenamiento
 * tenga espacio disponible para nuevas escrituras.
 */
export function readStorage(key, fallback = null) {
    const storage = getStorage();

    if (!storage) {
        return fallback;
    }

    try {
        const raw = storage.getItem(getFullKey(key));

        if (raw === null) {
            return fallback;
        }

        return JSON.parse(raw);

    } catch (error) {
        console.error(
            `Error leyendo almacenamiento (${key}):`,
            error
        );

        return fallback;
    }
}

/**
 * Guarda datos directamente y diferencia los errores
 * de almacenamiento lleno de otros problemas.
 */
export function writeStorage(key, value) {
    const storage = getStorage();

    if (!storage) {
        throw new Error(
            "El almacenamiento local no está disponible en este dispositivo."
        );
    }

    let serialized;

    try {
        serialized = JSON.stringify(value);

        if (serialized === undefined) {
            throw new TypeError(
                "Los datos no se pueden convertir a JSON."
            );
        }

    } catch (error) {
        throw error;
    }

    try {
        storage.setItem(
            getFullKey(key),
            serialized
        );

        return true;

    } catch (error) {
        const isQuotaError =
            error?.name === "QuotaExceededError" ||
            error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
            error?.code === 22 ||
            error?.code === 1014;

        if (isQuotaError) {
            throw new Error(
                "No queda espacio suficiente para guardar los datos."
            );
        }

        if (error?.name === "SecurityError") {
            throw new Error(
                "El navegador ha bloqueado el almacenamiento local."
            );
        }

        throw error;
    }
}

/**
 * Elimina datos aunque el almacenamiento esté lleno.
 */
export function removeStorage(key) {
    const storage = getStorage();

    if (!storage) {
        return false;
    }

    try {
        storage.removeItem(getFullKey(key));

        return true;

    } catch (error) {
        console.error(
            `Error eliminando almacenamiento (${key}):`,
            error
        );

        return false;
    }
}

/**
 * Limpia únicamente las claves pertenecientes
 * a Contador-CUP.
 */
export function clearAppStorage() {
    const storage = getStorage();

    if (!storage) {
        return false;
    }

    try {
        const keysToRemove = [];

        for (
            let index = 0;
            index < storage.length;
            index++
        ) {
            const key = storage.key(index);

            if (key?.startsWith(STORAGE_PREFIX)) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(key => {
            storage.removeItem(key);
        });

        return true;

    } catch (error) {
        console.error(
            "Error limpiando los datos de la aplicación:",
            error
        );

        return false;
    }
}

/**
 * Calcula el espacio ocupado por los datos
 * de Contador-CUP, incluso cuando no queda
 * espacio para nuevas escrituras.
 */
export function getStorageUsage() {
    const storage = getStorage();

    if (!storage) {
        return {
            available: false,
            bytes: 0,
            kilobytes: 0
        };
    }

    let bytes = 0;

    try {
        for (
            let index = 0;
            index < storage.length;
            index++
        ) {
            const key = storage.key(index);

            if (!key?.startsWith(STORAGE_PREFIX)) {
                continue;
            }

            const value = storage.getItem(key) ?? "";

            bytes += new Blob([
                key,
                value
            ]).size;
        }

        return {
            available: true,
            bytes,
            kilobytes: Number(
                (bytes / 1024).toFixed(2)
            )
        };

    } catch (error) {
        console.error(
            "Error calculando el uso del almacenamiento:",
            error
        );

        return {
            available: false,
            bytes,
            kilobytes: Number(
                (bytes / 1024).toFixed(2)
            )
        };
    }
}

/**
 * Exporta todas las claves permitidas
 * para crear una copia de seguridad.
 */
export function exportStorageData() {
    const data = {};

    for (
        const key of Object.values(
            APP_CONFIG.storage.keys
        )
    ) {
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

/**
 * Importa los datos de un respaldo.
 */
export function importStorageData(backup, options = {}) {
    const {
        overwrite = false
    } = options;

    if (
        !backup ||
        typeof backup !== "object" ||
        Array.isArray(backup)
    ) {
        throw new TypeError(
            "El archivo de respaldo no tiene un formato válido."
        );
    }

    if (backup.application !== APP_CONFIG.name) {
        throw new Error(
            "El respaldo no pertenece a esta aplicación."
        );
    }

    if (
        !backup.data ||
        typeof backup.data !== "object" ||
        Array.isArray(backup.data)
    ) {
        throw new Error(
            "El respaldo no contiene datos válidos."
        );
    }

    const allowedKeys = Object.values(
        APP_CONFIG.storage.keys
    );

    const entries = Object.entries(backup.data);

    for (const [key] of entries) {
        if (!allowedKeys.includes(key)) {
            throw new Error(
                `El respaldo contiene una clave desconocida: ${key}`
            );
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
                    writeStorage(
                        key,
                        previousData[key]
                    );
                }

            } catch (rollbackError) {
                console.error(
                    "Error restaurando los datos anteriores:",
                    rollbackError
                );
            }
        }

        throw error;
    }
}