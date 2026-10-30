import { getState } from "../state.js";

import {
    listMachines,
    MACHINE_TYPES
} from "../machines/registry.js";

import {
    getConnectionStatus,
    getConnectionCapabilities
} from "../machines/connections.js";

import { escapeHTML } from "../utils.js";
import { el } from "./helpers.js";

export function renderMachines() {
    const container = el("machine-list");
    if (!container) return;

    const machines = listMachines();
    const activeMachine = getState().machines?.activeMachineId;

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

    container.innerHTML = machines.map(machine => {
        const selected = machine.id === activeMachine;
        const status = getConnectionStatus(machine.id);
        const capabilities = getConnectionCapabilities(machine.id);

        return `
            <article class="list-item machine-card">
                <div class="list-item-content">
                    <strong>
                        ${escapeHTML(machine.name)}
                    </strong>

                    <div class="text-muted text-small">
                        ${escapeHTML(machine.brand || "")}
                        ${escapeHTML(machine.model || "")}
                    </div>

                    <div>
                        Tipo:
                        ${escapeHTML(
                            MACHINE_TYPES[machine.type] || machine.type || "No especificado"
                        )}
                    </div>

                    <div>
                        Conexión:
                        ${escapeHTML(machine.connectionType || "No especificada")}
                    </div>

                    <div>
                        Estado:
                        ${escapeHTML(status?.status || "Desconectada")}
                    </div>

                    ${
                        capabilities
                            ? `<div class="text-small">
                                ${escapeHTML(
                                    Array.isArray(capabilities)
                                        ? capabilities.join(", ")
                                        : ""
                                )}
                            </div>`
                            : ""
                    }
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
                    >
                        Conectar
                    </button>

                    <button
                        class="btn btn-secondary btn-sm"
                        type="button"
                        data-action="disconnect-machine"
                        data-id="${escapeHTML(machine.id)}"
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
    }).join("");
}