// js/backup/export.js

import { APP_CONFIG } from "../config.js";
import {
    exportStorageData,
    getStorageUsage
} from "../storage.js";
import { downloadText } from "../utils.js";
import { getState, setState } from "../state.js";

function createBackupFilename(extension = "json") {
    const now = new Date();

    const timestamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0")
    ].join("");

    return `contador-cup-respaldo-${timestamp}.${extension}`;
}

function buildBackupMetadata() {
    const state = getState();

    return {
        application: APP_CONFIG.name,
        applicationName: APP_CONFIG.fullName,
        applicationVersion: APP_CONFIG.version,
        schemaVersion: APP_CONFIG.storage.currentVersion,
        exportedAt: new Date().toISOString(),
        currency: APP_CONFIG.currency,
        platform: {
            language: globalThis.navigator?.language ?? "unknown",
            online: globalThis.navigator?.onLine ?? false
        },
        contents: {
            settings: true,
            denominations: true,
            currentCount: true,
            drafts: true,
            history: true,
            cashMovements: true,
            machines: true,
            lastSession: true
        },
        summary: {
            denominationCount: Array.isArray(state.denominations)
                ? state.denominations.length
                : 0,
            historyCount: Array.isArray(state.history.records)
                ? state.history.records.length
                : 0,
            draftCount: Array.isArray(state.counter.drafts)
                ? state.counter.drafts.length
                : 0,
            machineCount: Array.isArray(state.machines.registry)
                ? state.machines.registry.length
                : 0
        }
    };
}

function validateBackupData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new TypeError("No hay datos válidos para crear el respaldo.");
    }

    if (data.application !== APP_CONFIG.name) {
        throw new Error("Los datos no pertenecen a Contador-CUP.");
    }

    if (!data.data || typeof data.data !== "object") {
        throw new Error("El respaldo no contiene la sección de datos.");
    }

    return true;
}

export function createBackup(options = {}) {
    const {
        includeMetadata = true,
        pretty = true
    } = options;

    const storageData = exportStorageData();

    validateBackupData(storageData);

    const backup = {
        ...storageData,
        format: "contador-cup-backup",
        formatVersion: 1
    };

    if (includeMetadata) {
        backup.metadata = buildBackupMetadata();
    }

    const json = JSON.stringify(
        backup,
        null,
        pretty ? 2 : 0
    );

    if (typeof json !== "string") {
        throw new Error("No se pudo generar el archivo de respaldo.");
    }

    return {
        backup,
        json,
        filename: createBackupFilename(),
        sizeBytes: new Blob([json]).size,
        createdAt: backup.exportedAt
    };
}

export function downloadBackup(options = {}) {
    const result = createBackup(options);

    downloadText(
        result.json,
        result.filename,
        "application/json;charset=utf-8"
    );

    setState("backup.lastExportAt", result.createdAt);

    return {
        success: true,
        filename: result.filename,
        sizeBytes: result.sizeBytes,
        createdAt: result.createdAt
    };
}

export function getBackupPreview() {
    const result = createBackup({ includeMetadata: true });
    const storage = getStorageUsage();

    return {
        application: APP_CONFIG.fullName,
        version: APP_CONFIG.version,
        filename: result.filename,
        sizeBytes: result.sizeBytes,
        sizeKilobytes: Number(
            (result.sizeBytes / 1024).toFixed(2)
        ),
        storageAvailable: storage.available,
        storageBytes: storage.bytes,
        storageKilobytes: storage.kilobytes,
        exportedAt: result.createdAt,
        summary: result.backup.metadata.summary
    };
}

export function getBackupJSON(options = {}) {
    return createBackup(options).json;
}

export function copyBackupToClipboard(options = {}) {
    const result = createBackup(options);

    if (!globalThis.navigator?.clipboard?.writeText) {
        throw new Error(
            "El portapapeles no está disponible. Descarga el respaldo como archivo."
        );
    }

    return globalThis.navigator.clipboard
        .writeText(result.json)
        .then(() => ({
            success: true,
            sizeBytes: result.sizeBytes
        }))
        .catch(() => {
            throw new Error(
                "No se pudo copiar el respaldo. Descárgalo como archivo."
            );
        });
}