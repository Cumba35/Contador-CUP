
import { getState, setState } from "../state.js";
import {
    getMachineById,
    getActiveMachine
} from "./registry.js";

const connections = new Map();

function createResult(success, status, message, details = {}) {
    return {
        success,
        status,
        message,
        timestamp: new Date().toISOString(),
        ...details
    };
}

function updateAppStatus(machineId, status) {
    try {
        if (getState()?.machines?.activeMachineId === machineId) {
            setState("machines.connectionStatus", status);
        }
    } catch (error) {
        console.warn("No se pudo actualizar el estado:", error);
    }
}

function parseConnectionDetails(machine) {
    const raw = String(machine.connectionDetails || "").trim();

    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error();
        }

        return parsed;
    } catch {
        throw new Error(
            "Los detalles de conexión deben estar en formato JSON válido."
        );
    }
}

function validateMachine(machine) {
    if (!machine) {
        return "No hay ninguna máquina seleccionada.";
    }

    if (!machine.brand || !machine.model) {
        return "Registra la marca y el modelo exactos.";
    }

    if (!machine.connectionType) {
        return "Indica el tipo de conexión.";
    }

    return null;
}

function getConnectionError(error) {
    if (!error) return "Error desconocido de conexión.";

    if (error.name === "NotFoundError") {
        return "No se seleccionó ningún dispositivo.";
    }

    if (error.name === "SecurityError") {
        return "El navegador no permite acceder al dispositivo.";
    }

    if (error.name === "NotSupportedError") {
        return "Este navegador no admite este tipo de conexión.";
    }

    if (error.name === "NetworkError") {
        return "No se pudo establecer la comunicación.";
    }

    if (error.name === "InvalidStateError") {
        return "El dispositivo se encuentra en un estado no válido.";
    }

    return error.message || "No se pudo conectar con la máquina.";
}

function registerConnection(machine, transport, device, metadata = {}) {
    const connection = {
        machineId: machine.id,
        machineName: machine.name,
        transport,
        device,
        metadata,
        connected: true,
        connectedAt: new Date().toISOString(),
        disconnectHandler: null
    };

    const onDisconnect = () => {
        connection.connected = false;
        connections.delete(machine.id);
        updateAppStatus(machine.id, "disconnected");
    };

    connection.disconnectHandler = onDisconnect;

    if (device?.addEventListener) {
        device.addEventListener("disconnect", onDisconnect);
    }

    if (transport === "websocket" && device) {
        device.addEventListener("close", onDisconnect);
    }

    connections.set(machine.id, connection);
    updateAppStatus(machine.id, "connected");

    return connection;
}

function getBluetoothOptions(details) {
    const serviceUUIDs = Array.isArray(details.serviceUUIDs)
        ? details.serviceUUIDs.filter(
            value => typeof value === "string" && value.trim()
        )
        : [];

    if (!serviceUUIDs.length) {
        throw new Error(
            "Para Bluetooth debes indicar serviceUUIDs en los detalles de conexión."
        );
    }

    return {
        acceptAllDevices: true,
        optionalServices: serviceUUIDs
    };
}

async function connectBluetooth(machine, details) {
    if (!navigator.bluetooth?.requestDevice) {
        throw new Error(
            "Bluetooth no está disponible en este navegador. Se necesita un navegador compatible y una conexión segura."
        );
    }

    const device = await navigator.bluetooth.requestDevice(
        getBluetoothOptions(details)
    );

    if (!device.gatt) {
        throw new Error(
            "El dispositivo seleccionado no ofrece Bluetooth GATT."
        );
    }

    const server = await device.gatt.connect();

    const services = [];

    for (const uuid of details.serviceUUIDs) {
        try {
            const service = await server.getPrimaryService(uuid);
            const characteristics = await service.getCharacteristics();

            services.push({
                uuid,
                service,
                characteristics
            });
        } catch (error) {
            console.warn(
                "No se pudo consultar el servicio Bluetooth:",
                uuid,
                error
            );
        }
    }

    if (!services.length) {
        device.gatt.disconnect();

        throw new Error(
            "No se encontraron servicios Bluetooth accesibles."
        );
    }

    return registerConnection(
        machine,
        "bluetooth",
        device,
        { server, services }
    );
}

async function connectSerial(machine, details) {
    if (!navigator.serial?.requestPort) {
        throw new Error(
            "El puerto serie no está disponible en este navegador."
        );
    }

    const baudRate = Number(details.baudRate);

    if (!Number.isInteger(baudRate) || baudRate <= 0) {
        throw new Error(
            "Indica baudRate en los detalles de conexión. No se debe adivinar la velocidad del equipo."
        );
    }

    const port = await navigator.serial.requestPort();

    await port.open({
        baudRate,
        dataBits: Number(details.dataBits) || 8,
        stopBits: Number(details.stopBits) || 1,
        parity: details.parity || "none",
        bufferSize: Number(details.bufferSize) || 255
    });

    return registerConnection(
        machine,
        "serial",
        port,
        {
            baudRate,
            reader: null,
            writer: null
        }
    );
}

async function connectUSB(machine, details) {
    if (!navigator.usb?.requestDevice) {
        throw new Error(
            "USB no está disponible en este navegador."
        );
    }

    const filters = [];

    if (details.vendorId !== undefined) {
        filters.push({
            vendorId: Number(details.vendorId),
            ...(details.productId !== undefined
                ? { productId: Number(details.productId) }
                : {})
        });
    }

    if (!filters.length && details.allowAnyDevice !== true) {
        throw new Error(
            "Indica vendorId en los detalles USB o configura allowAnyDevice como true."
        );
    }

    const device = await navigator.usb.requestDevice({
        filters
    });

    await device.open();

    if (!device.configuration) {
        await device.selectConfiguration(
            Number(details.configurationValue) || 1
        );
    }

    const interfaces = device.configuration?.interfaces || [];

    const requestedInterface = details.interfaceNumber;

    const selectedInterface = requestedInterface !== undefined
        ? interfaces.find(
            item => item.interfaceNumber === Number(requestedInterface)
        )
        : interfaces.find(item =>
            item.alternates.some(alternate =>
                alternate.endpoints.some(endpoint =>
                    endpoint.type === "bulk"
                )
            )
        );

    if (!selectedInterface) {
        await device.close();

        throw new Error(
            "No se encontró una interfaz USB compatible. Revisa interfaceNumber."
        );
    }

    await device.claimInterface(
        selectedInterface.interfaceNumber
    );

    const alternate = selectedInterface.alternates.find(item =>
        item.endpoints.some(endpoint => endpoint.type === "bulk")
    );

    if (!alternate) {
        await device.close();

        throw new Error(
            "La interfaz USB no tiene puntos de transferencia bulk."
        );
    }

    if (details.alternateSetting !== undefined) {
        await device.selectAlternateInterface(
            selectedInterface.interfaceNumber,
            Number(details.alternateSetting)
        );
    }

    const endpoints = alternate.endpoints;

    const inputEndpoint = endpoints.find(
        endpoint =>
            endpoint.direction === "in" &&
            endpoint.type === "bulk"
    );

    const outputEndpoint = endpoints.find(
        endpoint =>
            endpoint.direction === "out" &&
            endpoint.type === "bulk"
    );

    return registerConnection(
        machine,
        "usb",
        device,
        {
            interfaceNumber: selectedInterface.interfaceNumber,
            inputEndpoint: inputEndpoint?.endpointNumber ?? null,
            outputEndpoint: outputEndpoint?.endpointNumber ?? null
        }
    );
}

async function connectNetwork(machine, details) {
    if (typeof WebSocket === "undefined") {
        throw new Error(
            "WebSocket no está disponible en este navegador."
        );
    }

    const url = String(details.url || "").trim();

    if (!url) {
        throw new Error(
            "Indica la dirección WebSocket del equipo en los detalles de conexión."
        );
    }

    let parsed;

    try {
        parsed = new URL(url);
    } catch {
        throw new Error("La dirección de red no es válida.");
    }

    if (!["ws:", "wss:"].includes(parsed.protocol)) {
        throw new Error(
            "Solo se permiten direcciones WebSocket ws:// o wss://."
        );
    }

    if (
        location.protocol === "https:" &&
        parsed.protocol !== "wss:"
    ) {
        throw new Error(
            "Una aplicación HTTPS no puede conectarse a un WebSocket inseguro."
        );
    }

    const socket = new WebSocket(url);
    const timeout = Math.max(
        1000,
        Math.min(Number(details.timeout) || 10000, 30000)
    );

    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.close();
            reject(new Error("Tiempo de espera agotado al conectar."));
        }, timeout);

        socket.addEventListener("open", () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });

        socket.addEventListener("error", () => {
            clearTimeout(timer);
            reject(new Error("No se pudo abrir la conexión de red."));
        }, { once: true });
    });

    return registerConnection(
        machine,
        "websocket",
        socket,
        {}
    );
}

async function openTransport(machine, details) {
    switch (machine.connectionType) {
        case "bluetooth":
            return connectBluetooth(machine, details);

        case "serial":
            return connectSerial(machine, details);

        case "usb":
            return connectUSB(machine, details);

        case "network":
        case "wifi":
            return connectNetwork(machine, details);

        default:
            throw new Error(
                "Este tipo de conexión todavía no dispone de un adaptador compatible."
            );
    }
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

    const connection = connections.get(machine.id);

    const connected = Boolean(
        connection?.connected &&
        (
            connection.transport !== "websocket" ||
            connection.device.readyState === WebSocket.OPEN
        )
    );

    return {
        connected,
        status: connected ? "connected" : "disconnected",
        machineId: machine.id,
        machineName: machine.name,
        connectionType: machine.connectionType,
        transport: connection?.transport || null,
        connectedAt: connection?.connectedAt || null,
        message: connected
            ? "Transporte conectado. El protocolo de conteo debe verificarse."
            : "No existe una conexión activa."
    };
}

export async function connectMachine(machineId = null) {
    const machine = machineId
        ? getMachineById(machineId)
        : getActiveMachine();

    const validationError = validateMachine(machine);

    if (validationError) {
        if (machine?.id) {
            updateAppStatus(machine.id, "not-verified");
        }

        return createResult(
            false,
            "not-verified",
            validationError,
            { machineId: machine?.id || null }
        );
    }

    if (connections.has(machine.id)) {
        const current = getConnectionStatus(machine.id);

        if (current.connected) {
            return createResult(
                true,
                "connected",
                "La máquina ya está conectada.",
                { machineId: machine.id }
            );
        }

        connections.delete(machine.id);
    }

    updateAppStatus(machine.id, "connecting");

    try {
        const details = parseConnectionDetails(machine);
        const connection = await openTransport(machine, details);

        return createResult(
            true,
            "connected",
            "Conexión física establecida. El protocolo de conteo todavía debe verificarse.",
            {
                machineId: machine.id,
                machineName: machine.name,
                transport: connection.transport,
                automaticCountingAvailable: false
            }
        );
    } catch (error) {
        const message = getConnectionError(error);

        connections.delete(machine.id);
        updateAppStatus(machine.id, "disconnected");

        return createResult(
            false,
            "connection-error",
            message,
            {
                machineId: machine.id,
                connectionType: machine.connectionType,
                errorName: error?.name || "Error"
            }
        );
    }
}

export async function disconnectMachine(machineId = null) {
    const machine = machineId
        ? getMachineById(machineId)
        : getActiveMachine();

    if (!machine) {
        return createResult(
            true,
            "disconnected",
            "No hay ninguna máquina seleccionada."
        );
    }

    const connection = connections.get(machine.id);

    if (!connection) {
        updateAppStatus(machine.id, "disconnected");

        return createResult(
            true,
            "disconnected",
            "La máquina ya estaba desconectada.",
            { machineId: machine.id }
        );
    }

    try {
        if (connection.transport === "bluetooth") {
            if (connection.device.gatt?.connected) {
                connection.device.gatt.disconnect();
            }
        }

        if (connection.transport === "serial") {
            if (connection.device.readable) {
                await connection.device.readable.cancel().catch(() => {});
            }

            if (connection.device.writable) {
                await connection.device.close();
            }
        }

        if (connection.transport === "usb") {
            try {
                await connection.device.releaseInterface(
                    connection.metadata.interfaceNumber
                );
            } catch {}

            if (connection.device.opened) {
                await connection.device.close();
            }
        }

        if (connection.transport === "websocket") {
            connection.device.close();
        }
    } catch (error) {
        console.warn("Error al cerrar la conexión:", error);
    }

    connections.delete(machine.id);
    updateAppStatus(machine.id, "disconnected");

    return createResult(
        true,
        "disconnected",
        "Máquina desconectada.",
        { machineId: machine.id }
    );
}

export async function sendMachineData(
    machineId,
    data,
    options = {}
) {
    const connection = connections.get(machineId);

    if (!connection?.connected) {
        throw new Error("La máquina no está conectada.");
    }

    if (connection.transport === "bluetooth") {
        const characteristic = findBluetoothCharacteristic(
            connection,
            options.characteristicUUID,
            ["write", "writeWithoutResponse"]
        );

        const bytes = toUint8Array(data);

        if (characteristic.properties.write) {
            await characteristic.writeValue(bytes);
        } else {
            await characteristic.writeValueWithoutResponse(bytes);
        }

        return {
            success: true,
            transport: "bluetooth",
            bytesSent: bytes.length
        };
    }

    if (connection.transport === "serial") {
        const writer = connection.device.writable?.getWriter();

        if (!writer) {
            throw new Error("El puerto serie no permite escritura.");
        }

        try {
            const bytes = toUint8Array(data);
            await writer.write(bytes);

            return {
                success: true,
                transport: "serial",
                bytesSent: bytes.length
            };
        } finally {
            writer.releaseLock();
        }
    }

    if (connection.transport === "usb") {
        const endpoint = connection.metadata.outputEndpoint;

        if (!endpoint) {
            throw new Error(
                "No se encontró un endpoint USB de salida."
            );
        }

        const bytes = toUint8Array(data);

        const result = await connection.device.transferOut(
            endpoint,
            bytes
        );

        if (result.status !== "ok") {
            throw new Error(
                "La transferencia USB no se completó correctamente."
            );
        }

        return {
            success: true,
            transport: "usb",
            bytesSent: result.bytesWritten
        };
    }

    if (connection.transport === "websocket") {
        if (connection.device.readyState !== WebSocket.OPEN) {
            throw new Error("La conexión de red está cerrada.");
        }

        connection.device.send(data);

        return {
            success: true,
            transport: "websocket",
            bytesSent: typeof data === "string"
                ? data.length
                : data.byteLength || 0
        };
    }

    throw new Error("Transporte no compatible.");
}

export async function readMachineData(
    machineId,
    options = {}
) {
    const connection = connections.get(machineId);

    if (!connection?.connected) {
        throw new Error("La máquina no está conectada.");
    }

    if (connection.transport === "bluetooth") {
        const characteristic = findBluetoothCharacteristic(
            connection,
            options.characteristicUUID,
            ["read"]
        );

        const value = await characteristic.readValue();

        return {
            transport: "bluetooth",
            data: new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength
            )
        };
    }

    if (connection.transport === "serial") {
        const reader = connection.device.readable?.getReader();

        if (!reader) {
            throw new Error("El puerto serie no permite lectura.");
        }

        try {
            const result = await reader.read();

            if (result.done) {
                throw new Error("El puerto serie se ha cerrado.");
            }

            return {
                transport: "serial",
                data: result.value
            };
        } finally {
            reader.releaseLock();
        }
    }

    if (connection.transport === "usb") {
        const endpoint = connection.metadata.inputEndpoint;

        if (!endpoint) {
            throw new Error(
                "No se encontró un endpoint USB de entrada."
            );
        }

        const length = Math.max(
            1,
            Math.min(Number(options.length) || 64, 4096)
        );

        const result = await connection.device.transferIn(
            endpoint,
            length
        );

        if (result.status !== "ok" || !result.data) {
            throw new Error(
                "No se pudieron leer datos del dispositivo USB."
            );
        }

        return {
            transport: "usb",
            data: new Uint8Array(
                result.data.buffer,
                result.data.byteOffset,
                result.data.byteLength
            )
        };
    }

    if (connection.transport === "websocket") {
        throw new Error(
            "WebSocket necesita un receptor de mensajes asíncrono; no se puede leer mediante esta operación."
        );
    }

    throw new Error("Transporte no compatible.");
}

function findBluetoothCharacteristic(
    connection,
    requestedUUID,
    allowedProperties
) {
    const characteristics = connection.metadata.services.flatMap(
        service => service.characteristics
    );

    const characteristic = characteristics.find(item => {
        const uuidMatches = requestedUUID
            ? item.uuid === requestedUUID
            : true;

        const propertyMatches = allowedProperties.some(
            property => item.properties[property]
        );

        return uuidMatches && propertyMatches;
    });

    if (!characteristic) {
        throw new Error(
            "No se encontró una característica Bluetooth compatible. Comprueba characteristicUUID."
        );
    }

    return characteristic;
}

function toUint8Array(data) {
    if (data instanceof Uint8Array) {
        return data;
    }

    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }

    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(
            data.buffer,
            data.byteOffset,
            data.byteLength
        );
    }

    if (typeof data === "string") {
        return new TextEncoder().encode(data);
    }

    throw new TypeError(
        "Los datos deben ser texto, ArrayBuffer o una secuencia de bytes."
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
        connections.get(machine.id)?.connected === true
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

export function getConnectionCapabilities(machineId = null) {
    const supportedProtocols = [];

    if (typeof navigator !== "undefined") {
        if (navigator.bluetooth?.requestDevice) {
            supportedProtocols.push("Bluetooth GATT");
        }

        if (navigator.serial?.requestPort) {
            supportedProtocols.push("USB/Serial mediante Web Serial");
        }

        if (navigator.usb?.requestDevice) {
            supportedProtocols.push("USB mediante WebUSB");
        }

        if (typeof WebSocket !== "undefined") {
            supportedProtocols.push("WebSocket para equipos de red");
        }
    }

    const baseCapabilities = {
        registryAvailable: true,
        connectionDriversAvailable: supportedProtocols.length > 0,
        automaticCountingAvailable: false,
        supportedProtocols,
        note: "Los transportes permiten establecer comunicación. El conteo automático requiere el protocolo documentado y probado de cada modelo."
    };

    if (!machineId) {
        return baseCapabilities;
    }

    const machine = getMachineById(machineId);

    if (!machine) {
        return {
            ...baseCapabilities,
            note: "No se encontró la máquina registrada."
        };
    }

    const connection = getConnectionStatus(machineId);

    return {
        ...baseCapabilities,
        machineId,
        machineName: machine.name,
        connectionType: machine.connectionType,
        connected: connection.connected,
        protocol: machine.protocol || null,
        protocolVerified: machine.protocolVerified === true,
        automaticCountingAvailable:
            isAutomaticCountingAvailable(machineId),
        note: connection.connected
            ? "Transporte conectado; falta validar el protocolo de conteo."
            : "Selecciona conectar para iniciar el transporte compatible."
    };
}
