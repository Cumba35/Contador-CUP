// js/ui/machines.js

import {
    getMachineById
} from "../machines/registry.js";

import {
    MACHINE_TYPES
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
            await setActiveMachine(id);
            await renderMachines();

            await notify(
                "Máquina seleccionada.",
                "success"
            );

            return true;
        }

        case "connect-machine": {
            const result = await connectMachine(id);

            await renderMachines();

            if (result) {
                await notify(
                    "Solicitud de conexión procesada.",
                    "success"
                );
            }

            return result;
        }

        case "disconnect-machine": {
            const result = await disconnectMachine(id);

            await renderMachines();

            if (result) {
                await notify(
                    "Solicitud de desconexión procesada.",
                    "success"
                );
            }

            return result;
        }

        case "delete-machine": {
            const approved = await confirmAction(
                "¿Quieres eliminar esta máquina del registro?"
            );

            if (!approved) {
                return false;
            }

            const machine = getMachineById(id);
            const removed = removeMachine(id);

            if (!removed) {
                return false;
            }

            await persistMachineRegistry();

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

            await renderMachines();

            await notify(
                "Máquina eliminada.",
                "success"
            );

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

    if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data)
    ) {
        throw new TypeError(
            "Los datos de la máquina no son válidos."
        );
    }

    let savedImageId = null;

    try {
        const imageFile =
            data.imageFile ??
            (
                typeof File !== "undefined" &&
                data.image instanceof File
                    ? data.image
                    : null
            );

        const typeMap = {
            counter: MACHINE_TYPES.BILL_COUNTER,
            detector: MACHINE_TYPES.COUNTERFEIT_DETECTOR,
            sorter: MACHINE_TYPES.BILL_SORTER,
            other: MACHINE_TYPES.OTHER
        };

        const machineData = {
            name: data.name,
            type: typeMap[data.type] ?? data.type,
            brand: data.brand,
            model: data.model,

            serialNumber:
                data.serialNumber ??
                data.serial ??
                "",

            image:
                typeof data.image === "string"
                    ? data.image
                    : "",

            description: data.description,

            features: Array.isArray(data.features)
                ? data.features
                : [],

            connectionType: data.connectionType,

            connectionDetails: data.connectionDetails,

            connectionCapabilities:
                data.connectionCapabilities ??
                data.capabilities ??
                "",

            protocol: data.protocol
        };

        if (imageFile) {
            savedImageId = await saveMachineImage(imageFile);
            machineData.image = savedImageId;
        }

        const machine = await registerMachine(machineData);

        savedImageId = null;

        await persistMachineRegistry();
        await renderMachines();

        await notify(
            "Máquina registrada.",
            "success"
        );

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