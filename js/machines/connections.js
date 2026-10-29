// js/machines/connections.js

import { getState, setState } from "../state.js";
import {
    getMachineById,
    getActiveMachine
} from "./registry.js";

/*
 * No se presupone compatibilidad con ninguna máquina.
 * La conexión automática permanece desactivada hasta disponer
 * de un protocolo real, verificado y probado con el modelo exacto.
 */

const connectionAttempts = new Map();

function createResult(success, status, message, details = {}) {
    return {
        success,
        status,
        message,
        timestamp: new Date().toISOString(),
        ...details
    };
}

function validateMachineForConnection(machine) {
    if (!machine) {
        return "No hay ninguna máquina seleccionada.";
    }

    if (!machine.brand || !machine.model) {
        return "Registra la marca y el modelo exactos de la máquina.";
    }

    if (!machine.connectionType || machine.connectionType === "unknown") {
        return "Registra el tipo de conexión de la máquina.";
    }

    if (!machine.protocol || !machine.protocolVerified) {
        return "El protocolo de comunicación no está verificado.";
    }

    if (machine.automaticCountingEnabled !== true) {
        return "El conteo automático no está habilitado para este modelo.";
    }

    return null;
}

export function getConnectionStatus(machineId = null) {
    const machine = machineId
        ? getMachineById(machineId)
        : getActiveMachine();

    if (!machine) {
        return {
            connected: false,
            status: "disconnected",
            machineId: null,
            message: "No hay ninguna máquina seleccionada."
        };
    }

    const attempt = connectionAttempts.get(machine.id);

    return {
        connected: false,
        status: attempt?.status ?? "not-verified",
        machineId: machine.id,
        machineName: machine.name,
        connectionType: machine.connectionType,
        message: attempt?.message ??
            "La conexión real todavía no se ha verificado."
    };
}

export async function connectMachine(machineId = null) {
    const machine = machineId
        ? getMachineById(machineId)
        : getActiveMachine();

    if (!machine) {
        setState("machines.connectionStatus", "disconnected");

        return createResult(
            false,
            "disconnected",
            "Selecciona una máquina registrada."
        );
    }

    const validationError = validateMachineForConnection(machine);

    if (validationError) {
        connectionAttempts.set(machine.id, {
            status: "not-verified",
            message: validationError
        });

        setState("machines.connectionStatus", "not-verified");

        return createResult(
            false,
            "not-verified",
            validationError,
            { machineId: machine.id }
        );
    }

    /*
     * No se intenta abrir puertos, Bluetooth ni conexiones de red
     * sin un controlador específico para el modelo real.
     */
    connectionAttempts.set(machine.id, {
        status: "unsupported",
        message: "No hay un controlador probado para este modelo."
    });

    setState("machines.connectionStatus", "unsupported");

    return createResult(
        false,
        "unsupported",
        "No se ha implementado un controlador compatible con esta máquina.",
        {
            machineId: machine.id,
            brand: machine.brand,
            model: machine.model,
            connectionType: machine.connectionType,
            protocol: machine.protocol
        }
    );
}

export async function disconnectMachine(machineId = null) {
    const machine = machineId
        ? getMachineById(machineId)
        : getActiveMachine();

    if (!machine) {
        setState("machines.connectionStatus", "disconnected");

        return createResult(
            true,
            "disconnected",
            "No había ninguna máquina seleccionada."
        );
    }

    connectionAttempts.delete(machine.id);

    if (getState().machines.activeMachineId === machine.id) {
        setState("machines.connectionStatus", "disconnected");
    }

    return createResult(
        true,
        "disconnected",
        "Estado local de conexión restablecido.",
        { machineId: machine.id }
    );
}

export function isAutomaticCountingAvailable(machineId = null) {
    const machine = machineId
        ? getMachineById(machineId)
        : getActiveMachine();

    return Boolean(
        machine &&
        machine.protocolVerified === true &&
        machine.automaticCountingEnabled === true &&
        connectionAttempts.get(machine.id)?.status === "connected"
    );
}

export function validateMachineProtocol(machineId) {
    const machine = getMachineById(machineId);

    if (!machine) {
        return {
            valid: false,
            errors: ["No se encontró la máquina."]
        };
    }

    const errors = [];

    if (!machine.brand) errors.push("Falta la marca.");
    if (!machine.model) errors.push("Falta el modelo exacto.");
    if (!machine.protocol) errors.push("Falta el protocolo documentado.");

    if (!machine.protocolVerified) {
        errors.push("El protocolo no ha sido verificado mediante pruebas.");
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

export function getConnectionCapabilities() {
    return {
        registryAvailable: true,
        connectionDriversAvailable: false,
        automaticCountingAvailable: false,
        supportedProtocols: [],
        note: "La conexión automática requiere identificar y probar cada modelo real."
    };
}