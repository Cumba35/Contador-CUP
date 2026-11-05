
// js/ui/render-machines.js

import { getState } from "../state.js";

import {
    listMachines,
    MACHINE_TYPES
} from "../machines/registry.js";

import {
    getConnectionStatus,
    getConnectionCapabilities
} from "../machines/connections.js";

import { getMachineImage } from "../machines/image-storage.js";
import { escapeHTML } from "../utils.js";
import { el } from "./helpers.js";

let renderVersion = 0;
let activeImageUrls = [];

const MACHINE_TYPE_LABELS = Object.freeze({
    [MACHINE_TYPES.BILL_COUNTER]: "Contadora de billetes",
    [MACHINE_TYPES.COUNTERFEIT_DETECTOR]: "Detector de billetes falsos",
    [MACHINE_TYPES.BILL_SORTER]: "Clasificadora de billetes",
    [MACHINE_TYPES.OTHER]: "Otra máquina"
});

const CONNECTION_TYPE_LABELS = Object.freeze({
    none: "Sin conexión",
    usb: "USB",
    serial: "Puerto serie",
    bluetooth: "Bluetooth",
    network: "Red local",
    wifi: "Wi-Fi",
    other: "Otra",
    unknown: "No especificada"
});

const CONNECTION_STATUS_LABELS = Object.freeze({
    connected: "Conectada",
    disconnected: "Desconectada",
    "not-verified": "Sin verificar",
    unsupported: "Controlador no disponible",
    connecting: "Conectando",
    error: "Error de conexión",
    "connection-error": "Error de conexión"
});

function revokeActiveImageUrls() {
    activeImageUrls.forEach(url => {
        URL.revokeObjectURL(url);
    });

    activeImageUrls = [];
}

function getMachineTypeLabel(type) {
    return MACHINE_TYPE_LABELS[type] ||
        "Tipo no especificado";
}

function getConnectionTypeLabel(type) {
    return CONNECTION_TYPE_LABELS[type] ||
        "No especificada";
}

function getConnectionStatusLabel(status) {
    return CONNECTION_STATUS_LABELS[status] ||
        "Estado desconocido";
}

function renderSavedCapabilities(machine) {
    const capabilities = String(
        machine.connectionCapabilities ?? ""
    ).trim();

    if (!capabilities) {
        return "";
    }

    return `
        <div class="machine-capabilities">
            <strong>Capacidades registradas:</strong>
            <p>${escapeHTML(capabilities)}</p>
        </div>
    `;
}

function renderTechnicalCapabilities(capabilities) {
    if (
        !Array.isArray(capabilities) ||
        !capabilities.length
    ) {
        return "";
    }

    return `
        <div class="machine-technical-capabilities">
            <strong>Compatibilidad del dispositivo:</strong>
            <ul>
                ${capabilities.map(capability => `
                    <li>${escapeHTML(capability)}</li>
                `).join("")}
            </ul>
        </div>
    `;
}

function renderConnectionInformation(status, capabilities) {
    const connectionMessage = String(
        status?.message ?? ""
    ).trim();

    const transport = status?.transport
        ? String(status.transport).toUpperCase()
        : "";

    return `
        <div class="machine-connection-information">
            ${
                transport
                    ? `
                        <div>
                            <strong>Transporte activo:</strong>
                            ${escapeHTML(transport)}
                        </div>
                    `
                    : ""
            }

            ${
                connectionMessage
                    ? `
                        <p class="text-small">
                            ${escapeHTML(connectionMessage)}
                        </p>
                    `
                    : ""
            }

            ${
                capabilities?.note
                    ? `
                        <p class="text-small text-muted">
                            ${escapeHTML(capabilities.note)}
                        </p>
                    `
                    : ""
            }
        </div>
    `;
}

function renderProtocolInformation(machine, capabilities) {
    const verified = machine.protocolVerified === true;
    const automaticCounting =
        capabilities?.automaticCountingAvailable === true;

    return `
        <div class="machine-protocol-information">
            <div>
                <strong>Protocolo:</strong>
                ${machine.protocol
                    ? escapeHTML(machine.protocol)
                    : "No especificado"}
            </div>

            <div>
                <strong>Protocolo verificado:</strong>
                ${verified ? "Sí" : "No"}
            </div>

            <div>
                <strong>Conteo automático:</strong>
                ${automaticCounting
                    ? "Disponible"
                    : "No habilitado"}
            </div>
        </div>
    `;
}

function renderMachineCard(machine, activeMachine, imageUrls) {
    const selected = machine.id === activeMachine;

    const status = getConnectionStatus(machine.id);
    const capabilities = getConnectionCapabilities(machine.id);

    const imageUrl = imageUrls.get(machine.id);

    const connected = status?.connected === true;

    const statusLabel = getConnectionStatusLabel(
        status?.status
    );

    const connectionDetailsConfigured = Boolean(
        String(machine.connectionDetails ?? "").trim()
    );

    return `
        <article class="list-item machine-card">

            ${
                imageUrl
                    ? `
                        <div class="machine-card-image">
                            <img
                                src="${escapeHTML(imageUrl)}"
                                alt="Imagen de ${escapeHTML(machine.name)}"
                                loading="lazy"
                                style="
                                    display:block;
                                    width:100%;
                                    max-width:220px;
                                    max-height:160px;
                                    object-fit:contain;
                                    border-radius:8px;
                                "
                            >
                        </div>
                    `
                    : ""
            }

            <div class="list-item-content">

                <strong>
                    ${escapeHTML(machine.name)}
                </strong>

                <div class="text-muted text-small">
                    ${escapeHTML(machine.brand || "")}
                    ${escapeHTML(machine.model || "")}
                </div>

                <div>
                    <strong>Tipo:</strong>
                    ${escapeHTML(
                        getMachineTypeLabel(machine.type)
                    )}
                </div>

                <div>
                    <strong>Conexión:</strong>
                    ${escapeHTML(
                        getConnectionTypeLabel(
                            machine.connectionType
                        )
                    )}
                </div>

                <div>
                    <strong>Configuración técnica:</strong>
                    ${connectionDetailsConfigured
                        ? "Registrada"
                        : "Pendiente"}
                </div>

                ${
                    machine.serialNumber
                        ? `
                            <div>
                                <strong>Número de serie:</strong>
                                ${escapeHTML(machine.serialNumber)}
                            </div>
                        `
                        : ""
                }

                <div>
                    <strong>Estado de conexión:</strong>
                    <span
                        class="${
                            connected
                                ? "text-success"
                                : "text-muted"
                        }"
                    >
                        ${escapeHTML(statusLabel)}
                    </span>
                </div>

                ${
                    machine.description
                        ? `
                            <div class="text-small">
                                ${escapeHTML(machine.description)}
                            </div>
                        `
                        : ""
                }

                ${renderSavedCapabilities(machine)}

                ${renderProtocolInformation(
                    machine,
                    capabilities
                )}

                ${renderConnectionInformation(
                    status,
                    capabilities
                )}

                ${renderTechnicalCapabilities(
                    capabilities?.supportedProtocols
                )}

            </div>

            <div class="list-item-actions">

                <button
                    class="btn btn-secondary btn-sm"
                    type="button"
                    data-action="select-machine"
                    data-id="${escapeHTML(machine.id)}"
                    ${selected ? "disabled" : ""}
                >
                    ${selected ? "Seleccionada" : "Seleccionar"}
                </button>

                <button
                    class="btn btn-primary btn-sm"
                    type="button"
                    data-action="connect-machine"
                    data-id="${escapeHTML(machine.id)}"
                    ${connected ? "disabled" : ""}
                >
                    ${connected ? "Conectada" : "Conectar"}
                </button>

                <button
                    class="btn btn-secondary btn-sm"
                    type="button"
                    data-action="disconnect-machine"
                    data-id="${escapeHTML(machine.id)}"
                    ${connected ? "" : "disabled"}
                >
                    Desconectar
                </button>

                <button
                    class="btn btn-danger btn-sm"
                    type="button"
                    data-action="delete-machine"
                    data-id="${escapeHTML(machine.id)}"
                >
                    Eliminar
                </button>

            </div>

        </article>
    `;
}

export async function renderMachines() {
    const container = el("machine-list");

    if (!container) {
        return;
    }

    const currentRender = ++renderVersion;

    const machines = listMachines();

    const activeMachine =
        getState().machines?.activeMachineId;

    revokeActiveImageUrls();

    if (!machines.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h3 class="empty-state-title">
                    No hay máquinas registradas
                </h3>

                <p>
                    Registra una máquina para comenzar.
                </p>
            </div>
        `;

        return;
    }

    const imageUrls = new Map();

    await Promise.all(
        machines.map(async machine => {
            if (!machine.image) {
                return;
            }

            try {
                const imageBlob = await getMachineImage(
                    machine.image
                );

                if (imageBlob instanceof Blob) {
                    imageUrls.set(
                        machine.id,
                        URL.createObjectURL(imageBlob)
                    );
                }
            } catch (error) {
                console.error(
                    "No se pudo cargar la imagen de la máquina:",
                    machine.id,
                    error
                );
            }
        })
    );

    if (
        currentRender !== renderVersion ||
        !container.isConnected
    ) {
        imageUrls.forEach(url => {
            URL.revokeObjectURL(url);
        });

        return;
    }

    activeImageUrls = [...imageUrls.values()];

    container.innerHTML = machines.map(machine =>
        renderMachineCard(
            machine,
            activeMachine,
            imageUrls
        )
    ).join("");
}
