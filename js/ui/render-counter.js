import { APP_CONFIG } from "../config.js";
import { getState } from "../state.js";

import {
    getCounterSummary
} from "../counter/calculator.js";

import {
    canUndo,
    canRedo
} from "../counter/undo-redo.js";

import {
    formatCurrency,
    formatNumber,
    escapeHTML
} from "../utils.js";

import {
    el,
    text
} from "./helpers.js";

export function updateUndoButtons() {
    const undoButton = el("undo-button");
    const redoButton = el("redo-button");

    if (undoButton) {
        undoButton.disabled = !canUndo();
    }

    if (redoButton) {
        redoButton.disabled = !canRedo();
    }
}

export function renderCounter() {
    const state = getState();
    const summary = getCounterSummary();

    text("counter-total", formatCurrency(summary.total));
    text("counter-bills", formatNumber(summary.totalBills, 0));

    text(
        "counter-denomination-count",
        formatNumber(
            state.denominations.filter(item => item.enabled).length,
            0
        )
    );

    text(
        "current-draft-name",
        state.counter.draftName || "Conteo sin guardar"
    );

    const container = el("denomination-list");

    if (container) {
        container.innerHTML = state.denominations
            .filter(item => item.enabled)
            .sort((a, b) => b.value - a.value)
            .map(item => {
                const quantity =
                    state.counter.quantities[item.id] ?? 0;

                const id = escapeHTML(item.id);
                const label = escapeHTML(item.label);

                return `
                    <article class="denomination-card">
                        <div class="denomination-value">
                            ${label}
                        </div>

                        <div class="denomination-controls">
                            <button
                                class="btn-icon"
                                type="button"
                                data-action="decrement"
                                data-id="${id}"
                                aria-label="Restar ${label}"
                            >−</button>

                            <input
                                id="quantity-${id}"
                                type="number"
                                min="0"
                                max="${APP_CONFIG.limits.denominationQuantity}"
                                step="1"
                                inputmode="numeric"
                                value="${quantity}"
                                data-action="quantity"
                                data-id="${id}"
                                aria-label="Cantidad de ${label}"
                            >

                            <button
                                class="btn-icon"
                                type="button"
                                data-action="increment"
                                data-id="${id}"
                                aria-label="Añadir ${label}"
                            >+</button>
                        </div>

                        <div class="denomination-subtotal">
                            Subtotal:
                            <strong id="subtotal-${id}">
                                ${formatCurrency(item.value * quantity)}
                            </strong>
                        </div>
                    </article>
                `;
            })
            .join("");
    }

    updateUndoButtons();
}