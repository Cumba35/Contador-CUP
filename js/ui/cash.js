
// js/ui/cash.js

export async function handleCashAction(action, context) {
    const {
        id,
        value,
        confirmAction,
        deleteCashMovement,
        setOpeningBalance,
        persistOpeningBalance,
        renderCash,
        notify
    } = context;

    switch (action) {
        case "delete-movement":
            if (!confirmAction("¿Quieres eliminar este movimiento de caja?")) {
                return false;
            }

            deleteCashMovement(id);
            renderCash();
            notify("Movimiento eliminado.", "success");
            return true;

        case "set-opening-balance": {
            const amount = Number(value("opening-balance-input"));

            setOpeningBalance(amount);
            persistOpeningBalance(amount);
            renderCash();
            notify("Saldo inicial actualizado.", "success");
            return true;
        }

        default:
            return false;
    }
}

export function handleCashForm(data, context) {
    const {
        addCashMovement,
        renderCash,
        notify
    } = context;

    const movement = addCashMovement({
        type: data.type,
        amount: Number(data.amount),
        description: data.description,
        reference: data.reference,
        notes: data.notes
    });

    renderCash();
    notify("Movimiento de caja registrado.", "success");

    return movement;
}
