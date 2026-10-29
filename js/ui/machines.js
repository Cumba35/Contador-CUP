// js/ui/machines.js

export async function handleMachineAction(action, context) {
    const {
        id,
        confirmAction,
        setActiveMachine,
        connectMachine,
        disconnectMachine,
        removeMachine,
        persistMachineRegistry,
        renderMachines,
        notify
    } = context;

    switch (action) {
        case "select-machine": {
            setActiveMachine(id);
            renderMachines();
            notify("Máquina seleccionada.", "success");
            return true;
        }

        case "connect-machine": {
            const result = await connectMachine(id);
            renderMachines();

            if (result) {
                notify("Solicitud de conexión procesada.", "success");
            }

            return result;
        }

        case "disconnect-machine": {
            const result = await disconnectMachine(id);
            renderMachines();

            if (result) {
                notify("Solicitud de desconexión procesada.", "success");
            }

            return result;
        }

        case "delete-machine": {
            if (!confirmAction("¿Quieres eliminar esta máquina del registro?")) {
                return false;
            }

            removeMachine(id);
            persistMachineRegistry();
            renderMachines();
            notify("Máquina eliminada.", "success");
            return true;
        }

        default:
            return false;
    }
}

export function handleMachineForm(data, context) {
    const {
        registerMachine,
        persistMachineRegistry,
        renderMachines,
        notify
    } = context;

    const machine = registerMachine({
        name: data.name,
        type: data.type,
        brand: data.brand,
        model: data.model,
        serialNumber: data.serialNumber,
        image: data.image,
        description: data.description,
        features: data.features,
        connectionType: data.connectionType,
        connectionDetails: data.connectionDetails,
        protocol: data.protocol
    });

    persistMachineRegistry();
    renderMachines();
    notify("Máquina registrada.", "success");

    return machine;
}