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

    text(
        "cash-opening-balance",
        formatCurrency(summary.openingBalance)
    );

    text(
        "cash-income",
        formatCurrency(summary.income)
    );

    text(
        "cash-expenses",
        formatCurrency(summary.expenses)
    );

    text(
        "cash-balance",
        formatCurrency(summary.balance)
    );

    const container = el("cash-movement-list");
    if (!container) return;

    const movements = listCashMovements();

    container.innerHTML = movements.length
        ? movements.map(movement => `
            <article class="list-item">
                <div class="list-item-content">
                    <strong>
                        ${escapeHTML(movement.description)}
                    </strong>

                    <div class="text-muted text-small">
                        ${escapeHTML(formatDateTime(movement.createdAt))}
                    </div>

                    <div>
                        ${escapeHTML(formatCurrency(movement.amount))}
                    </div>
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
        `).join("")
        : `
            <div class="empty-state">
                <h3 class="empty-state-title">
                    No hay movimientos
                </h3>

                <p>
                    Los ingresos y gastos aparecerán aquí.
                </p>
            </div>
        `;
}