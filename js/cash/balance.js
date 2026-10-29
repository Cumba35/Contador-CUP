// js/cash/balance.js

import { getState } from "../state.js";
import { listCashMovements } from "./movements.js";

function toAmount(value) {
    const amount = Number(value ?? 0);
    return Number.isSafeInteger(amount) ? amount : 0;
}

function getMovementEffect(movement) {
    const amount = toAmount(movement.amount);

    switch (movement.type) {
        case "income":
        case "adjustment":
            return amount;
        case "expense":
            return -amount;
        default:
            return 0;
    }
}

export function calculateCashBalance(options = {}) {
    const openingBalance = toAmount(
        options.openingBalance ?? getState().cash.openingBalance
    );

    const movements = Array.isArray(options.movements)
        ? options.movements
        : listCashMovements();

    return movements.reduce(
        (balance, movement) => balance + getMovementEffect(movement),
        openingBalance
    );
}

export function getCashBalanceBreakdown() {
    const movements = listCashMovements();

    const summary = {
        openingBalance: toAmount(getState().cash.openingBalance),
        income: 0,
        expenses: 0,
        adjustments: 0,
        movementCount: movements.length
    };

    for (const movement of movements) {
        const amount = toAmount(movement.amount);

        switch (movement.type) {
            case "income":
                summary.income += amount;
                break;
            case "expense":
                summary.expenses += amount;
                break;
            case "adjustment":
                summary.adjustments += amount;
                break;
            default:
                break;
        }
    }

    summary.netMovement =
        summary.income - summary.expenses + summary.adjustments;

    summary.currentBalance =
        summary.openingBalance + summary.netMovement;

    return summary;
}

export function getCashBalanceAt(date) {
    const cutoff = new Date(date);

    if (Number.isNaN(cutoff.getTime())) {
        throw new Error("La fecha indicada no es válida.");
    }

    const movements = listCashMovements().filter(movement => {
        const timestamp = new Date(movement.createdAt).getTime();

        return Number.isFinite(timestamp) && timestamp <= cutoff.getTime();
    });

    return calculateCashBalance({ movements });
}

export function verifyCashBalance() {
    const calculated = calculateCashBalance();
    const stored = toAmount(getState().cash.currentBalance);

    return {
        consistent: calculated === stored,
        calculatedBalance: calculated,
        storedBalance: stored,
        difference: calculated - stored
    };
}