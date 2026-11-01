// js/ui/events.js

export function initializeUIEvents({
    onClick,
    onInput,
    onChange,
    onSubmit
}) {
    let submitHandler = null;

    if (typeof onClick === "function") {
        document.addEventListener("click", onClick);
    }

    if (typeof onInput === "function") {
        document.addEventListener("input", onInput);
    }

    if (typeof onChange === "function") {
        document.addEventListener("change", onChange);
    }

    if (typeof onSubmit === "function") {
        submitHandler = event => {
            event.preventDefault();
            onSubmit(event);
        };

        document.addEventListener("submit", submitHandler);
    }

    return function removeUIEvents() {
        if (typeof onClick === "function") {
            document.removeEventListener("click", onClick);
        }

        if (typeof onInput === "function") {
            document.removeEventListener("input", onInput);
        }

        if (typeof onChange === "function") {
            document.removeEventListener("change", onChange);
        }

        if (submitHandler) {
            document.removeEventListener("submit", submitHandler);
            submitHandler = null;
        }
    };
}