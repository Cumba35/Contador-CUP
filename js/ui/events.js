export function initializeUIEvents({
    onClick,
    onInput,
    onChange,
    onSubmit
}) {
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
        document.addEventListener("submit", event => {
            event.preventDefault();
            onSubmit(event);
        });
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
    };
}