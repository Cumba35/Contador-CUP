// js/machines/registry.js

import { getState, setState } from "../state.js";
import { readStorage, writeStorage } from "../storage.js";
import { generateId } from "../utils.js";

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
    OTHER: "other",
    UNKNOWN: "unknown"
});

function validateText(value, field, maximum = 120, required = true) {
    const text = String(value ?? "").trim();

    if (required && !text) {
        throw new Error(`${field} es obligatorio.`);
    }

    if (text.length > maximum) {
        throw new Error(`${field} no puede superar los ${maximum} caracteres.`);
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
        throw new Error("La referencia de imagen es demasiado larga.");
    }

    // Se aceptan rutas relativas o URL HTTP(S).
    // No se permiten esquemas ejecutables como javascript:.
    if (
        /^(javascript|data|vbscript):/i.test(image) ||
        image.startsWith("//")
    ) {
        throw new Error("La referencia de imagen no está permitida.");
    }

    if (/^https?:\/\//i.test(image)) {
        try {
            const url = new URL(image);

            if (!["http:", "https:"].includes(url.protocol)) {
                throw new Error();
            }
        } catch {
            throw new Error("La URL de imagen no es válida.");
        }
    }

    return image;
}

function normalizeMachine(machine) {
    return {
        id: String(machine.id),
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
        connectionType: machine.connectionType,
        connectionDetails: String(machine.connectionDetails ?? ""),
        protocol: String(machine.protocol ?? ""),
        protocolVerified: machine.protocolVerified === true,
        automaticCountingEnabled: false,
        connectionStatus: "not-verified",
        createdAt: machine.createdAt,
        updatedAt: machine.updatedAt
    };
}

function getMachines() {
    const machines = readStorage(STORAGE_KEY, []);
    return Array.isArray(machines) ? machines : [];
}

function saveMachines(machines) {
    writeStorage(STORAGE_KEY, machines);
    setState("machines.registry", machines.map(normalizeMachine));
    return machines;
}

function findMachine(id) {
    return getMachines().find(machine => machine.id === id);
}

export function listMachines() {
    return getMachines().map(machine =>
        structuredClone(normalizeMachine(machine))
    );
}

export function getMachineById(id) {
    const machine = findMachine(id);

    return machine
        ? structuredClone(normalizeMachine(machine))
        : null;
}

export function registerMachine(data = {}) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new TypeError("Los datos de la máquina no son válidos.");
    }

    const type = validateChoice(data.type, MACHINE_TYPES, "tipo de máquina");

    const brand = validateText(data.brand, "La marca", 100);
    const model = validateText(data.model, "El modelo", 100);

    const connectionType = validateChoice(
        data.connectionType ?? MACHINE_CONNECTION_TYPES.UNKNOWN,
        MACHINE_CONNECTION_TYPES,
        "tipo de conexión"
    );

    const now = new Date().toISOString();

    const machine = {
        id: generateId("machine"),
        name: validateText(
            data.name || `${brand} ${model}`,
            "El nombre",
            150
        ),
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
            ? [...new Set(
                data.features
                    .map(item => String(item).trim())
                    .filter(Boolean)
                    .map(item => item.slice(0, 120))
            )].slice(0, 50)
            : [],
        connectionType,
        connectionDetails: validateText(
            data.connectionDetails,
            "Los detalles de conexión",
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

    saveMachines([...getMachines(), machine]);

    return structuredClone(normalizeMachine(machine));
}

export function updateMachine(id, changes = {}) {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
        throw new TypeError("Los cambios de la máquina no son válidos.");
    }

    const machines = getMachines();
    const existing = machines.find(machine => machine.id === id);

    if (!existing) {
        throw new Error("No se encontró la máquina registrada.");
    }

    const updated = { ...existing };

    if (changes.name !== undefined) {
        updated.name = validateText(changes.name, "El nombre", 150);
    }

    if (changes.type !== undefined) {
        updated.type = validateChoice(
            changes.type,
            MACHINE_TYPES,
            "tipo de máquina"
        );
    }

    if (changes.brand !== undefined) {
        updated.brand = validateText(changes.brand, "La marca", 100);
    }

    if (changes.model !== undefined) {
        updated.model = validateText(changes.model, "El modelo", 100);
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
        updated.image = validateOptionalImage(changes.image);
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
            throw new TypeError("Las características deben ser una lista.");
        }

        updated.features = [...new Set(
            changes.features
                .map(item => String(item).trim())
                .filter(Boolean)
                .map(item => item.slice(0, 120))
        )].slice(0, 50);
    }

    if (changes.connectionType !== undefined) {
        updated.connectionType = validateChoice(
            changes.connectionType,
            MACHINE_CONNECTION_TYPES,
            "tipo de conexión"
        );

        // Un cambio de conexión requiere verificar nuevamente la compatibilidad.
        updated.protocolVerified = false;
        updated.automaticCountingEnabled = false;
        updated.connectionStatus = "not-verified";
    }

    if (changes.connectionDetails !== undefined) {
        updated.connectionDetails = validateText(
            changes.connectionDetails,
            "Los detalles de conexión",
            1000,
            false
        );
    }

    if (changes.protocol !== undefined) {
        updated.protocol = validateText(
            changes.protocol,
            "El protocolo",
            200,
            false
        );

        updated.protocolVerified = false;
        updated.automaticCountingEnabled = false;
        updated.connectionStatus = "not-verified";
    }

    // Estos campos no pueden activarse manualmente mediante este módulo.
    updated.protocolVerified = false;
    updated.automaticCountingEnabled = false;
    updated.connectionStatus = "not-verified";
    updated.updatedAt = new Date().toISOString();

    saveMachines(
        machines.map(machine => machine.id === id ? updated : machine)
    );

    return structuredClone(normalizeMachine(updated));
}

export function removeMachine(id) {
    const machines = getMachines();
    const exists = machines.some(machine => machine.id === id);

    if (!exists) {
        return false;
    }

    saveMachines(machines.filter(machine => machine.id !== id));

    if (getState().machines.activeMachineId === id) {
        setState("machines.activeMachineId", null);
        setState("machines.connectionStatus", "disconnected");
    }

    return true;
}

export function setActiveMachine(id) {
    const machine = findMachine(id);

    if (!machine) {
        throw new Error("No se encontró la máquina seleccionada.");
    }

    setState("machines.activeMachineId", id);
    setState("machines.connectionStatus", "disconnected");

    return structuredClone(normalizeMachine(machine));
}

export function getActiveMachine() {
    const id = getState().machines.activeMachineId;

    return id ? getMachineById(id) : null;
}

export function loadMachinesIntoState() {
    const machines = getMachines().map(normalizeMachine);

    setState("machines.registry", machines);

    return machines.length;
}

export function getMachineRegistrySummary() {
    const machines = listMachines();

    return {
        total: machines.length,
        billCounters: machines.filter(
            item => item.type === MACHINE_TYPES.BILL_COUNTER
        ).length,
        counterfeitDetectors: machines.filter(
            item => item.type === MACHINE_TYPES.COUNTERFEIT_DETECTOR
        ).length,
        billSorters: machines.filter(
            item => item.type === MACHINE_TYPES.BILL_SORTER
        ).length,
        otherMachines: machines.filter(
            item => item.type === MACHINE_TYPES.OTHER
        ).length,
        verifiedProtocols: machines.filter(
            item => item.protocolVerified
        ).length,
        automaticCountingReady: machines.filter(
            item => item.automaticCountingEnabled
        ).length
    };
}