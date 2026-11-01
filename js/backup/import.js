
// js/backup/import.js

import { APP_CONFIG } from "../config.js";

import {
    importStorageData,
    readStorage,
    writeStorage,
    removeStorage
} from "../storage.js";

import { setState } from "../state.js";

import {
    loadCashMovementsIntoState
} from "../cash/movements.js";

const MAX_FILE_BYTES =
    APP_CONFIG.limits.importedFileBytes;

const MAX_CASH_AMOUNT = 999999999999.99;

const ALLOWED_FORMATS = new Set([
    "contador-cup-backup",
    undefined
]);

const ALLOWED_KEYS = Object.values(
    APP_CONFIG.storage.keys
);

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

function isValidMoney(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return false;
    }

    const amount = Number(value);

    return (
        Number.isFinite(amount) &&
        amount >= 0 &&
        amount <= MAX_CASH_AMOUNT
    );
}

function validateMoney(value, message) {
    if (!isValidMoney(value)) {
        throw new Error(message);
    }

    return Number(value);
}

function validateBackup(backup) {
    if (!isPlainObject(backup)) {
        throw new Error(
            "El archivo no contiene un respaldo válido."
        );
    }

    if (backup.application !== APP_CONFIG.name) {
        throw new Error(
            "El archivo no pertenece a Contador-CUP."
        );
    }

    if (!isPlainObject(backup.data)) {
        throw new Error(
            "El respaldo no contiene datos válidos."
        );
    }

    if (!ALLOWED_FORMATS.has(backup.format)) {
        throw new Error(
            "El formato del respaldo no es compatible."
        );
    }

    if (
        backup.schemaVersion !== undefined &&
        (
            !Number.isInteger(backup.schemaVersion) ||
            backup.schemaVersion < 1 ||
            backup.schemaVersion >
                APP_CONFIG.storage.currentVersion
        )
    ) {
        throw new Error(
            "La versión del respaldo no es compatible con esta aplicación."
        );
    }

    for (const key of Object.keys(backup.data)) {
        if (!ALLOWED_KEYS.includes(key)) {
            throw new Error(
                `El respaldo contiene una sección desconocida: ${key}`
            );
        }
    }

    return true;
}

function normalizeMovementList(movements) {
    if (!Array.isArray(movements)) {
        throw new Error(
            "La lista de movimientos de caja no es válida."
        );
    }

    let totalCents = 0;

    return movements.map((movement, index) => {
        if (!isPlainObject(movement)) {
            throw new Error(
                `El movimiento de caja ${index + 1} no es válido.`
            );
        }

        const amount = validateMoney(
            movement.amount,
            `El importe del movimiento ${index + 1} no es válido.`
        );

        if (amount === 0) {
            throw new Error(
                `El importe del movimiento ${index + 1} debe ser mayor que cero.`
            );
        }

        const type = String(
            movement.type ?? ""
        ).trim().toLowerCase();

        const validTypes = {
            in: "income",
            out: "expense",
            income: "income",
            expense: "expense",
            adjustment: "adjustment"
        };

        if (!validTypes[type]) {
            throw new Error(
                `El tipo del movimiento ${index + 1} no es válido.`
            );
        }

        const description = String(
            movement.description ||
            movement.reason ||
            movement.reference ||
            "Movimiento de caja"
        ).trim().slice(0, 160);

        if (!description) {
            throw new Error(
                `El movimiento ${index + 1} no tiene descripción.`
            );
        }

        const cents = Math.round(amount * 100);

        totalCents +=
            validTypes[type] === "expense"
                ? -cents
                : cents;

        if (!Number.isSafeInteger(totalCents)) {
            throw new Error(
                "El total de movimientos supera el límite numérico permitido."
            );
        }

        return {
            ...movement,
            type: validTypes[type],
            amount,
            description,
            reference: String(
                movement.reference ?? ""
            ).slice(0, 120),
            notes: String(
                movement.notes ?? ""
            ).slice(0, 500)
        };
    });
}

function normalizeCashMovements(value) {
    if (value === null) {
        return null;
    }

    // Compatibilidad con respaldos antiguos.
    if (Array.isArray(value)) {
        return normalizeMovementList(value);
    }

    if (!isPlainObject(value)) {
        throw new Error(
            "Los movimientos de caja del respaldo no son válidos."
        );
    }

    if (!Array.isArray(value.movements)) {
        throw new Error(
            "La lista de movimientos de caja del respaldo no es válida."
        );
    }

    const openingBalance = validateMoney(
        value.openingBalance ?? value.opening ?? 0,
        "El saldo inicial de caja del respaldo no es válido."
    );

    return {
        openingBalance,
        movements: normalizeMovementList(
            value.movements
        )
    };
}

function normalizeImportedData(backup) {
    const data = { ...backup.data };

    if (
        data.settings !== undefined &&
        data.settings !== null &&
        !isPlainObject(data.settings)
    ) {
        throw new Error(
            "La configuración del respaldo no es válida."
        );
    }

    if (
        data.denominations !== undefined &&
        data.denominations !== null &&
        !Array.isArray(data.denominations)
    ) {
        throw new Error(
            "La lista de denominaciones del respaldo no es válida."
        );
    }

    if (Array.isArray(data.denominations)) {
        const ids = new Set();

        for (const denomination of data.denominations) {
            if (
                !isPlainObject(denomination) ||
                typeof denomination.id !== "string" ||
                !denomination.id.trim() ||
                ids.has(denomination.id)
            ) {
                throw new Error(
                    "El respaldo contiene denominaciones inválidas o duplicadas."
                );
            }

            ids.add(denomination.id);

            if (
                !Number.isSafeInteger(Number(denomination.value)) ||
                Number(denomination.value) <= 0 ||
                Number(denomination.value) >
                    APP_CONFIG.limits.denominationValue ||
                typeof denomination.label !== "string" ||
                !denomination.label.trim()
            ) {
                throw new Error(
                    "Una denominación del respaldo contiene datos inválidos."
                );
            }
        }
    }

    if (
        data.history !== undefined &&
        data.history !== null &&
        !Array.isArray(data.history)
    ) {
        throw new Error(
            "El historial del respaldo no es válido."
        );
    }

    if (
        data.drafts !== undefined &&
        data.drafts !== null &&
        !Array.isArray(data.drafts)
    ) {
        throw new Error(
            "La lista de borradores del respaldo no es válida."
        );
    }

    if (
        data.machines !== undefined &&
        data.machines !== null &&
        !Array.isArray(data.machines)
    ) {
        throw new Error(
            "El registro de máquinas del respaldo no es válido."
        );
    }

    if (
        data.currentCount !== undefined &&
        data.currentCount !== null
    ) {
        if (!isPlainObject(data.currentCount)) {
            throw new Error(
                "El conteo actual del respaldo no es válido."
            );
        }

        if (
            data.currentCount.quantities !== undefined &&
            !isPlainObject(data.currentCount.quantities)
        ) {
            throw new Error(
                "Las cantidades del conteo actual no son válidas."
            );
        }
    }

    if (data.cashMovements !== undefined) {
        data.cashMovements = normalizeCashMovements(
            data.cashMovements
        );
    }

    return {
        ...backup,
        data
    };
}

function getCashMovementCount(value) {
    if (Array.isArray(value)) {
        return value.length;
    }

    if (
        isPlainObject(value) &&
        Array.isArray(value.movements)
    ) {
        return value.movements.length;
    }

    return 0;
}

function syncImportedState() {
    const settings = readStorage(
        "settings",
        null
    );

    const denominations = readStorage(
        "denominations",
        null
    );

    const currentCount = readStorage(
        "currentCount",
        null
    );

    const history = readStorage(
        "history",
        null
    );

    const cashMovements = readStorage(
        "cashMovements",
        null
    );

    const machines = readStorage(
        "machines",
        null
    );

    setState(
        "settings",
        {
            ...APP_CONFIG.defaults,
            ...(isPlainObject(settings) ? settings : {})
        }
    );

    if (Array.isArray(denominations)) {
        setState(
            "denominations",
            denominations
        );
    }

    if (isPlainObject(currentCount)) {
        setState(
            "counter.quantities",
            currentCount.quantities ?? {}
        );

        setState(
            "counter.total",
            Number(currentCount.total) || 0
        );

        setState(
            "counter.draftId",
            currentCount.draftId ?? null
        );

        setState(
            "counter.draftName",
            currentCount.draftName ?? ""
        );

        setState(
            "counter.isDirty",
            false
        );
    } else {
        setState("counter.quantities", {});
        setState("counter.total", 0);
        setState("counter.draftId", null);
        setState("counter.draftName", "");
        setState("counter.isDirty", false);
    }

    setState(
        "history.records",
        Array.isArray(history) ? history : []
    );

    if (cashMovements !== null) {
        loadCashMovementsIntoState();
    } else {
        setState("cash.openingBalance", 0);
        setState("cash.movements", []);
        setState("cash.currentBalance", 0);
    }

    setState(
        "machines.registry",
        Array.isArray(machines) ? machines : []
    );

    setState(
        "backup.lastImportAt",
        new Date().toISOString()
    );
}

export function inspectBackupObject(backup) {
    validateBackup(backup);

    const normalized = normalizeImportedData(
        backup
    );

    const data = normalized.data;

    return {
        valid: true,
        application: APP_CONFIG.fullName,
        version: backup.version ??
            backup.applicationVersion ??
            "desconocida",

        schemaVersion:
            backup.schemaVersion ?? "no especificada",

        exportedAt: backup.exportedAt ?? null,

        format:
            backup.format ?? "formato anterior",

        sections: Object.keys(data),

        summary: {
            denominations: Array.isArray(data.denominations)
                ? data.denominations.length
                : 0,

            drafts: Array.isArray(data.drafts)
                ? data.drafts.length
                : 0,

            history: Array.isArray(data.history)
                ? data.history.length
                : 0,

            cashMovements: getCashMovementCount(
                data.cashMovements
            ),

            machines: Array.isArray(data.machines)
                ? data.machines.length
                : 0
        }
    };
}

export async function readBackupFile(file) {
    if (
        typeof Blob === "undefined" ||
        !(file instanceof Blob)
    ) {
        throw new TypeError(
            "Selecciona un archivo de respaldo válido."
        );
    }

    if (file.size <= 0) {
        throw new Error(
            "El archivo está vacío."
        );
    }

    if (file.size > MAX_FILE_BYTES) {
        throw new Error(
            `El archivo supera el límite permitido de ${
                Math.round(MAX_FILE_BYTES / 1024 / 1024)
            } MB.`
        );
    }

    const filename = typeof file.name === "string"
        ? file.name
        : "";

    if (
        filename &&
        !filename.toLowerCase().endsWith(".json")
    ) {
        throw new Error(
            "Selecciona un archivo de respaldo con extensión .json."
        );
    }

    let parsed;

    try {
        parsed = JSON.parse(
            await file.text()
        );
    } catch {
        throw new Error(
            "No se pudo leer el archivo JSON. Comprueba que no esté dañado."
        );
    }

    validateBackup(parsed);

    const normalized = normalizeImportedData(
        parsed
    );

    return {
        backup: normalized,
        preview: inspectBackupObject(parsed),
        filename,
        sizeBytes: file.size
    };
}

export function restoreBackup(backup, options = {}) {
    const {
        overwrite = false
    } = options;

    validateBackup(backup);

    const normalizedBackup = normalizeImportedData(
        backup
    );

    const previousData = {};

    for (const key of ALLOWED_KEYS) {
        previousData[key] = readStorage(
            key,
            null
        );
    }

    const result = importStorageData(
        normalizedBackup,
        { overwrite }
    );

    try {
        syncImportedState();
    } catch (error) {
        for (const key of ALLOWED_KEYS) {
            try {
                if (
                    previousData[key] === null ||
                    previousData[key] === undefined
                ) {
                    removeStorage(key);
                } else {
                    writeStorage(
                        key,
                        previousData[key]
                    );
                }
            } catch (rollbackError) {
                console.error(
                    "No se pudo recuperar un dato anterior:",
                    rollbackError
                );
            }
        }

        try {
            syncImportedState();
        } catch (syncError) {
            console.error(
                "No se pudo sincronizar el estado anterior:",
                syncError
            );
        }

        throw error;
    }

    return {
        success: true,
        importedKeys: result.importedKeys,
        importedAt: new Date().toISOString(),
        requiresReload: true
    };
}

export async function restoreBackupFile(
    file,
    options = {}
) {
    const inspected = await readBackupFile(file);

    return {
        ...restoreBackup(
            inspected.backup,
            options
        ),
        filename: inspected.filename,
        preview: inspected.preview
    };
}

export function createRestorePoint() {
    const snapshot = {};

    for (const key of ALLOWED_KEYS) {
        snapshot[key] = readStorage(
            key,
            null
        );
    }

    return {
        application: APP_CONFIG.name,
        createdAt: new Date().toISOString(),
        data: snapshot
    };
}

export function restoreRestorePoint(restorePoint) {
    if (
        !isPlainObject(restorePoint) ||
        restorePoint.application !== APP_CONFIG.name ||
        !isPlainObject(restorePoint.data)
    ) {
        throw new Error(
            "El punto de restauración no es válido."
        );
    }

    for (const key of Object.keys(restorePoint.data)) {
        if (!ALLOWED_KEYS.includes(key)) {
            throw new Error(
                `El punto de restauración contiene una clave desconocida: ${key}`
            );
        }
    }

    const normalizedData = {};

    for (const key of ALLOWED_KEYS) {
        const value = restorePoint.data[key];

        if (key === "cashMovements" && value !== undefined) {
            normalizedData[key] = normalizeCashMovements(value);
        } else {
            normalizedData[key] = value ?? null;
        }
    }

    const previousValues = {};

    for (const key of ALLOWED_KEYS) {
        previousValues[key] = readStorage(
            key,
            null
        );
    }

    try {
        for (const key of ALLOWED_KEYS) {
            const value = normalizedData[key];

            if (value === null) {
                removeStorage(key);
            } else {
                writeStorage(key, value);
            }
        }

        syncImportedState();

    } catch (error) {
        for (const key of ALLOWED_KEYS) {
            try {
                if (
                    previousValues[key] === null ||
                    previousValues[key] === undefined
                ) {
                    removeStorage(key);
                } else {
                    writeStorage(
                        key,
                        previousValues[key]
                    );
                }
            } catch (rollbackError) {
                console.error(
                    "No se pudo restaurar un dato anterior:",
                    rollbackError
                );
            }
        }

        try {
            syncImportedState();
        } catch (syncError) {
            console.error(
                "No se pudo sincronizar el estado anterior:",
                syncError
            );
        }

        throw error;
    }

    return {
        success: true,
        restoredAt: new Date().toISOString(),
        requiresReload: true
    };
}
