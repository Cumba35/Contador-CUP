
// js/storage.js

import { APP_CONFIG, getStorageKey } from "./config.js";

const STORAGE_PREFIX = APP_CONFIG.storage.prefix;

const LEGACY_KEYS = Object.freeze({
    theme: "temaOscuroCUP",
    denominations: "denominacionesCUP",
    history: "historialCUP",
    quantities: "cantidadesActualesCUP"
});

function getFullKey(key) {
    return getStorageKey(key);
}

function getStorage() {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

function parseJSON(raw, fallback = null) {
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function readLegacyValue(storage, key) {
    try {
        const raw = storage.getItem(key);

        if (raw === null) {
            return null;
        }

        return parseJSON(raw, raw);
    } catch {
        return null;
    }
}

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function migrateLegacySettings(storage, migrated) {
    const value = readLegacyValue(
        storage,
        LEGACY_KEYS.theme
    );

    if (value === null) {
        return;
    }

    const targetKey = getFullKey("settings");

    if (storage.getItem(targetKey) !== null) {
        return;
    }

    let theme;

    if (typeof value === "boolean") {
        theme = value ? "dark" : "light";
    } else if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();

        if (
            normalized === "true" ||
            normalized === "dark"
        ) {
            theme = "dark";
        } else if (
            normalized === "false" ||
            normalized === "light"
        ) {
            theme = "light";
        }
    }

    if (!theme) {
        return;
    }

    writeStorage("settings", {
        ...APP_CONFIG.defaults,
        theme
    });

    migrated.push("settings");
}

function migrateLegacyDenominations(storage, migrated) {
    const value = readLegacyValue(
        storage,
        LEGACY_KEYS.denominations
    );

    if (!Array.isArray(value)) {
        return;
    }

    const targetKey = getFullKey("denominations");

    if (storage.getItem(targetKey) !== null) {
        return;
    }

    if (value.length === 0) {
        return;
    }

    writeStorage("denominations", value);

    migrated.push("denominations");
}

function migrateLegacyHistory(storage, migrated) {
    const value = readLegacyValue(
        storage,
        LEGACY_KEYS.history
    );

    if (!Array.isArray(value)) {
        return;
    }

    const targetKey = getFullKey("history");

    if (storage.getItem(targetKey) !== null) {
        return;
    }

    writeStorage("history", value);

    migrated.push("history");
}

function migrateLegacyQuantities(storage, migrated) {
    const value = readLegacyValue(
        storage,
        LEGACY_KEYS.quantities
    );

    if (!isPlainObject(value)) {
        return;
    }

    const targetKey = getFullKey("currentCount");

    if (storage.getItem(targetKey) !== null) {
        return;
    }

    const quantities = {};

    for (const [id, quantity] of Object.entries(value)) {
        const parsed = Number(quantity);

        if (
            !Number.isSafeInteger(parsed) ||
            parsed < 0
        ) {
            continue;
        }

        quantities[id] = parsed;
    }

    if (Object.keys(quantities).length === 0) {
        return;
    }

    writeStorage("currentCount", {
        quantities,
        total: 0,
        draftId: null,
        draftName: "",
        savedAt: new Date().toISOString()
    });

    migrated.push("currentCount");
}

/**
 * Recupera datos de versiones antiguas.
 *
 * Las claves originales permanecen intactas
 * para evitar pérdidas durante la migración.
 */
export function migrateLegacyStorage() {
    const storage = getStorage();

    if (!storage) {
        return {
            success: false,
            migrated: [],
            reason: "storage-unavailable"
        };
    }

    const migrated = [];

    try {
        migrateLegacySettings(storage, migrated);
        migrateLegacyDenominations(storage, migrated);
        migrateLegacyHistory(storage, migrated);
        migrateLegacyQuantities(storage, migrated);

        return {
            success: true,
            migrated
        };
    } catch (error) {
        console.error(
            "Error durante la migración de datos antiguos:",
            error
        );

        return {
            success: false,
            migrated,
            error
        };
    }
}

/**
 * Obtiene localStorage sin provocar errores
 * si el navegador bloquea su acceso.
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
 * de Contador-CUP.
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

// La migración se ejecuta al cargar el módulo,
// antes de que app.js inicialice los datos.
migrateLegacyStorage();
