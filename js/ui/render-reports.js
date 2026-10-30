import {
    getOverallStatistics,
    getDailyStatistics,
    getDenominationStatistics
} from "../reports/statistics.js";

import {
    formatCurrency,
    formatNumber,
    escapeHTML
} from "../utils.js";

import {
    el,
    text
} from "./helpers.js";

export function renderReports() {
    const stats = getOverallStatistics();

    text("report-count", formatNumber(stats.count, 0));
    text("report-total", formatCurrency(stats.totalAmount));
    text("report-bills", formatNumber(stats.totalBills, 0));
    text("report-average", formatCurrency(stats.averageAmount));

    const start = el("report-start-date")?.value ?? "";
    const end = el("report-end-date")?.value ?? "";

    const daily = el("daily-report-list");

    if (daily) {
        const rows = getDailyStatistics(start, end);

        daily.innerHTML = rows.length
            ? rows.map(day => `
                <tr>
                    <td>${escapeHTML(day.date)}</td>
                    <td>${formatNumber(day.count, 0)}</td>
                    <td>${escapeHTML(formatCurrency(day.totalAmount))}</td>
                    <td>${formatNumber(day.totalBills, 0)}</td>
                </tr>
            `).join("")
            : '<tr><td colspan="4">No hay datos disponibles.</td></tr>';
    }

    const denominations = el("denomination-report-list");

    if (denominations) {
        denominations.innerHTML =
            getDenominationStatistics(start, end)
                .map(item => `
                    <tr>
                        <td>${escapeHTML(item.label)}</td>
                        <td>${formatNumber(item.quantity, 0)}</td>
                        <td>${escapeHTML(formatCurrency(item.subtotal))}</td>
                    </tr>
                `).join("");
    }
}