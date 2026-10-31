
// sw.js

"use strict";

const CACHE_NAME = "contador-cup-v2.0.2";

const APP_SHELL = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./assets/icons/icon.svg",

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

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(
                        key =>
                            key.startsWith("contador-cup-") &&
                            key !== CACHE_NAME
                    )
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    if (url.origin !== self.location.origin) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response && response.ok) {
                        const copy = response.clone();

                        caches.open(CACHE_NAME).then(cache => {
                            cache.put("./index.html", copy);
                        });
                    }

                    return response;
                })
                .catch(async () => {
                    const cachedPage = await caches.match("./index.html");

                    if (cachedPage) {
                        return cachedPage;
                    }

                    return new Response(
                        "La aplicación no está disponible sin conexión. Abre Contador CUP al menos una vez con Internet.",
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

    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(request).then(response => {
                    if (
                        response &&
                        response.ok &&
                        response.type === "basic"
                    ) {
                        const copy = response.clone();

                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, copy);
                        });
                    }

                    return response;
                });
            })
    );
});

self.addEventListener("message", event => {
    const message = event.data;

    if (!message || typeof message.type !== "string") {
        return;
    }

    if (message.type === "SKIP_WAITING") {
        self.skipWaiting();
    }

    if (message.type === "CLEAR_APP_CACHE") {
        event.waitUntil(
            caches.keys().then(keys =>
                Promise.all(
                    keys
                        .filter(key => key.startsWith("contador-cup-"))
                        .map(key => caches.delete(key))
                )
            )
        );
    }
});
