import { getState } from "../state.js";
import {
    setTheme,
    applySavedTheme
} from "../settings/preferences.js";
import { escapeHTML } from "../utils.js";
import { el } from "./helpers.js";

export function renderDenominationSettings() {
    const container = el("denomination-settings-list");

    if (!container) return;

    const denominations = getState().denominations
        .slice()
        .sort((a, b) => b.value - a.value);

    container.innerHTML = denominations.map(item => `
        <article class="list-item">
            <div class="list-item-content">
                <strong>${escapeHTML(item.label)}</strong>

                <div class="text-muted text-small">
                    Valor: ${escapeHTML(String(item.value))}
                </div>

                <div>
                    Estado: ${item.enabled ? "Activa" : "Desactivada"}
                </div>
            </div>

            <div class="list-item-actions">
                <button
                    class="btn btn-secondary btn-sm"
                    type="button"
                    data-action="toggle-denomination"
                    data-id="${escapeHTML(item.id)}"
                >
                    ${item.enabled ? "Desactivar" : "Activar"}
                </button>

                ${
                    item.custom
                        ? `
                            <button
                                class="btn btn-danger btn-sm"
                                type="button"
                                data-action="delete-denomination"
                                data-id="${escapeHTML(item.id)}"
                            >
                                Eliminar
                            </button>
                        `
                        : ""
                }
            </div>
        </article>
    `).join("");
}

export function applyTheme(theme) {
    if (!["light", "dark", "system"].includes(theme)) {
        return false;
    }

    setTheme(theme);
    applySavedTheme();

    return true;
}