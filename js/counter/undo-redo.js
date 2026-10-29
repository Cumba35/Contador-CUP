// js/counter/undo-redo.js

import { APP_CONFIG } from "../config.js";
import { getState, setState } from "../state.js";
import {
    getCounterQuantities,
    loadCounterQuantities
} from "./calculator.js";

const MAX_HISTORY = APP_CONFIG.defaults.maximumUndoSteps;

let undoStack = [];
let redoStack = [];
let trackingEnabled = true;

function snapshot() {
    return {
        quantities: getCounterQuantities(),
        draftId: getState().counter.draftId,
        draftName: getState().counter.draftName
    };
}

function snapshotsEqual(a, b) {
    return (
        JSON.stringify(a.quantities) === JSON.stringify(b.quantities) &&
        a.draftId === b.draftId &&
        a.draftName === b.draftName
    );
}

function pushBounded(stack, value) {
    stack.push(structuredClone(value));

    if (stack.length > MAX_HISTORY) {
        stack.shift();
    }
}

export function captureUndoState() {
    if (!trackingEnabled) {
        return false;
    }

    const current = snapshot();
    const previous = undoStack[undoStack.length - 1];

    if (previous && snapshotsEqual(previous, current)) {
        return false;
    }

    pushBounded(undoStack, current);
    redoStack = [];

    return true;
}

export function undo() {
    if (undoStack.length === 0) {
        return {
            success: false,
            reason: "nothing-to-undo"
        };
    }

    const current = snapshot();
    const previous = undoStack.pop();

    pushBounded(redoStack, current);

    trackingEnabled = false;

    try {
        loadCounterQuantities(previous.quantities);
        setState("counter.draftId", previous.draftId);
        setState("counter.draftName", previous.draftName);
        setState("counter.isDirty", true);
    } finally {
        trackingEnabled = true;
    }

    return {
        success: true,
        state: snapshot()
    };
}

export function redo() {
    if (redoStack.length === 0) {
        return {
            success: false,
            reason: "nothing-to-redo"
        };
    }

    const current = snapshot();
    const next = redoStack.pop();

    pushBounded(undoStack, current);

    trackingEnabled = false;

    try {
        loadCounterQuantities(next.quantities);
        setState("counter.draftId", next.draftId);
        setState("counter.draftName", next.draftName);
        setState("counter.isDirty", true);
    } finally {
        trackingEnabled = true;
    }

    return {
        success: true,
        state: snapshot()
    };
}

export function clearUndoRedoHistory() {
    undoStack = [];
    redoStack = [];
}

export function canUndo() {
    return undoStack.length > 0;
}

export function canRedo() {
    return redoStack.length > 0;
}

export function getUndoRedoStatus() {
    return {
        canUndo: canUndo(),
        canRedo: canRedo(),
        undoSteps: undoStack.length,
        redoSteps: redoStack.length,
        maximumSteps: MAX_HISTORY
    };
}