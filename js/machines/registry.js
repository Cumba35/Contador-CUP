
// js/machines/registry.js

import { getState, setState } from "../state.js";
import { readStorage, writeStorage } from "../storage.js";
import { generateId, deepClone } from "../utils.js";

const STORAGE_KEY = "machines";

export const MACHINE_TYPES = Object.freeze({
    BILL_COUNTER: "bill-counter",
    COUNTERFEIT_DETECTOR: "counterfeit-detector",
    BILL_SORTER: "bill-sorter",
    OTHER: "other"
});

export const MACHINE_CONNECTION_TYPES = Object.freeze({
    NONE: "none",
    USB: "usb",
    SERIAL: "serial",
    BLUETOOTH: "bluetooth",
    NETWORK: "network",
    WIFI: "wifi",
    OTHER: "other",
    UNKNOWN: "unknown"
});

/* =========================================================
   VALIDACIONES
========================================================= */

function validateText(
    value,
    field,
    maximum = 120,
    required = true
) {
    const text = String(value ?? "").trim();

    if (required && !text) {
        throw new Error(`${field} es obligatorio.`);
    }

    if (text.length > maximum) {
        throw new Error(
            `${field} no puede superar los ${maximum} caracteres.`
        );
    }

    return text;
}

function validateChoice(value, choices, field) {
    const normalized = String(value ?? "");

    if (!Object.values(choices).includes(normalized)) {
        throw new Error(`El valor de ${field} no es válido.`);
    }

    return normalized;
}

function validateOptionalImage(value) {
    const image = String(value ?? "").trim();

    if (!image) {
        return "";
    }

    if (image.length > 2000) {
        throw new Error(
            "La referencia de imagen es demasiado larga."
        );
    }

    if (
        /^(javascript|data|vbscript):/i.test(image) ||
        image.startsWith("//")
    ) {
        throw new Error(
            "La referencia de imagen no está permitida."
        );
    }

    if (/^https?:\/\//i.test(image)) {
        try {
            const url = new URL(image);

            if (
                !["http:", "https:"].includes(url.protocol)
            ) {
                throw new Error();
            }
        } catch {
            throw new Error(
                "La URL de imagen no es válida."
            );
        }
    }

    return image;
}

function normalizeMachine(machine) {
    return {
        id: String(machine.id ?? ""),
        name: String(machine.name ?? ""),
        type: machine.type,
        brand: String(machine.brand ?? ""),
        model: String(machine.model ?? ""),
        serialNumber: String(machine.serialNumber ?? ""),
        image: String(machine.image ?? ""),
        description: String(machine.description ?? ""),

        features: Array.isArray(machine.features)
            ? machine.features.map(String)
            : [],

        connectionType: machine.connectionType ??
            MACHINE_CONNECTION_TYPES.UNKNOWN,

        connectionDetails: String(
            machine.connectionDetails ?? ""
        ),

        connectionCapabilities: String(
            machine.connectionCapabilities ?? ""
        ),

        protocol: String(machine.protocol ?? ""),

        protocolVerified:
            machine.protocolVerified === true,

        automaticCountingEnabled:
            machine.automaticCountingEnabled === true,

        connectionStatus: String(
            machine.connectionStatus ?? "not-verified"
        ),

        createdAt: machine.createdAt ?? null,
        updatedAt: machine.updatedAt ?? null
    };
}

/* =========================================================
   ALMACENAMIENTO DEL REGISTRO
========================================================= */

function getMachines() {
    const machines = readStorage(STORAGE_KEY, []);

    if (!Array.isArray(machines)) {
        return [];
    }

    return machines.filter(machine =>
        machine &&
        typeof machine === "object" &&
        !Array.isArray(machine) &&
        typeof machine.id === "string" &&
        machine.id.trim()
    );
}

function saveMachines(machines) {
    if (!Array.isArray(machines)) {
        throw new TypeError(
            "El registro de máquinas no es válido."
        );
    }

    const normalized = machines.map(normalizeMachine);

    const identifiers = new Set();

    for (const machine of normalized) {
        if (!machine.id.trim()) {
            throw new Error(
                "Una máquina tiene un identificador vacío."
            );
        }

        if (identifiers.has(machine.id)) {
            throw new Error(
                "El registro contiene máquinas con identificadores duplicados."
            );
        }

        identifiers.add(machine.id);
    }

    writeStorage(STORAGE_KEY, normalized);

    setState(
        "machines.registry",
        deepClone(normalized)
    );

    return normalized;
}

function findMachine(id) {
    return getMachines().find(
        machine => machine.id === id
    );
}

/* =========================================================
   CONSULTAS
========================================================= */

export function listMachines() {
    return getMachines().map(machine =>
        deepClone(normalizeMachine(machine))
    );
}

export function getMachineById(id) {
    if (!id) {
        return null;
    }

    const machine = findMachine(id);

    return machine
        ? deepClone(normalizeMachine(machine))
        : null;
}

/* =========================================================
   REGISTRAR MÁQUINA
========================================================= */

export function registerMachine(data = {}) {
    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {
        throw new TypeError(
            "Los datos de la máquina no son válidos."
        );
    }

    const type = validateChoice(
        data.type,
        MACHINE_TYPES,
        "tipo de máquina"
    );

    const brand = validateText(
        data.brand,
        "La marca",
        100,
        false
    );

    const model = validateText(
        data.model,
        "El modelo",
        100,
        false
    );

    const connectionType = validateChoice(
        data.connectionType ??
            MACHINE_CONNECTION_TYPES.UNKNOWN,
        MACHINE_CONNECTION_TYPES,
        "tipo de conexión"
    );

    const name = validateText(
        data.name ||
            [brand, model].filter(Boolean).join(" "),
        "El nombre",
        150
    );

    const now = new Date().toISOString();

    const machine = {
        id: generateId("machine"),
        name,
        type,
        brand,
        model,

        serialNumber: validateText(
            data.serialNumber,
            "El número de serie",
            120,
            false
        ),

        image: validateOptionalImage(data.image),

        description: validateText(
            data.description,
            "La descripción",
            2000,
            false
        ),

        features: Array.isArray(data.features)
            ? [
                ...new Set(
                    data.features
                        .map(item => String(item).trim())
                        .filter(Boolean)
                        .map(item => item.slice(0, 120))
                )
            ].slice(0, 50)
            : [],

        connectionType,

        connectionDetails: validateText(
            data.connectionDetails,
            "Los detalles de conexión",
            1000,
            false
        ),

        connectionCapabilities: validateText(
            data.connectionCapabilities,
            "Las capacidades de conexión",
            1000,
            false
        ),

        protocol: validateText(
            data.protocol,
            "El protocolo",
            200,
            false
        ),

        protocolVerified: false,
        automaticCountingEnabled: false,
        connectionStatus: "not-verified",

        createdAt: now,
        updatedAt: now
    };

    saveMachines([
        ...getMachines(),
        machine
    ]);

    return deepClone(normalizeMachine(machine));
}

/* =========================================================
   ACTUALIZAR MÁQUINA
========================================================= */

export function updateMachine(id, changes = {}) {
    if (
        !changes ||
        typeof changes !== "object" ||
        Array.isArray(changes)
    ) {
        throw new TypeError(
            "Los cambios de la máquina no son válidos."
        );
    }

    const machines = getMachines();

    const existing = machines.find(
        machine => machine.id === id
    );

    if (!existing) {
        throw new Error(
            "No se encontró la máquina registrada."
        );
    }

    const updated = {
        ...existing
    };

    if (changes.name !== undefined) {
        updated.name = validateText(
            changes.name,
            "El nombre",
            150
        );
    }

    if (changes.type !== undefined) {
        updated.type = validateChoice(
            changes.type,
            MACHINE_TYPES,
            "tipo de máquina"
        );
    }

    if (changes.brand !== undefined) {
        updated.brand = validateText(
            changes.brand,
            "La marca",
            100,
            false
        );
    }

    if (changes.model !== undefined) {
        updated.model = validateText(
            changes.model,
            "El modelo",
            100,
            false
        );
    }

    if (changes.serialNumber !== undefined) {
        updated.serialNumber = validateText(
            changes.serialNumber,
            "El número de serie",
            120,
            false
        );
    }

    if (changes.image !== undefined) {
        updated.image = validateOptionalImage(
            changes.image
        );
    }

    if (changes.description !== undefined) {
        updated.description = validateText(
            changes.description,
            "La descripción",
            2000,
            false
        );
    }

    if (changes.features !== undefined) {
        if (!Array.isArray(changes.features)) {
            throw new TypeError(
                "Las características deben ser una lista."
            );
        }

        updated.features = [
            ...new Set(
                changes.features
                    .map(item => String(item).trim())
                    .filter(Boolean)
                    .map(item => item.slice(0, 120))
            )
        ].slice(0, 50);
    }

    let connectionConfigurationChanged = false;

    if (changes.connectionType !== undefined) {
        const nextType = validateChoice(
            changes.connectionType,
            MACHINE_CONNECTION_TYPES,
            "tipo de conexión"
        );

        if (nextType !== updated.connectionType) {
            connectionConfigurationChanged = true;
        }

        updated.connectionType = nextType;
    }

    if (changes.connectionDetails !== undefined) {
        const nextDetails = validateText(
            changes.connectionDetails,
            "Los detalles de conexión",
            1000,
            false
        );

        if (nextDetails !== updated.connectionDetails) {
            connectionConfigurationChanged = true;
        }

        updated.connectionDetails = nextDetails;
    }

    if (changes.connectionCapabilities !== undefined) {
        const nextCapabilities = validateText(
            changes.connectionCapabilities,
            "Las capacidades de conexión",
            1000,
            false
        );

        if (
            nextCapabilities !==
            updated.connectionCapabilities
        ) {
            connectionConfigurationChanged = true;
        }

        updated.connectionCapabilities = nextCapabilities;
    }

    if (changes.protocol !== undefined) {
        const nextProtocol = validateText(
            changes.protocol,
            "El protocolo",
            200,
            false
        );

        if (nextProtocol !== updated.protocol) {
            connectionConfigurationChanged = true;
        }

        updated.protocol = nextProtocol;
    }

    if (connectionConfigurationChanged) {
        updated.protocolVerified = false;
        updated.automaticCountingEnabled = false;
        updated.connectionStatus = "not-verified";
    }

    updated.updatedAt = new Date().toISOString();

    saveMachines(
        machines.map(machine =>
            machine.id === id
                ? updated
                : machine
        )
    );

    return deepClone(normalizeMachine(updated));
}

/* =========================================================
   ELIMINAR MÁQUINA
========================================================= */

export function removeMachine(id) {
    const machines = getMachines();

    const exists = machines.some(
        machine => machine.id === id
    );

    if (!exists) {
        return false;
    }

    saveMachines(
        machines.filter(machine => machine.id !== id)
    );

    if (getState().machines.activeMachineId === id) {
        setState("machines.activeMachineId", null);

        setState(
            "machines.connectionStatus",
            "disconnected"
        );
    }

    return true;
}

/* =========================================================
   MÁQUINA ACTIVA
========================================================= */

export function setActiveMachine(id) {
    const machine = findMachine(id);

    if (!machine) {
        throw new Error(
            "No se encontró la máquina seleccionada."
        );
    }

    setState("machines.activeMachineId", id);

    setState(
        "machines.connectionStatus",
        "disconnected"
    );

    return deepClone(normalizeMachine(machine));
}

export function getActiveMachine() {
    const id = getState().machines.activeMachineId;

    return id
        ? getMachineById(id)
        : null;
}

/* =========================================================
   CARGAR REGISTRO EN EL ESTADO
========================================================= */

export function loadMachinesIntoState() {
    const machines = getMachines().map(
        normalizeMachine
    );

    setState(
        "machines.registry",
        deepClone(machines)
    );

    const activeMachineId =
        getState().machines.activeMachineId;

    if (
        activeMachineId &&
        !machines.some(
            machine => machine.id === activeMachineId
        )
    ) {
        setState("machines.activeMachineId", null);

        setState(
            "machines.connectionStatus",
            "disconnected"
        );
    }

    return machines.length;
}

/* =========================================================
   RESUMEN DEL REGISTRO
========================================================= */

export function getMachineRegistrySummary() {
    const machines = listMachines();

    return {
        total: machines.length,

        billCounters: machines.filter(
            item =>
                item.type === MACHINE_TYPES.BILL_COUNTER
        ).length,

        counterfeitDetectors: machines.filter(
            item =>
                item.type === MACHINE_TYPES.COUNTERFEIT_DETECTOR
        ).length,

        billSorters: machines.filter(
            item =>
                item.type === MACHINE_TYPES.BILL_SORTER
        ).length,

        otherMachines: machines.filter(
            item =>
                item.type === MACHINE_TYPES.OTHER
        ).length,

        verifiedProtocols: machines.filter(
            item => item.protocolVerified
        ).length,

        automaticCountingReady: machines.filter(
            item => item.automaticCountingEnabled
        ).length
    };
}
