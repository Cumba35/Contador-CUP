// js/navigation.js

import { getState, setState } from "./state.js";

export const APP_VIEWS = Object.freeze({
    COUNTER: "counter",
    DRAFTS: "drafts",
    HISTORY: "history",
    COMPARISON: "comparison",
    REPORTS: "reports",
    CASH: "cash",
    MACHINES: "machines",
    DENOMINATIONS: "denominations",
    SETTINGS: "settings",
    BACKUP: "backup",
    ABOUT: "about",
    NOVA_APPS: "nova-apps"
});

const VIEW_LABELS = Object.freeze({
    counter: "Contar efectivo",
    drafts: "Borradores",
    history: "Historial",
    comparison: "Comparar conteos",
    reports: "Estadísticas e informes",
    cash: "Control de caja",
    machines: "Máquinas de dinero",
    denominations: "Denominaciones",
    settings: "Configuración",
    backup: "Copias de seguridad",
    about: "Acerca de",
    "nova-apps": "Otras aplicaciones de Nova"
});

const VALID_VIEWS = new Set(Object.values(APP_VIEWS));

const VIEW_ALIASES = Object.freeze({
    inicio: APP_VIEWS.COUNTER,
    contador: APP_VIEWS.COUNTER,
    conteo: APP_VIEWS.COUNTER,
    maquinas: APP_VIEWS.MACHINES,
    máquinas: APP_VIEWS.MACHINES,
    configuracion: APP_VIEWS.SETTINGS,
    configuración: APP_VIEWS.SETTINGS,
    respaldo: APP_VIEWS.BACKUP,
    aplicaciones: APP_VIEWS.NOVA_APPS
});

const listeners = new Set();

function normalizeView(view) {
    const value = String(view ?? "").trim().toLocaleLowerCase("es");
    const normalized = VIEW_ALIASES[value] ?? value;

    if (!VALID_VIEWS.has(normalized)) {
        throw new Error(`La sección "${view}" no existe.`);
    }

    return normalized;
}

function emitNavigationChange(view, previousView) {
    const detail = {
        view,
        previousView,
        label: VIEW_LABELS[view] ?? view,
        timestamp: new Date().toISOString()
    };

    for (const listener of listeners) {
        try {
            listener(detail);
        } catch (error) {
            console.error("Error en un suscriptor de navegación:", error);
        }
    }

    if (typeof globalThis.dispatchEvent === "function" &&
        typeof globalThis.CustomEvent === "function") {
        globalThis.dispatchEvent(
            new CustomEvent("contador-cup:navigate", {
                detail
            })
        );
    }

    return detail;
}

export function getCurrentView() {
    return getState().app.currentView;
}

export function getViewLabel(view = getCurrentView()) {
    const normalized = normalizeView(view);
    return VIEW_LABELS[normalized];
}

export function getAvailableViews() {
    return Object.entries(VIEW_LABELS).map(([id, label]) => ({
        id,
        label,
        active: id === getCurrentView()
    }));
}

export function navigateTo(view, options = {}) {
    const {
        updateHash = true,
        closeSidebar = true
    } = options;

    const nextView = normalizeView(view);
    const previousView = getCurrentView();

    if (closeSidebar) {
        setState("ui.sidebarOpen", false);
    }

    if (nextView !== previousView) {
        setState("app.currentView", nextView);
        emitNavigationChange(nextView, previousView);
    }

    if (updateHash && globalThis.location) {
        const nextHash = `#${nextView}`;

        if (globalThis.location.hash !== nextHash) {
            globalThis.history.replaceState(
                null,
                "",
                `${globalThis.location.pathname}${globalThis.location.search}${nextHash}`
            );
        }
    }

    return {
        view: nextView,
        previousView,
        changed: nextView !== previousView
    };
}

export function subscribeToNavigation(listener) {
    if (typeof listener !== "function") {
        throw new TypeError("El suscriptor debe ser una función.");
    }

    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

export function openSidebar() {
    setState("ui.sidebarOpen", true);
}

export function closeSidebar() {
    setState("ui.sidebarOpen", false);
}

export function toggleSidebar() {
    const next = !getState().ui.sidebarOpen;
    setState("ui.sidebarOpen", next);
    return next;
}

export function openNovaApps() {
    return navigateTo(APP_VIEWS.NOVA_APPS);
}

export function getNovaAppsLinks() {
    return [
        {
            id: "nova-home",
            label: "Página principal de Nova Apps",
            description: "Abrir el catálogo general de aplicaciones de Nova.",
            url: "https://cumba35.github.io/Nova-APPS/",
            external: true
        }
    ];
}

export function openNovaAppsHome() {
    const url = "https://cumba35.github.io/Nova-APPS/";

    if (!globalThis.location) {
        return {
            success: false,
            url,
            reason: "location-unavailable"
        };
    }

    globalThis.open(url, "_blank", "noopener,noreferrer");

    return {
        success: true,
        url
    };
}

export function initializeNavigation() {
    if (!globalThis.location) {
        return navigateTo(APP_VIEWS.COUNTER, {
            updateHash: false
        });
    }

    const hash = globalThis.location.hash.replace(/^#/, "").trim();

    if (!hash) {
        return navigateTo(APP_VIEWS.COUNTER, {
            updateHash: false
        });
    }

    try {
        return navigateTo(hash, {
            updateHash: false
        });
    } catch {
        return navigateTo(APP_VIEWS.COUNTER, {
            updateHash: false
        });
    }
}