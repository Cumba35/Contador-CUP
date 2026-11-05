
"use strict";

const CACHE_NAME = "contador-cup-v2.0.3-r2";

const APP_SHELL = [
    "./",
    "./index.html",
    "./manifest.webmanifest",

    // Estilos
    "./assets/css/variables.css",
    "./assets/css/base.css",
    "./assets/css/layout.css",
    "./assets/css/components.css",
    "./assets/css/responsive.css",

    // Núcleo
    "./js/app.js",
    "./js/config.js",
    "./js/state.js",
    "./js/storage.js",
    "./js/utils.js",
    "./js/navigation.js",

    // Contador
    "./js/counter/denominations.js",
    "./js/counter/calculator.js",
    "./js/counter/draft.js",
    "./js/counter/undo-redo.js",

    // Historial
    "./js/history/records.js",
    "./js/history/filters.js",
    "./js/history/comparison.js",
    "./js/history/receipts.js",

    // Informes
    "./js/reports/statistics.js",
    "./js/reports/charts.js",
    "./js/reports/export-csv.js",

    // Caja
    "./js/cash/movements.js",
    "./js/cash/balance.js",

    // Máquinas
    "./js/machines/registry.js",
    "./js/machines/connections.js",
    "./js/machines/image-storage.js",

    // Copias de seguridad
    "./js/backup/export.js",
    "./js/backup/import.js",

    // Configuración
    "./js/settings/preferences.js",
    "./js/settings/custom-denominations.js",

    // Interfaz
    "./js/ui/backup.js",
    "./js/ui/cash.js",
    "./js/ui/events.js",
    "./js/ui/forms.js",
    "./js/ui/helpers.js",
    "./js/ui/machines.js",
    "./js/ui/render-cash.js",
    "./js/ui/render-machines.js",
    "./js/ui/render-counter.js",
    "./js/ui/render-history.js",
    "./js/ui/render-reports.js",
    "./js/ui/render-settings.js"
];

const APP_CACHE_PREFIX = "contador-cup-";

function isAppRequest(request) {
    if (!request || request.method !== "GET") {
        return false;
    }

    try {
        const url = new URL(request.url);

        return url.origin === self.location.origin;
    } catch {
        return false;
    }
}

async function cacheResponse(request, response) {
    if (
        !response ||
        !response.ok ||
        response.type === "opaque"
    ) {
        return;
    }

    try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
    } catch (error) {
        console.warn(
            "No se pudo guardar el recurso en caché:",
            request.url,
            error
        );
    }
}

async function getOfflinePage() {
    const cache = await caches.open(CACHE_NAME);

    return (
        await cache.match("./index.html") ||
        await caches.match("./index.html")
    );
}

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .catch(async error => {
                // No se activa una versión incompleta.
                await caches.delete(CACHE_NAME);
                throw error;
            })
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key =>
                        key.startsWith(APP_CACHE_PREFIX) &&
                        key !== CACHE_NAME
                    )
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;

    if (!isAppRequest(request)) {
        return;
    }

    const url = new URL(request.url);

    // Las páginas se solicitan primero a la red para
    // detectar versiones nuevas y se recuperan de caché sin conexión.
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then(async response => {
                    if (response.ok) {
                        await cacheResponse(
                            "./index.html",
                            response
                        );
                    }

                    return response;
                })
                .catch(async () => {
                    const cachedPage = await getOfflinePage();

                    if (cachedPage) {
                        return cachedPage;
                    }

                    return new Response(
                        "Contador CUP no está disponible sin conexión. Abre la aplicación al menos una vez con Internet.",
                        {
                            status: 503,
                            headers: {
                                "Content-Type": "text/plain; charset=utf-8"
                            }
                        }
                    );
                })
        );

        return;
    }

    // No se interceptan solicitudes ajenas a la aplicación.
    if (url.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.match(request)
            .then(async cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                try {
                    const response = await fetch(request);

                    if (response.ok) {
                        await cacheResponse(request, response);
                    }

                    return response;
                } catch (error) {
                    // Evita devolver una respuesta vacía o falsa.
                    throw error;
                }
            })
    );
});

self.addEventListener("message", event => {
    const message = event.data;

    if (
        !message ||
        typeof message.type !== "string"
    ) {
        return;
    }

    if (message.type === "SKIP_WAITING") {
        event.waitUntil(self.skipWaiting());
        return;
    }

    if (message.type === "CLEAR_APP_CACHE") {
        event.waitUntil(
            caches.keys()
                .then(keys => Promise.all(
                    keys
                        .filter(key =>
                            key.startsWith(APP_CACHE_PREFIX)
                        )
                        .map(key => caches.delete(key))
                ))
        );
    }
});
