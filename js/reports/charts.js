// js/reports/charts.js

import {
    getDailyStatistics,
    getDenominationStatistics,
    getMonthlyStatistics
} from "./statistics.js";

function toFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

export function getDailyChartData(startDate = "", endDate = "") {
    const days = getDailyStatistics(startDate, endDate);

    return {
        type: "line",
        title: "Importe contado por día",
        labels: days.map(day => day.date),
        datasets: [
            {
                label: "Importe total (CUP)",
                data: days.map(day => toFiniteNumber(day.totalAmount))
            },
            {
                label: "Cantidad de conteos",
                data: days.map(day => toFiniteNumber(day.count))
            }
        ]
    };
}

export function getDenominationChartData(startDate = "", endDate = "") {
    const denominations = getDenominationStatistics(startDate, endDate)
        .filter(item => item.quantity > 0);

    return {
        type: "bar",
        title: "Distribución por denominación",
        labels: denominations.map(item => item.label),
        datasets: [
            {
                label: "Cantidad de billetes",
                data: denominations.map(item => toFiniteNumber(item.quantity))
            },
            {
                label: "Importe (CUP)",
                data: denominations.map(item => toFiniteNumber(item.subtotal))
            }
        ]
    };
}

export function getMonthlyChartData(year) {
    const months = getMonthlyStatistics(year);

    return {
        type: "bar",
        title: `Importes mensuales de ${year}`,
        labels: months.map(item =>
            new Intl.DateTimeFormat("es-CU", {
                month: "short"
            }).format(new Date(Number(year), item.month - 1, 1))
        ),
        datasets: [
            {
                label: "Importe total (CUP)",
                data: months.map(item => toFiniteNumber(item.totalAmount))
            },
            {
                label: "Cantidad de conteos",
                data: months.map(item => toFiniteNumber(item.count))
            }
        ]
    };
}

export function getChartSummary(chartData) {
    if (!chartData || !Array.isArray(chartData.datasets)) {
        throw new TypeError("Los datos del gráfico no son válidos.");
    }

    return chartData.datasets.map(dataset => {
        const values = Array.isArray(dataset.data)
            ? dataset.data.map(toFiniteNumber)
            : [];

        return {
            label: dataset.label || "Serie",
            count: values.length,
            total: values.reduce((sum, value) => sum + value, 0),
            maximum: values.length ? Math.max(...values) : 0,
            minimum: values.length ? Math.min(...values) : 0
        };
    });
}

export function exportChartDataAsJSON(chartData) {
    if (!chartData || typeof chartData !== "object") {
        throw new TypeError("No hay datos de gráfico para exportar.");
    }

    return JSON.stringify({
        application: "Contador-CUP",
        exportedAt: new Date().toISOString(),
        chart: chartData
    }, null, 2);
}