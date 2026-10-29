// js/history/comparison.js

import { listRecords, getRecordById } from "./records.js";

function normalizeRecord(record) {
    if (!record || typeof record !== "object") {
        throw new TypeError("El conteo seleccionado no es válido.");
    }

    const total = Number(record.total ?? 0);
    const totalBills = Number(record.totalBills ?? 0);

    if (!Number.isFinite(total) || total < 0) {
        throw new Error("El importe del conteo no es válido.");
    }

    if (!Number.isFinite(totalBills) || totalBills < 0) {
        throw new Error("La cantidad de billetes no es válida.");
    }

    return {
        id: record.id,
        name: record.name || "Conteo sin nombre",
        total,
        totalBills,
        denominationCount: Number(record.denominationCount ?? 0),
        createdAt: record.createdAt,
        breakdown: Array.isArray(record.breakdown)
            ? record.breakdown.map(item => ({ ...item }))
            : []
    };
}

function calculateDifference(first, second, field) {
    const difference = second[field] - first[field];

    return {
        value: difference,
        percentage: first[field] === 0
            ? null
            : (difference / first[field]) * 100
    };
}

export function compareRecords(firstId, secondId) {
    const firstRecord = getRecordById(firstId);
    const secondRecord = getRecordById(secondId);

    if (!firstRecord || !secondRecord) {
        throw new Error("No se encontraron ambos conteos para compararlos.");
    }

    if (firstId === secondId) {
        throw new Error("Selecciona dos conteos diferentes.");
    }

    const first = normalizeRecord(firstRecord);
    const second = normalizeRecord(secondRecord);

    const denominationMap = new Map();

    for (const item of [...first.breakdown, ...second.breakdown]) {
        if (!denominationMap.has(item.denominationId)) {
            denominationMap.set(item.denominationId, {
                denominationId: item.denominationId,
                label: item.label,
                value: Number(item.value ?? 0),
                firstQuantity: 0,
                secondQuantity: 0,
                firstSubtotal: 0,
                secondSubtotal: 0
            });
        }
    }

    for (const item of first.breakdown) {
        const entry = denominationMap.get(item.denominationId);
        entry.firstQuantity = Number(item.quantity ?? 0);
        entry.firstSubtotal = Number(item.subtotal ?? 0);
    }

    for (const item of second.breakdown) {
        const entry = denominationMap.get(item.denominationId);
        entry.label = item.label;
        entry.value = Number(item.value ?? entry.value);
        entry.secondQuantity = Number(item.quantity ?? 0);
        entry.secondSubtotal = Number(item.subtotal ?? 0);
    }

    const denominations = [...denominationMap.values()]
        .map(item => ({
            ...item,
            quantityDifference: item.secondQuantity - item.firstQuantity,
            subtotalDifference: item.secondSubtotal - item.firstSubtotal
        }))
        .sort((a, b) => b.value - a.value);

    return {
        first,
        second,
        differences: {
            total: calculateDifference(first, second, "total"),
            totalBills: calculateDifference(first, second, "totalBills"),
            denominationCount: calculateDifference(
                first,
                second,
                "denominationCount"
            )
        },
        denominations
    };
}

export function compareLatestRecords(count = 2) {
    const validCount = Number(count);

    if (!Number.isInteger(validCount) || validCount < 2 || validCount > 20) {
        throw new Error("La cantidad de conteos debe estar entre 2 y 20.");
    }

    const records = listRecords().slice(0, validCount);

    if (records.length < 2) {
        throw new Error("Se necesitan al menos dos conteos guardados.");
    }

    return records.map(record => normalizeRecord(record));
}

export function getRecordChangeSummary(firstId, secondId) {
    const comparison = compareRecords(firstId, secondId);

    const firstTotal = comparison.first.total;
    const secondTotal = comparison.second.total;
    const difference = secondTotal - firstTotal;

    let trend = "sin-cambios";

    if (difference > 0) {
        trend = "aumento";
    } else if (difference < 0) {
        trend = "disminucion";
    }

    return {
        trend,
        difference,
        absoluteDifference: Math.abs(difference),
        percentage: firstTotal === 0
            ? null
            : (difference / firstTotal) * 100,
        firstName: comparison.first.name,
        secondName: comparison.second.name
    };
}