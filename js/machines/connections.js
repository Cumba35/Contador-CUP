
import { getState, setState } from "../state.js";
import {
    getMachineById,
    getActiveMachine
} from "./registry.js";

const connections = new Map();
const pendingConnections = new Set();

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

function getNavigator() {
    return typeof navigator !== "undefined" ? navigator : null;
}

function parseConnectionDetails(machine) {
    const raw = String(machine.connectionDetails || "").trim();

    if (!raw) return {};

    try {
        const parsed = JSON.parse(raw);

        if (
            !parsed ||
            typeof parsed !== "object" ||
            Array.isArray(parsed)
        ) {
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
    if (!error) {
        return "Error desconocido de conexión.";
    }

    switch (error.name) {
        case "NotFoundError":
            return "No se seleccionó ningún dispositivo.";

        case "SecurityError":
            return "El navegador no permite acceder al dispositivo. Comprueba los permisos y la conexión segura.";

        case "NotSupportedError":
            return "Este navegador no admite este tipo de conexión.";

        case "NetworkError":
            return "No se pudo establecer la comunicación.";

        case "InvalidStateError":
            return "El dispositivo se encuentra en un estado no válido.";

        case "AbortError":
            return "La operación fue cancelada.";

        case "TimeoutError":
            return "Se agotó el tiempo de espera.";

        default:
            return error.message || "No se pudo conectar con la máquina.";
    }
}

function getTimeout(value, fallback = 10000) {
    const timeout = Number(value);

    if (!Number.isFinite(timeout) || timeout <= 0) {
        return fallback;
    }

    return Math.min(Math.max(timeout, 1000), 60000);
}

function parseUUID(value) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error("Se encontró un UUID vacío o no válido.");
    }

    return value.trim();
}

function registerConnection(machine, transport, device, metadata = {}) {
    const previous = connections.get(machine.id);

    if (previous) {
        throw new Error(
            "La máquina ya tiene una conexión registrada."
        );
    }

    const connection = {
        machineId: machine.id,
        machineName: machine.name,
        transport,
        device,
        metadata,
        connected: true,
        connectedAt: new Date().toISOString(),
        disconnectHandler: null,
        messageHandler: null,
        errorHandler: null,
        messageQueue: [],
        messageWaiters: [],
        subscribers: new Set(),
        serialReader: null,
        serialReadPromise: null,
        serialReadStopped: false,
        bluetoothNotifications: new Map()
    };

    const onDisconnect = () => {
        connection.connected = false;

        if (connections.get(machine.id) === connection) {
            connections.delete(machine.id);
        }

        rejectMessageWaiters(
            connection,
            new Error("La conexión se ha cerrado.")
        );

        notifySubscribers(connection, {
            type: "disconnect",
            machineId: machine.id
        });

        updateAppStatus(machine.id, "disconnected");
    };

    connection.disconnectHandler = onDisconnect;

    if (
        transport === "bluetooth" &&
        device?.addEventListener
    ) {
        device.addEventListener("gattserverdisconnected", onDisconnect);
    }

    if (
        transport === "serial" &&
        device?.addEventListener
    ) {
        device.addEventListener("disconnect", onDisconnect);
    }

    if (
        transport === "usb" &&
        device?.addEventListener
    ) {
        device.addEventListener("disconnect", onDisconnect);
    }

    if (transport === "websocket" && device) {
        connection.messageHandler = event => {
            enqueueMessage(connection, event.data);
        };

        connection.errorHandler = () => {
            notifySubscribers(connection, {
                type: "error",
                message: "Error en la conexión WebSocket."
            });
        };

        device.addEventListener(
            "message",
            connection.messageHandler
        );

        device.addEventListener(
            "error",
            connection.errorHandler
        );

        device.addEventListener(
            "close",
            onDisconnect,
            { once: true }
        );
    }

    connections.set(machine.id, connection);
    updateAppStatus(machine.id, "connected");

    return connection;
}

function enqueueMessage(connection, data) {
    const waiter = connection.messageWaiters.shift();

    if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(data);
        return;
    }

    connection.messageQueue.push(data);

    if (connection.messageQueue.length > 100) {
        connection.messageQueue.shift();
    }

    notifySubscribers(connection, {
        type: "message",
        data
    });
}

function rejectMessageWaiters(connection, error) {
    for (const waiter of connection.messageWaiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(error);
    }
}

function notifySubscribers(connection, event) {
    for (const callback of connection.subscribers) {
        try {
            callback(event);
        } catch (error) {
            console.warn("Error en suscriptor de máquina:", error);
        }
    }
}

function waitForMessage(connection, timeout) {
    if (connection.messageQueue.length) {
        return Promise.resolve(connection.messageQueue.shift());
    }

    if (!connection.connected) {
        return Promise.reject(
            new Error("La conexión se ha cerrado.")
        );
    }

    return new Promise((resolve, reject) => {
        const waiter = {
            resolve,
            reject,
            timer: null
        };

        waiter.timer = setTimeout(() => {
            const index = connection.messageWaiters.indexOf(waiter);

            if (index !== -1) {
                connection.messageWaiters.splice(index, 1);
            }

            reject(
                new Error("No se recibieron datos dentro del tiempo esperado.")
            );
        }, timeout);

        connection.messageWaiters.push(waiter);
    });
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

/* -------------------------------------------------------
   BLUETOOTH GATT
------------------------------------------------------- */

function getBluetoothOptions(details) {
    const serviceUUIDs = Array.isArray(details.serviceUUIDs)
        ? details.serviceUUIDs.map(parseUUID)
        : [];

    if (!serviceUUIDs.length) {
        throw new Error(
            "Indica serviceUUIDs en los detalles Bluetooth. No se deben adivinar los servicios."
        );
    }

    return {
        acceptAllDevices: true,
        optionalServices: serviceUUIDs
    };
}

async function connectBluetooth(machine, details) {
    const nav = getNavigator();

    if (!nav?.bluetooth?.requestDevice) {
        throw new Error(
            "Bluetooth GATT no está disponible en este navegador."
        );
    }

    const options = getBluetoothOptions(details);
    const device = await nav.bluetooth.requestDevice(options);

    if (!device.gatt) {
        throw new Error(
            "El dispositivo seleccionado no ofrece Bluetooth GATT."
        );
    }

    const server = await device.gatt.connect();
    const services = [];

    try {
        for (const uuid of details.serviceUUIDs) {
            const service = await server.getPrimaryService(uuid);
            const characteristics = await service.getCharacteristics();

            services.push({
                uuid,
                service,
                characteristics
            });
        }

        if (!services.length) {
            throw new Error(
                "No se encontraron servicios Bluetooth accesibles."
            );
        }

        return registerConnection(
            machine,
            "bluetooth",
            device,
            {
                server,
                services
            }
        );
    } catch (error) {
        if (device.gatt.connected) {
            device.gatt.disconnect();
        }

        throw error;
    }
}

function findBluetoothCharacteristic(
    connection,
    requestedUUID,
    allowedProperties
) {
    const characteristics = connection.metadata.services.flatMap(
        service => service.characteristics
    );

    const normalizedUUID = requestedUUID
        ? String(requestedUUID).toLowerCase()
        : null;

    const characteristic = characteristics.find(item => {
        const uuidMatches = !normalizedUUID ||
            String(item.uuid).toLowerCase() === normalizedUUID;

        const propertyMatches = allowedProperties.some(
            property => item.properties?.[property] === true
        );

        return uuidMatches && propertyMatches;
    });

    if (!characteristic) {
        throw new Error(
            "No se encontró una característica Bluetooth compatible. Comprueba characteristicUUID y sus propiedades."
        );
    }

    return characteristic;
}

/* -------------------------------------------------------
   USB / SERIAL
------------------------------------------------------- */

async function connectSerial(machine, details) {
    const nav = getNavigator();

    if (!nav?.serial?.requestPort) {
        throw new Error(
            "Web Serial no está disponible en este navegador."
        );
    }

    const baudRate = Number(details.baudRate);

    if (!Number.isInteger(baudRate) || baudRate <= 0) {
        throw new Error(
            "Indica baudRate en los detalles de conexión. No se debe adivinar la velocidad del equipo."
        );
    }

    const port = await nav.serial.requestPort();

    try {
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
                baudRate
            }
        );
    } catch (error) {
        try {
            if (port.readable || port.writable) {
                await port.close();
            }
        } catch {}

        throw error;
    }
}

function getUSBAlternate(selectedInterface, details) {
    const alternates = selectedInterface.alternates || [];

    if (details.alternateSetting !== undefined) {
        const requested = Number(details.alternateSetting);

        return alternates.find(
            alternate => alternate.alternateSetting === requested
        ) || null;
    }

    return alternates.find(alternate =>
        alternate.endpoints?.some(
            endpoint => endpoint.type === "bulk"
        )
    ) || null;
}

async function connectUSB(machine, details) {
    const nav = getNavigator();

    if (!nav?.usb?.requestDevice) {
        throw new Error(
            "WebUSB no está disponible en este navegador."
        );
    }

    const filters = [];

    if (details.vendorId !== undefined) {
        const vendorId = Number(details.vendorId);

        if (!Number.isInteger(vendorId) || vendorId < 0) {
            throw new Error("vendorId USB no es válido.");
        }

        const filter = { vendorId };

        if (details.productId !== undefined) {
            const productId = Number(details.productId);

            if (!Number.isInteger(productId) || productId < 0) {
                throw new Error("productId USB no es válido.");
            }

            filter.productId = productId;
        }

        filters.push(filter);
    }

    if (!filters.length && details.allowAnyDevice !== true) {
        throw new Error(
            "Indica vendorId en los detalles USB o configura allowAnyDevice como true."
        );
    }

    const device = await nav.usb.requestDevice({ filters });

    let claimedInterface = null;

    try {
        await device.open();

        if (!device.configuration) {
            await device.selectConfiguration(
                Number(details.configurationValue) || 1
            );
        }

        const interfaces = device.configuration?.interfaces || [];

        const selectedInterface = details.interfaceNumber !== undefined
            ? interfaces.find(
                item => item.interfaceNumber === Number(details.interfaceNumber)
            )
            : interfaces.find(item =>
                item.alternates?.some(alternate =>
                    alternate.endpoints?.some(
                        endpoint => endpoint.type === "bulk"
                    )
                )
            );

        if (!selectedInterface) {
            throw new Error(
                "No se encontró la interfaz USB solicitada."
            );
        }

        const alternate = getUSBAlternate(
            selectedInterface,
            details
        );

        if (!alternate) {
            throw new Error(
                "No se encontró la configuración alternativa USB solicitada."
            );
        }

        const inputEndpoint = alternate.endpoints.find(
            endpoint =>
                endpoint.direction === "in" &&
                endpoint.type === "bulk"
        );

        const outputEndpoint = alternate.endpoints.find(
            endpoint =>
                endpoint.direction === "out" &&
                endpoint.type === "bulk"
        );

        await device.claimInterface(
            selectedInterface.interfaceNumber
        );

        claimedInterface = selectedInterface.interfaceNumber;

        if (
            alternate.alternateSetting !==
            selectedInterface.alternate.alternateSetting
        ) {
            await device.selectAlternateInterface(
                selectedInterface.interfaceNumber,
                alternate.alternateSetting
            );
        }

        return registerConnection(
            machine,
            "usb",
            device,
            {
                interfaceNumber: selectedInterface.interfaceNumber,
                alternateSetting: alternate.alternateSetting,
                inputEndpoint: inputEndpoint?.endpointNumber ?? null,
                outputEndpoint: outputEndpoint?.endpointNumber ?? null
            }
        );
    } catch (error) {
        if (claimedInterface !== null) {
            try {
                await device.releaseInterface(claimedInterface);
            } catch {}
        }

        try {
            if (device.opened) {
                await device.close();
            }
        } catch {}

        throw error;
    }
}

/* -------------------------------------------------------
   RED / WEBSOCKET
------------------------------------------------------- */

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
        typeof location !== "undefined" &&
        location.protocol === "https:" &&
        parsed.protocol !== "wss:"
    ) {
        throw new Error(
            "Una aplicación HTTPS no puede conectarse a un WebSocket inseguro."
        );
    }

    const socket = new WebSocket(url);
    const timeout = getTimeout(details.timeout);

    try {
        await new Promise((resolve, reject) => {
            let settled = false;

            const finish = (callback, value) => {
                if (settled) return;

                settled = true;
                clearTimeout(timer);

                socket.removeEventListener("open", onOpen);
                socket.removeEventListener("error", onError);
                socket.removeEventListener("close", onClose);

                callback(value);
            };

            const onOpen = () => finish(resolve);
            const onError = () => finish(
                reject,
                new Error("No se pudo abrir la conexión de red.")
            );

            const onClose = () => finish(
                reject,
                new Error("El servidor cerró la conexión antes de completarla.")
            );

            const timer = setTimeout(() => {
                finish(
                    reject,
                    new Error("Tiempo de espera agotado al conectar.")
                );

                try {
                    socket.close();
                } catch {}
            }, timeout);

            socket.addEventListener("open", onOpen);
            socket.addEventListener("error", onError);
            socket.addEventListener("close", onClose);
        });

        return registerConnection(
            machine,
            "websocket",
            socket,
            { url }
        );
    } catch (error) {
        try {
            socket.close();
        } catch {}

        throw error;
    }
}

/* -------------------------------------------------------
   APERTURA DE TRANSPORTES
------------------------------------------------------- */

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

/* -------------------------------------------------------
   ESTADO DE CONEXIÓN
------------------------------------------------------- */

export function getConnectionStatus(machineId = null) {
    const machine = machineId
        ? getMachineById(machineId)
        : getActiveMachine();

    if (!machine) {
        return {
            connected: false,
            status: "disconnected",
            machineId: null,
            transport: null,
            message: "No hay ninguna máquina seleccionada."
        };
    }

    const connection = connections.get(machine.id);

    let connected = Boolean(connection?.connected);

    if (
        connected &&
        connection.transport === "websocket"
    ) {
        connected = connection.device.readyState === WebSocket.OPEN;
    }

    if (
        connected &&
        connection.transport === "bluetooth"
    ) {
        connected = Boolean(connection.device.gatt?.connected);
    }

    if (
        connected &&
        connection.transport === "serial"
    ) {
        connected = Boolean(
            connection.device.readable ||
            connection.device.writable
        );
    }

    if (
        connected &&
        connection.transport === "usb"
    ) {
        connected = Boolean(connection.device.opened);
    }

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

    if (pendingConnections.has(machine.id)) {
        return createResult(
            false,
            "connecting",
            "Ya existe un intento de conexión en curso.",
            { machineId: machine.id }
        );
    }

    if (connections.has(machine.id)) {
        const current = getConnectionStatus(machine.id);

        if (current.connected) {
            return createResult(
                true,
                "connected",
                "La máquina ya está conectada.",
                {
                    machineId: machine.id,
                    transport: current.transport
                }
            );
        }

        await disconnectMachine(machine.id);
    }

    pendingConnections.add(machine.id);
    updateAppStatus(machine.id, "connecting");

    try {
        const details = parseConnectionDetails(machine);
        const connection = await openTransport(machine, details);

        return createResult(
            true,
            "connected",
            "Transporte conectado. El protocolo de conteo todavía debe verificarse.",
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
    } finally {
        pendingConnections.delete(machine.id);
    }
}

/* -------------------------------------------------------
   DESCONEXIÓN
------------------------------------------------------- */

export async function disconnectMachine(machineId = null) {
    const machine = machineId
        ? getMachineById(machineId)
        : getActiveMachine();

    if (!machine) {
        return createResult(
            false,
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

    connection.connected = false;

    try {
        if (connection.transport === "bluetooth") {
            for (const characteristic of connection.bluetoothNotifications.values()) {
                try {
                    await characteristic.stopNotifications();
                } catch {}
            }

            if (connection.device.gatt?.connected) {
                connection.device.gatt.disconnect();
            }
        }

        if (connection.transport === "serial") {
            connection.serialReadStopped = true;

            if (connection.serialReader) {
                try {
                    await connection.serialReader.cancel();
                } catch {}

                try {
                    connection.serialReader.releaseLock();
                } catch {}

                connection.serialReader = null;
            }

            if (connection.device.readable || connection.device.writable) {
                try {
                    await connection.device.close();
                } catch {}
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
            const socket = connection.device;

            if (socket.readyState === WebSocket.OPEN ||
                socket.readyState === WebSocket.CONNECTING) {
                socket.close(1000, "Desconexión solicitada");
            }

            if (connection.messageHandler) {
                socket.removeEventListener(
                    "message",
                    connection.messageHandler
                );
            }

            if (connection.errorHandler) {
                socket.removeEventListener(
                    "error",
                    connection.errorHandler
                );
            }

            if (connection.disconnectHandler) {
                socket.removeEventListener(
                    "close",
                    connection.disconnectHandler
                );
            }
        }
    } catch (error) {
        console.warn("Error al cerrar la conexión:", error);
    }

    rejectMessageWaiters(
        connection,
        new Error("La conexión se ha cerrado.")
    );

    connection.subscribers.clear();
    connection.messageQueue.length = 0;

    connections.delete(machine.id);
    updateAppStatus(machine.id, "disconnected");

    return createResult(
        true,
        "disconnected",
        "Se solicitó el cierre de la conexión.",
        { machineId: machine.id }
    );
}

/* -------------------------------------------------------
   ENVÍO DE DATOS
------------------------------------------------------- */

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
            if (characteristic.writeValueWithResponse) {
                await characteristic.writeValueWithResponse(bytes);
            } else {
                await characteristic.writeValue(bytes);
            }
        } else if (characteristic.writeValueWithoutResponse) {
            await characteristic.writeValueWithoutResponse(bytes);
        } else {
            throw new Error(
                "La característica Bluetooth no permite escritura."
            );
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

        if (endpoint === null) {
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
                ? new TextEncoder().encode(data).length
                : data.byteLength || 0
        };
    }

    throw new Error("Transporte no compatible.");
}

/* -------------------------------------------------------
   RECEPCIÓN DE DATOS
------------------------------------------------------- */

export async function readMachineData(
    machineId,
    options = {}
) {
    const connection = connections.get(machineId);

    if (!connection?.connected) {
        throw new Error("La máquina no está conectada.");
    }

    const timeout = getTimeout(options.timeout, 10000);

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
        if (connection.serialReader) {
            throw new Error(
                "Ya existe una operación de lectura serie en curso."
            );
        }

        const reader = connection.device.readable?.getReader();

        if (!reader) {
            throw new Error("El puerto serie no permite lectura.");
        }

        connection.serialReader = reader;

        let timer;

        try {
            const result = await Promise.race([
                reader.read(),
                new Promise((_, reject) => {
                    timer = setTimeout(
                        () => reject(
                            new Error("Tiempo de espera agotado al leer el puerto serie.")
                        ),
                        timeout
                    );
                })
            ]);

            if (result.done) {
                throw new Error("El puerto serie se ha cerrado.");
            }

            return {
                transport: "serial",
                data: result.value
            };
        } finally {
            clearTimeout(timer);

            if (connection.serialReader === reader) {
                connection.serialReader = null;
            }

            try {
                reader.releaseLock();
            } catch {}
        }
    }

    if (connection.transport === "usb") {
        const endpoint = connection.metadata.inputEndpoint;

        if (endpoint === null) {
            throw new Error(
                "No se encontró un endpoint USB de entrada."
            );
        }

        const length = Math.max(
            1,
            Math.min(Number(options.length) || 64, 4096)
        );

        const result = await Promise.race([
            connection.device.transferIn(endpoint, length),
            new Promise((_, reject) => {
                setTimeout(
                    () => reject(
                        new Error("Tiempo de espera agotado al leer USB.")
                    ),
                    timeout
                );
            })
        ]);

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
        const data = await waitForMessage(connection, timeout);

        return {
            transport: "websocket",
            data
        };
    }

    throw new Error("Transporte no compatible.");
}

/* -------------------------------------------------------
   SUSCRIPCIÓN A DATOS ENTRANTES
------------------------------------------------------- */

export async function subscribeMachineData(
    machineId,
    callback,
    options = {}
) {
    const connection = connections.get(machineId);

    if (!connection?.connected) {
        throw new Error("La máquina no está conectada.");
    }

    if (typeof callback !== "function") {
        throw new TypeError(
            "El receptor de datos debe ser una función."
        );
    }

    if (connection.transport === "bluetooth") {
        const characteristic = findBluetoothCharacteristic(
            connection,
            options.characteristicUUID,
            ["notify", "indicate"]
        );

        await characteristic.startNotifications();

        const handler = event => {
            const value = event.target.value;

            callback({
                type: "data",
                transport: "bluetooth",
                data: new Uint8Array(
                    value.buffer,
                    value.byteOffset,
                    value.byteLength
                )
            });
        };

        characteristic.addEventListener(
            "characteristicvaluechanged",
            handler
        );

        connection.bluetoothNotifications.set(
            characteristic.uuid,
            characteristic
        );

        return () => {
            characteristic.removeEventListener(
                "characteristicvaluechanged",
                handler
            );

            characteristic.stopNotifications().catch(() => {});

            connection.bluetoothNotifications.delete(
                characteristic.uuid
            );
        };
    }

    if (connection.transport === "websocket") {
        connection.subscribers.add(callback);

        return () => {
            connection.subscribers.delete(callback);
        };
    }

    throw new Error(
        "La suscripción continua no está implementada para este transporte. Usa readMachineData."
    );
}

/* -------------------------------------------------------
   VALIDACIÓN DEL PROTOCOLO
------------------------------------------------------- */

export function isAutomaticCountingAvailable(machineId = null) {
    const machine = machineId
        ? getMachineById(machineId)
        : getActiveMachine();

    if (!machine) return false;

    const connection = connections.get(machine.id);

    return Boolean(
        connection?.connected &&
        machine.protocolVerified === true &&
        machine.automaticCountingEnabled === true
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

    if (!machine.brand) {
        errors.push("Falta la marca.");
    }

    if (!machine.model) {
        errors.push("Falta el modelo exacto.");
    }

    if (!machine.protocol) {
        errors.push("Falta el protocolo documentado.");
    }

    if (machine.protocolVerified !== true) {
        errors.push(
            "El protocolo no ha sido verificado mediante pruebas."
        );
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/* -------------------------------------------------------
   CAPACIDADES DEL NAVEGADOR
------------------------------------------------------- */

export function getConnectionCapabilities(machineId = null) {
    const nav = getNavigator();
    const supportedProtocols = [];

    if (nav?.bluetooth?.requestDevice) {
        supportedProtocols.push("Bluetooth GATT");
    }

    if (nav?.serial?.requestPort) {
        supportedProtocols.push("USB/Serial mediante Web Serial");
    }

    if (nav?.usb?.requestDevice) {
        supportedProtocols.push("USB mediante WebUSB");
    }

    if (typeof WebSocket !== "undefined") {
        supportedProtocols.push("WebSocket para equipos de red");
    }

    const baseCapabilities = {
        registryAvailable: true,
        connectionDriversAvailable: supportedProtocols.length > 0,
        automaticCountingAvailable: false,
        supportedProtocols,
        note: "Los transportes permiten comunicar datos. El conteo automático requiere el protocolo documentado y probado de cada modelo."
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
