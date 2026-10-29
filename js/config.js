// js/config.js

export const APP_CONFIG = Object.freeze({
    name: "Contador-CUP",
    fullName: "Contador de Efectivo CUP",
    version: "2.0.0",
    author: "Nova Apps",
    currency: "CUP",
    locale: "es-CU",

    storage: Object.freeze({
        prefix: "contadorCUP_",
        versionKey: "schemaVersion",
        currentVersion: 1,
        keys: Object.freeze({
            settings: "settings",
            denominations: "denominations",
            currentCount: "currentCount",
            drafts: "drafts",
            history: "history",
            cashMovements: "cashMovements",
            machines: "machines",
            lastSession: "lastSession"
        })
    }),

    defaults: Object.freeze({
        theme: "system",
        language: "es",
        decimalPlaces: 2,
        autoSave: true,
        confirmBeforeDelete: true,
        soundEnabled: false,
        hapticEnabled: true,
        historyLimit: 1000,
        maximumUndoSteps: 50
    }),

    denominations: Object.freeze([
        { id: "cup-20000", value: 20000, label: "20 000 CUP", enabled: true },
        { id: "cup-10000", value: 10000, label: "10 000 CUP", enabled: true },
        { id: "cup-5000", value: 5000, label: "5 000 CUP", enabled: true },
        { id: "cup-2000", value: 2000, label: "2 000 CUP", enabled: true },
        { id: "cup-1000", value: 1000, label: "1 000 CUP", enabled: true },
        { id: "cup-500", value: 500, label: "500 CUP", enabled: true },
        { id: "cup-200", value: 200, label: "200 CUP", enabled: true },
        { id: "cup-100", value: 100, label: "100 CUP", enabled: true },
        { id: "cup-50", value: 50, label: "50 CUP", enabled: true },
        { id: "cup-20", value: 20, label: "20 CUP", enabled: true },
        { id: "cup-10", value: 10, label: "10 CUP", enabled: true },
        { id: "cup-5", value: 5, label: "5 CUP", enabled: true },
        { id: "cup-3", value: 3, label: "3 CUP", enabled: true },
        { id: "cup-1", value: 1, label: "1 CUP", enabled: true }
    ]),

    limits: Object.freeze({
        denominationValue: 1000000000,
        denominationQuantity: 1000000,
        customDenominations: 100,
        importedFileBytes: 20 * 1024 * 1024
    }),

    features: Object.freeze({
        counting: true,
        drafts: true,
        undoRedo: true,
        history: true,
        comparison: true,
        receipts: true,
        reports: true,
        csvExport: true,
        cashMovements: true,
        machineRegistry: true,
        machineConnections: false,
        backupExport: true,
        backupImport: true,
        customDenominations: true,
        cloudSync: false
    })
});

export function getStorageKey(key) {
    const keys = APP_CONFIG.storage.keys;

    if (!Object.values(keys).includes(key)) {
        throw new Error(`Clave de almacenamiento no permitida: ${key}`);
    }

    return `${APP_CONFIG.storage.prefix}${key}`;
}