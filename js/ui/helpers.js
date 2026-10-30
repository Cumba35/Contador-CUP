import { getState, setAppError } from "../state.js";

let toastTimer = null;

export const $ = (selector, parent = document) =>
    parent.querySelector(selector);

export const $$ = (selector, parent = document) =>
    [...parent.querySelectorAll(selector)];

export const el = id => document.getElementById(id);

export const value = (id, fallback = "") =>
    el(id)?.value ?? fallback;

export const checked = id =>
    Boolean(el(id)?.checked);

export function text(id, content) {
    const element = el(id);

    if (element) {
        element.textContent = String(content ?? "");
    }
}

export function notify(message, type = "info") {
    const container = el("toast-container");

    if (!container) {
        console.info(`[Contador-CUP] ${message}`);
        return;
    }

    container.replaceChildren();

    const toast = document.createElement("div");

    toast.className = `toast toast-${type}`;
    toast.setAttribute(
        "role",
        type === "error" ? "alert" : "status"
    );

    toast.textContent = String(message);

    container.append(toast);
    container.hidden = false;

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.remove();
        container.hidden = !container.children.length;
    }, 3500);
}

export function safely(callback) {
    try {
        return callback();
    } catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);

        setAppError(message);
        notify(message, "error");

        return null;
    }
}

export async function safelyAsync(callback) {
    try {
        return await callback();
    } catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);

        setAppError(message);
        notify(message, "error");

        return null;
    }
}

export function confirmAction(message) {
    return !getState().settings.confirmBeforeDelete ||
        globalThis.confirm(message);
}