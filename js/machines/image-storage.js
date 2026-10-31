// js/machines/image-storage.js

const DATABASE_NAME = "contador-cup-machine-images";
const DATABASE_VERSION = 1;
const STORE_NAME = "images";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
]);

let databasePromise = null;

function openDatabase() {
    if (!("indexedDB" in window)) {
        return Promise.reject(
            new Error("Este navegador no permite almacenar imágenes de máquinas.")
        );
    }

    if (databasePromise) {
        return databasePromise;
    }

    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(
            DATABASE_NAME,
            DATABASE_VERSION
        );

        request.onupgradeneeded = () => {
            const database = request.result;

            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, {
                    keyPath: "id"
                });
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            databasePromise = null;

            reject(
                new Error("No se pudo abrir el almacenamiento de imágenes.")
            );
        };

        request.onblocked = () => {
            databasePromise = null;

            reject(
                new Error("El almacenamiento de imágenes está bloqueado.")
            );
        };
    });

    return databasePromise;
}

function createImageId() {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return [
        Date.now().toString(36),
        Math.random().toString(36).slice(2),
        Math.random().toString(36).slice(2)
    ].join("-");
}

function validateImageFile(file) {
    if (!(file instanceof File)) {
        throw new TypeError("Selecciona un archivo de imagen válido.");
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        throw new Error(
            "Formato no permitido. Utiliza JPG, PNG, WEBP o GIF."
        );
    }

    if (file.size <= 0) {
        throw new Error("La imagen está vacía.");
    }

    if (file.size > MAX_IMAGE_SIZE) {
        throw new Error("La imagen no puede superar los 5 MB.");
    }
}

export async function saveMachineImage(file) {
    validateImageFile(file);

    const database = await openDatabase();
    const id = createImageId();

    const imageRecord = {
        id,
        blob: file,
        type: file.type,
        name: String(file.name || "imagen").slice(0, 150),
        size: file.size,
        createdAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(
            STORE_NAME,
            "readwrite"
        );

        transaction.objectStore(STORE_NAME).put(imageRecord);

        transaction.oncomplete = () => {
            resolve(id);
        };

        transaction.onerror = () => {
            reject(
                new Error("No se pudo guardar la imagen de la máquina.")
            );
        };

        transaction.onabort = () => {
            reject(
                new Error("Se canceló el almacenamiento de la imagen.")
            );
        };
    });
}

export async function getMachineImage(id) {
    if (!id || typeof id !== "string") {
        return null;
    }

    const database = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(
            STORE_NAME,
            "readonly"
        );

        const request = transaction
            .objectStore(STORE_NAME)
            .get(id);

        request.onsuccess = () => {
            const record = request.result;

            resolve(
                record?.blob instanceof Blob
                    ? record.blob
                    : null
            );
        };

        request.onerror = () => {
            reject(
                new Error("No se pudo recuperar la imagen de la máquina.")
            );
        };
    });
}

export async function deleteMachineImage(id) {
    if (!id || typeof id !== "string") {
        return false;
    }

    const database = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(
            STORE_NAME,
            "readwrite"
        );

        transaction.objectStore(STORE_NAME).delete(id);

        transaction.oncomplete = () => {
            resolve(true);
        };

        transaction.onerror = () => {
            reject(
                new Error("No se pudo eliminar la imagen de la máquina.")
            );
        };

        transaction.onabort = () => {
            reject(
                new Error("Se canceló la eliminación de la imagen.")
            );
        };
    });
}