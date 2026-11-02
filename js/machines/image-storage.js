
// js/machines/image-storage.js

const DATABASE_NAME = "contador-cup-machine-images";
const DATABASE_VERSION = 1;
const STORE_NAME = "images";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_BACKUP_IMAGES_SIZE = 12 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
]);

let databasePromise = null;

function openDatabase() {
    if (!("indexedDB" in globalThis)) {
        return Promise.reject(
            new Error(
                "Este navegador no permite almacenar imágenes de máquinas."
            )
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
            const database = request.result;

            database.onversionchange = () => {
                database.close();
                databasePromise = null;
            };

            resolve(database);
        };

        request.onerror = () => {
            databasePromise = null;

            reject(
                new Error(
                    "No se pudo abrir el almacenamiento de imágenes."
                )
            );
        };

        request.onblocked = () => {
            databasePromise = null;

            reject(
                new Error(
                    "El almacenamiento de imágenes está bloqueado."
                )
            );
        };
    });

    return databasePromise;
}

function createImageId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return [
        Date.now().toString(36),
        Math.random().toString(36).slice(2),
        Math.random().toString(36).slice(2)
    ].join("-");
}

function validateImageFile(file) {
    if (!(file instanceof File)) {
        throw new TypeError(
            "Selecciona un archivo de imagen válido."
        );
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
        throw new Error(
            "La imagen no puede superar los 5 MB."
        );
    }
}

function validateImageRecord(record) {
    if (
        !record ||
        typeof record !== "object" ||
        Array.isArray(record) ||
        typeof record.id !== "string" ||
        !record.id.trim() ||
        record.id.length > 200 ||
        !(record.blob instanceof Blob) ||
        !ALLOWED_IMAGE_TYPES.has(record.blob.type) ||
        record.blob.size <= 0 ||
        record.blob.size > MAX_IMAGE_SIZE
    ) {
        throw new Error(
            "El respaldo contiene una imagen de máquina inválida."
        );
    }

    return true;
}

function blobToDataURL(blob) {
    return blob.arrayBuffer().then(buffer => {
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        let binary = "";

        for (
            let offset = 0;
            offset < bytes.length;
            offset += chunkSize
        ) {
            const chunk = bytes.subarray(
                offset,
                Math.min(offset + chunkSize, bytes.length)
            );

            binary += String.fromCharCode(...chunk);
        }

        return `data:${blob.type};base64,${btoa(binary)}`;
    });
}

function dataURLToBlob(dataURL, expectedType) {
    if (typeof dataURL !== "string") {
        throw new Error(
            "Los datos de una imagen del respaldo no son válidos."
        );
    }

    const match = dataURL.match(
        /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/
    );

    if (!match || match[1] !== expectedType) {
        throw new Error(
            "El formato de una imagen del respaldo no es válido."
        );
    }

    let binary;

    try {
        binary = atob(match[2]);
    } catch {
        throw new Error(
            "No se pudieron descodificar los datos de una imagen."
        );
    }

    const size = binary.length;

    if (size <= 0 || size > MAX_IMAGE_SIZE) {
        throw new Error(
            "Una imagen del respaldo supera el tamaño permitido."
        );
    }

    const bytes = new Uint8Array(size);

    for (let index = 0; index < size; index++) {
        bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], {
        type: expectedType
    });
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
                new Error(
                    "No se pudo guardar la imagen de la máquina."
                )
            );
        };

        transaction.onabort = () => {
            reject(
                new Error(
                    "Se canceló el almacenamiento de la imagen."
                )
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
                new Error(
                    "No se pudo recuperar la imagen de la máquina."
                )
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
                new Error(
                    "No se pudo eliminar la imagen de la máquina."
                )
            );
        };

        transaction.onabort = () => {
            reject(
                new Error(
                    "Se canceló la eliminación de la imagen."
                )
            );
        };
    });
}

export async function exportMachineImages() {
    const database = await openDatabase();

    const records = await new Promise((resolve, reject) => {
        const transaction = database.transaction(
            STORE_NAME,
            "readonly"
        );

        const request = transaction
            .objectStore(STORE_NAME)
            .getAll();

        request.onsuccess = () => {
            resolve(request.result ?? []);
        };

        request.onerror = () => {
            reject(
                new Error(
                    "No se pudieron leer las imágenes para el respaldo."
                )
            );
        };
    });

    if (!Array.isArray(records)) {
        throw new Error(
            "El almacenamiento de imágenes devolvió datos inválidos."
        );
    }

    let totalSize = 0;
    const exported = [];

    for (const record of records) {
        validateImageRecord(record);

        totalSize += record.blob.size;

        if (totalSize > MAX_BACKUP_IMAGES_SIZE) {
            throw new Error(
                "Las imágenes superan el tamaño total permitido para el respaldo. Reduce el tamaño o la cantidad de imágenes."
            );
        }

        exported.push({
            id: record.id,
            type: record.blob.type,
            name: String(record.name || "imagen").slice(0, 150),
            size: record.blob.size,
            createdAt: record.createdAt ?? null,
            dataURL: await blobToDataURL(record.blob)
        });
    }

    return exported;
}

export async function replaceMachineImages(images) {
    if (!Array.isArray(images)) {
        throw new TypeError(
            "La lista de imágenes del respaldo no es válida."
        );
    }

    const normalized = [];
    const ids = new Set();
    let totalSize = 0;

    for (const image of images) {
        if (
            !image ||
            typeof image !== "object" ||
            Array.isArray(image) ||
            typeof image.id !== "string" ||
            !image.id.trim() ||
            image.id.length > 200 ||
            !ALLOWED_IMAGE_TYPES.has(image.type)
        ) {
            throw new Error(
                "El respaldo contiene metadatos de imagen inválidos."
            );
        }

        if (ids.has(image.id)) {
            throw new Error(
                "El respaldo contiene identificadores de imagen duplicados."
            );
        }

        ids.add(image.id);

        const blob = dataURLToBlob(
            image.dataURL,
            image.type
        );

        if (
            image.size !== undefined &&
            Number(image.size) !== blob.size
        ) {
            throw new Error(
                "El tamaño de una imagen del respaldo no coincide."
            );
        }

        totalSize += blob.size;

        if (totalSize > MAX_BACKUP_IMAGES_SIZE) {
            throw new Error(
                "Las imágenes superan el tamaño total permitido para la restauración."
            );
        }

        normalized.push({
            id: image.id,
            blob,
            type: blob.type,
            name: String(image.name || "imagen").slice(0, 150),
            size: blob.size,
            createdAt: image.createdAt ?? null
        });
    }

    const database = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(
            STORE_NAME,
            "readwrite"
        );

        const store = transaction.objectStore(STORE_NAME);

        store.clear();

        for (const record of normalized) {
            store.put(record);
        }

        transaction.oncomplete = () => {
            resolve({
                success: true,
                count: normalized.length
            });
        };

        transaction.onerror = () => {
            reject(
                new Error(
                    "No se pudieron restaurar las imágenes de las máquinas."
                )
            );
        };

        transaction.onabort = () => {
            reject(
                new Error(
                    "Se canceló la restauración de las imágenes."
                )
            );
        };
    });
}
