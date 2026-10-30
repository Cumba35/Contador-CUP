import {
    getCashSummary,
    listCashMovements
} from "../cash/movements.js";

import {
    formatCurrency,
    formatDateTime,
    escapeHTML
} from "../utils.js";

import {
    el,
    text
} from "./helpers.js";

export function renderCash() {
    const summary = getCashSummary();

    text("cash-opening-balance", formatCurrency(summary.openingBalance));
    text("cash-income", formatCurrency(summary.income));
    text("cash-expenses", formatCurrency(summary.expenses));
    text("cash-adjustments", formatCurrency(summary.adjustments));
    text("cash-current-balance", formatCurrency(summary.currentBalance));
    text("cash-movement-count", String(summary.movementCount));

    const container = el("cash-movement-list");

    if (!container) return;

    const movements = listCashMovements();

    container.innerHTML = movements.length
        ? movements.map(movement => {
            const labels = {
                income: "Entrada",
                expense: "Salida",
                adjustment: "Ajuste"
            };

            return `
                <article class="list-item">
                    <div class="list-item-content">
                        <strong>${escapeHTML(movement.description)}</strong>

                        <div class="text-muted text-small">
                            ${escapeHTML(labels[movement.type] || movement.type)}
                            · ${escapeHTML(formatDateTime(movement.createdAt))}
                        </div>

                        <div>
                            ${escapeHTML(formatCurrency(movement.amount))}
                        </div>

                        ${
                            movement.reference
                                ? `<div class="text-small">Referencia: ${escapeHTML(movement.reference)}</div>`
                                : ""
                        }

                        ${
                            movement.notes
                                ? `<div class="text-small">${escapeHTML(movement.notes)}</div>`
                                : ""
                        }
                    </div>

                    <div class="list-item-actions">
                        <button
                            class="btn btn-danger btn-sm"
                            type="button"
                            data-action="delete-movement"
                            data-id="${escapeHTML(movement.id)}"
                        >
                            Eliminar
                        </button>
                    </div>
                </article>
            `;
        }).join("")
        : `
            <div class="empty-state">
                <h3 class="empty-state-title">No hay movimientos</h3>
                <p>Los ingresos y gastos aparecerán aquí.</p>
            </div>
        `;
}