import { safelyAsync } from "./helpers.js";

export function initializeForms({
    handlers = {},
    onUnhandledForm = null
} = {}) {
    async function handleSubmit(event) {
        const form = event.target.closest("[data-app-form]");

        if (!form) return;

        event.preventDefault();

        const formName = form.dataset.appForm;
        const handler = handlers[formName];

        if (typeof handler !== "function") {
            if (typeof onUnhandledForm === "function") {
                await safelyAsync(() => onUnhandledForm(form, event));
            }

            return;
        }

        const formData = new FormData(form);

        const data = Object.fromEntries(formData.entries());

        await safelyAsync(async () => {
            await handler(data, form, event);
        });
    }

    document.addEventListener("submit", handleSubmit);

    return function removeForms() {
        document.removeEventListener("submit", handleSubmit);
    };
}