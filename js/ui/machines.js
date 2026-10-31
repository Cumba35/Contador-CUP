// js/ui/machines.js

import {
    getMachineById
} from "../machines/registry.js";

import {
    saveMachineImage,
    deleteMachineImage
} from "../machines/image-storage.js";

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

            const machine = getMachineById(id);
            const removed = removeMachine(id);

            if (!removed) {
                return false;
            }

            persistMachineRegistry();

            if (machine?.image) {
                try {
                    await deleteMachineImage(machine.image);
                } catch (error) {
                    console.error(
                        "No se pudo eliminar la imagen de la máquina:",
                        error
                    );
                }
            }

            renderMachines();
            notify("Máquina eliminada.", "success");
            return true;
        }

        default:
            return false;
    }
}

export async function handleMachineForm(data, context) {
    const {
        registerMachine,
        persistMachineRegistry,
        renderMachines,
        notify
    } = context;

    let savedImageId = null;

    try {
        const imageFile = data.imageFile;

        const machineData = {
            name: data.name,
            type: data.type,
            brand: data.brand,
            model: data.model,
            serialNumber: data.serialNumber,
            image: data.image || "",
            description: data.description,
            features: data.features,
            connectionType: data.connectionType,
            connectionDetails: data.connectionDetails,
            protocol: data.protocol
        };

        if (imageFile) {
            savedImageId = await saveMachineImage(imageFile);
            machineData.image = savedImageId;
        }

        const machine = registerMachine(machineData);

        savedImageId = null;

        persistMachineRegistry();
        renderMachines();
        notify("Máquina registrada.", "success");

        return machine;

    } catch (error) {
        if (savedImageId) {
            try {
                await deleteMachineImage(savedImageId);
            } catch (cleanupError) {
                console.error(
                    "No se pudo eliminar una imagen temporal:",
                    cleanupError
                );
            }
        }

        throw error;
    }
}