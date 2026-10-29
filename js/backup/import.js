// js/backup/import.js

import { APP_CONFIG } from "../config.js";
import {
    importStorageData,
    readStorage,
    writeStorage
} from "../storage.js";
import { setState } from "../state.js";

const MAX_FILE_BYTES = APP_CONFIG.limits.importedFileBytes;
const ALLOWED_FORMATS = new Set([
    "contador-cup-backup",
    undefined
]);

function validateBackup(backup) {
    if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
        throw new Error("El archivo no contiene un respaldo válido.");
    }

    if (backup.application !== APP_CONFIG.name) {
        throw new Error("El archivo no pertenece a Contador-CUP.");
    }

    if (!backup.data || typeof backup.data !== "object" || Array.isArray(backup.data)) {
        throw new Error("El respaldo no contiene datos válidos.");
    }

    if (!ALLOWED_FORMATS.has(backup.format)) {
        throw new Error("El formato del respaldo no es compatible.");
    }

    if (
        backup.schemaVersion !== undefined &&
        (!Number.isInteger(backup.schemaVersion) ||
            backup.schemaVersion < 1 ||
            backup.schemaVersion > APP_CONFIG.storage.currentVersion)
    ) {
        throw new Error("La versión del respaldo no es compatible con esta aplicación.");
    }

    const allowedKeys = Object.values(APP_CONFIG.storage.keys);

    for (const key of Object.keys(backup.data)) {
        if (!allowedKeys.includes(key)) {
            throw new Error(`El respaldo contiene una sección desconocida: ${key}`);
        }
    }

    return true;
}

function normalizeImportedData(backup) {
    const data = { ...backup.data };

    if (data.settings !== undefined) {
        if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) {
            throw new Error("La configuración del respaldo no es válida.");
        }
    }

    if (data.denominations !== undefined && !Array.isArray(data.denominations)) {
        throw new Error("La lista de denominaciones del respaldo no es válida.");
    }

    if (data.history !== undefined && !Array.isArray(data.history)) {
        throw new Error("El historial del respaldo no es válido.");
    }

    if (data.drafts !== undefined && !Array.isArray(data.drafts)) {
        throw new Error("La lista de borradores del respaldo no es válida.");
    }

    if (data.cashMovements !== undefined && !Array.isArray(data.cashMovements)) {
        throw new Error("Los movimientos de caja del respaldo no son válidos.");
    }

    if (data.machines !== undefined && !Array.isArray(data.machines)) {
        throw new Error("El registro de máquinas del respaldo no es válido.");
    }

    return {
        ...backup,
        data
    };
}

export function inspectBackupObject(backup) {
    validateBackup(backup);

    const normalized = normalizeImportedData(backup);
    const data = normalized.data;

    return {
        valid: true,
        application: APP_CONFIG.fullName,
        version: backup.version ?? "desconocida",
        schemaVersion: backup.schemaVersion ?? "no especificada",
        exportedAt: backup.exportedAt ?? null,
        format: backup.format ?? "formato anterior",
        sections: Object.keys(data),
        summary: {
            denominations: Array.isArray(data.denominations) ? data.denominations.length : 0,
            drafts: Array.isArray(data.drafts) ? data.drafts.length : 0,
            history: Array.isArray(data.history) ? data.history.length : 0,
            cashMovements: Array.isArray(data.cashMovements) ? data.cashMovements.length : 0,
            machines: Array.isArray(data.machines) ? data.machines.length : 0
        }
    };
}

export async function readBackupFile(file) {
    if (!(file instanceof Blob)) {
        throw new TypeError("Selecciona un archivo de respaldo válido.");
    }

    if (file.size <= 0) {
        throw new Error("El archivo está vacío.");
    }

    if (file.size > MAX_FILE_BYTES) {
        throw new Error(
            `El archivo supera el límite permitido de ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`
        );
    }

    const filename = typeof file.name === "string" ? file.name : "";

    if (filename && !filename.toLowerCase().endsWith(".json")) {
        throw new Error("Selecciona un archivo de respaldo con extensión .json.");
    }

    let parsed;

    try {
        parsed = JSON.parse(await file.text());
    } catch {
        throw new Error("No se pudo leer el archivo JSON. Comprueba que no esté dañado.");
    }

    validateBackup(parsed);

    return {
        backup: normalizeImportedData(parsed),
        preview: inspectBackupObject(parsed),
        filename,
        sizeBytes: file.size
    };
}

export function restoreBackup(backup, options = {}) {
    const { overwrite = false } = options;

    validateBackup(backup);

    const normalizedBackup = normalizeImportedData(backup);

    const result = importStorageData(normalizedBackup, {
        overwrite
    });

    const settings = readStorage("settings", null);
    const denominations = readStorage("denominations", null);
    const history = readStorage("history", []);
    const cashMovements = readStorage("cashMovements", []);
    const machines = readStorage("machines", []);

    if (settings && typeof settings === "object") {
        setState("settings", {
            ...APP_CONFIG.defaults,
            ...settings
        });
    }

    if (Array.isArray(denominations)) {
        setState("denominations", denominations);
    }

    if (Array.isArray(history)) {
        setState("history.records", history);
    }

    if (Array.isArray(cashMovements)) {
        setState("cash.movements", cashMovements);
    }

    if (Array.isArray(machines)) {
        setState("machines.registry", machines);
    }

    setState("backup.lastImportAt", new Date().toISOString());

    return {
        success: true,
        importedKeys: result.importedKeys,
        importedAt: new Date().toISOString(),
        requiresReload: true
    };
}

export async function restoreBackupFile(file, options = {}) {
    const inspected = await readBackupFile(file);

    return {
        ...restoreBackup(inspected.backup, options),
        filename: inspected.filename,
        preview: inspected.preview
    };
}

export function createRestorePoint() {
    const snapshot = {};

    for (const key of Object.values(APP_CONFIG.storage.keys)) {
        snapshot[key] = readStorage(key, null);
    }

    return {
        application: APP_CONFIG.name,
        createdAt: new Date().toISOString(),
        data: snapshot
    };
}

export function restoreRestorePoint(restorePoint) {
    if (
        !restorePoint ||
        restorePoint.application !== APP_CONFIG.name ||
        !restorePoint.data ||
        typeof restorePoint.data !== "object"
    ) {
        throw new Error("El punto de restauración no es válido.");
    }

    const allowedKeys = Object.values(APP_CONFIG.storage.keys);
    const previousValues = {};

    for (const key of allowedKeys) {
        previousValues[key] = readStorage(key, null);
    }

    try {
        for (const key of allowedKeys) {
            const value = restorePoint.data[key];

            if (value === null || value === undefined) {
                continue;
            }

            writeStorage(key, value);
        }
    } catch (error) {
        for (const key of allowedKeys) {
            try {
                if (previousValues[key] !== null) {
                    writeStorage(key, previousValues[key]);
                }
            } catch (rollbackError) {
                console.error("No se pudo restaurar un dato anterior:", rollbackError);
            }
        }

        throw error;
    }

    return {
        success: true,
        restoredAt: new Date().toISOString(),
        requiresReload: true
    };
}