// js/reports/statistics.js

import { listRecords } from "../history/records.js";
import { getState } from "../state.js";

function validAmount(value) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function getDateKey(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function filterByDateRange(records, startDate, endDate) {
    return records.filter(record => {
        const key = getDateKey(record.createdAt);

        if (!key) {
            return false;
        }

        if (startDate && key < startDate) {
            return false;
        }

        if (endDate && key > endDate) {
            return false;
        }

        return true;
    });
}

function summarizeRecords(records) {
    return {
        count: records.length,
        totalAmount: records.reduce(
            (sum, record) => sum + validAmount(record.total),
            0
        ),
        totalBills: records.reduce(
            (sum, record) => sum + validAmount(record.totalBills),
            0
        ),
        averageAmount: records.length
            ? records.reduce(
                (sum, record) => sum + validAmount(record.total),
                0
            ) / records.length
            : 0,
        highestAmount: records.reduce(
            (max, record) => Math.max(max, validAmount(record.total)),
            0
        ),
        lowestAmount: records.length
            ? records.reduce(
                (min, record) => Math.min(min, validAmount(record.total)),
                Infinity
            )
            : 0
    };
}

export function getOverallStatistics() {
    const records = listRecords();
    const summary = summarizeRecords(records);

    return {
        ...summary,
        denominationCount: getState().denominations.length,
        enabledDenominationCount: getState().denominations.filter(
            item => item.enabled
        ).length,
        generatedAt: new Date().toISOString()
    };
}

export function getStatisticsByDateRange(startDate = "", endDate = "") {
    if (startDate && endDate && startDate > endDate) {
        throw new Error("La fecha inicial no puede superar la fecha final.");
    }

    const records = filterByDateRange(
        listRecords(),
        startDate,
        endDate
    );

    return {
        startDate,
        endDate,
        ...summarizeRecords(records),
        records
    };
}

export function getDailyStatistics(startDate = "", endDate = "") {
    const records = filterByDateRange(
        listRecords(),
        startDate,
        endDate
    );

    const dailyMap = new Map();

    for (const record of records) {
        const date = getDateKey(record.createdAt);

        if (!date) {
            continue;
        }

        if (!dailyMap.has(date)) {
            dailyMap.set(date, {
                date,
                count: 0,
                totalAmount: 0,
                totalBills: 0
            });
        }

        const day = dailyMap.get(date);

        day.count += 1;
        day.totalAmount += validAmount(record.total);
        day.totalBills += validAmount(record.totalBills);
    }

    return [...dailyMap.values()].sort(
        (a, b) => a.date.localeCompare(b.date)
    );
}

export function getDenominationStatistics(startDate = "", endDate = "") {
    const records = filterByDateRange(
        listRecords(),
        startDate,
        endDate
    );

    const denominationMap = new Map();

    for (const denomination of getState().denominations) {
        denominationMap.set(denomination.id, {
            denominationId: denomination.id,
            label: denomination.label,
            value: denomination.value,
            quantity: 0,
            subtotal: 0
        });
    }

    for (const record of records) {
        for (const item of record.breakdown ?? []) {
            const entry = denominationMap.get(item.denominationId);

            if (!entry) {
                continue;
            }

            entry.quantity += validAmount(item.quantity);
            entry.subtotal += validAmount(item.subtotal);
        }
    }

    return [...denominationMap.values()]
        .sort((a, b) => b.value - a.value);
}

export function getMonthlyStatistics(year) {
    const targetYear = Number(year);

    if (!Number.isInteger(targetYear) || targetYear < 1 || targetYear > 9999) {
        throw new Error("El año indicado no es válido.");
    }

    const records = listRecords().filter(record => {
        const date = new Date(record.createdAt);

        return (
            !Number.isNaN(date.getTime()) &&
            date.getFullYear() === targetYear
        );
    });

    const months = Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        count: 0,
        totalAmount: 0,
        totalBills: 0
    }));

    for (const record of records) {
        const month = new Date(record.createdAt).getMonth();
        const entry = months[month];

        entry.count += 1;
        entry.totalAmount += validAmount(record.total);
        entry.totalBills += validAmount(record.totalBills);
    }

    return months;
}

export function getStatisticsSnapshot() {
    return {
        overall: getOverallStatistics(),
        daily: getDailyStatistics(),
        denominations: getDenominationStatistics(),
        generatedAt: new Date().toISOString()
    };
}