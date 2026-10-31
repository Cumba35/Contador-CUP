
import { getState } from "../state.js";
import { listCashMovements } from "./movements.js";

function toCents(value) {
    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount)) {
        return 0;
    }

    const cents = Math.round(amount * 100);

    return Number.isSafeInteger(cents) ? cents : 0;
}

function fromCents(cents) {
    return cents / 100;
}

function validateBalance(balance) {
    if (!Number.isSafeInteger(balance)) {
        throw new Error(
            "El saldo de caja supera el límite numérico permitido."
        );
    }

    return balance;
}

function getMovementEffectCents(movement) {
    const amount = toCents(movement.amount);

    switch (movement.type) {
        case "income":
        case "in":
        case "adjustment":
            return amount;

        case "expense":
        case "out":
            return -amount;

        default:
            return 0;
    }
}

function getMovementTimestamp(movement) {
    const date = movement.createdAt ?? movement.at;
    const timestamp = new Date(date).getTime();

    return Number.isFinite(timestamp) ? timestamp : null;
}

function getOpeningBalanceCents() {
    return toCents(
        getState().cash?.openingBalance ?? 0
    );
}

export function calculateCashBalance(options = {}) {
    const openingBalance = toCents(
        options.openingBalance ??
        getState().cash?.openingBalance ??
        0
    );

    const movements = Array.isArray(options.movements)
        ? options.movements
        : listCashMovements();

    const balance = movements.reduce(
        (total, movement) => {
            return total + getMovementEffectCents(movement);
        },
        openingBalance
    );

    return fromCents(validateBalance(balance));
}

export function getCashBalanceBreakdown() {
    const movements = listCashMovements();

    const summary = {
        openingBalance: getOpeningBalanceCents(),
        income: 0,
        expenses: 0,
        adjustments: 0,
        movementCount: movements.length
    };

    for (const movement of movements) {
        const amount = toCents(movement.amount);

        switch (movement.type) {
            case "income":
            case "in":
                summary.income += amount;
                break;

            case "expense":
            case "out":
                summary.expenses += amount;
                break;

            case "adjustment":
                summary.adjustments += amount;
                break;
        }
    }

    const netMovement =
        summary.income -
        summary.expenses +
        summary.adjustments;

    const currentBalance =
        summary.openingBalance + netMovement;

    validateBalance(summary.income);
    validateBalance(summary.expenses);
    validateBalance(summary.adjustments);
    validateBalance(netMovement);
    validateBalance(currentBalance);

    return {
        openingBalance: fromCents(summary.openingBalance),
        income: fromCents(summary.income),
        expenses: fromCents(summary.expenses),
        adjustments: fromCents(summary.adjustments),
        movementCount: summary.movementCount,
        netMovement: fromCents(netMovement),
        currentBalance: fromCents(currentBalance)
    };
}

export function getCashBalanceAt(date) {
    const cutoff = new Date(date);

    if (Number.isNaN(cutoff.getTime())) {
        throw new Error("La fecha indicada no es válida.");
    }

    const movements = listCashMovements().filter(movement => {
        const timestamp = getMovementTimestamp(movement);

        return (
            timestamp !== null &&
            timestamp <= cutoff.getTime()
        );
    });

    return calculateCashBalance({
        movements
    });
}

export function verifyCashBalance() {
    const calculated = calculateCashBalance();

    const stored = fromCents(
        toCents(
            getState().cash?.currentBalance ?? 0
        )
    );

    return {
        consistent: calculated === stored,
        calculatedBalance: calculated,
        storedBalance: stored,
        difference: fromCents(
            toCents(calculated) - toCents(stored)
        )
    };
}
