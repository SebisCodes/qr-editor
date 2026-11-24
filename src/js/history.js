/* Changing the document and its undo history.

   Every change goes through setCode(): the text is set, read again (analysis.js),
   shown, stored and reported to a page that embeds the editor. Typing becomes one
   undo step after a short pause; a continuous change from the panel (dragging a
   color, typing in a form) becomes one step when the user pauses. */

import { state, ui, areas, getElement } from './state.js?v=2';
import { translate } from './translate.js?v=2';
import { showToast } from './toast.js?v=2';
import { updateDocument } from './analysis.js?v=5';
import { renderCode, syncScroll } from './codeview.js?v=5';
import { saveEditorState, startSaveTimer } from './documents.js?v=5';

/** At most this many undo steps are kept. */
const MAX_HISTORY_STEPS = 300;

/** The undo steps together hold at most this many characters. */
const MAX_HISTORY_CHARACTERS = 40e6;

/** The pause after typing before it becomes an undo step, in milliseconds. */
const TYPING_STEP_MS = 600;

/** The pause after a continuous change before it becomes an undo step, in milliseconds. */
const MERGE_STEP_MS = 700;

/** Documents shorter than this are read again on every key; longer ones after a pause. */
const INSTANT_ANALYSIS_LENGTH = 20000;

/** The pause after typing in a long document before it is read again, in milliseconds. */
const LONG_DOCUMENT_DELAY_MS = 250;

/** The timer that reads a long document again after typing. */
let typingTimer = 0;

/**
 * Options of setCode.
 * @typedef {Object} SetCodeOptions
 * @property {boolean} [history=true] - make the change an undo step.
 */

/**
 * Options of editCode.
 * @typedef {Object} EditOptions
 * @property {boolean} [merge=false] - part of a continuous change; one undo step when the user pauses.
 * @property {string} [msg=''] - a message to show after the change (also when nothing changed).
 */

/**
 * Takes typing in the code and the undo keys of the code view.
 * @returns {void}
 */
export function startTyping() {
    ui.codeArea.addEventListener('input', receiveTypedCode);
    ui.codeArea.addEventListener('keydown', handleCodeKeys);
}

/**
 * Sets the document text: shows it (keeping scroll and cursor), reads it again, stores it and
 * reports it to a page that embeds the editor.
 * @param {string} code - the new document.
 * @param {SetCodeOptions} [options] - whether it is an undo step.
 * @returns {void}
 */
export function setCode(code, { history = true } = {}) {
    const codeArea = ui.codeArea;
    const scrollTop = codeArea.scrollTop, scrollLeft = codeArea.scrollLeft, selectionStart = codeArea.selectionStart, selectionEnd = codeArea.selectionEnd;
    // Typing still waiting for its undo step gets it first, so Undo after this change goes back to that text.
    if (history && state.histTimer) { clearTimeout(state.histTimer); state.histTimer = 0; addHistoryStep(); }
    state.code = code;
    if (codeArea.value !== code) {
        codeArea.value = code;
        codeArea.scrollTop = scrollTop; codeArea.scrollLeft = scrollLeft;
        codeArea.setSelectionRange(Math.min(selectionStart, code.length), Math.min(selectionEnd, code.length));
    }
    updateDocument();
    renderCode();
    syncScroll();
    if (history) addHistoryStep();
    saveEditorState();
    areas.sync?.handleChange();
}

/**
 * Enables Undo and Redo in the bar when there is something to undo or redo.
 * @returns {void}
 */
export function updateHistoryUi() {
    const last = state.history[state.history.length - 1];
    getElement('#btn-undo').disabled = !(state.history.length > 1 || (last && last.code !== state.code));
    getElement('#btn-redo').disabled = !state.future.length;
}

/**
 * Adds the current text as an undo step (or moves the cursor of the last step when the text is
 * the same), drops the oldest steps beyond the limits and clears the redo steps.
 * @returns {void}
 */
export function addHistoryStep() {
    const last = state.history[state.history.length - 1];
    const selection = ui.codeArea.selectionStart;
    if (last && last.code === state.code) { last.sel = selection; return; }
    state.history.push({ code: state.code, sel: selection });
    let size = state.history.reduce((total, step) => total + step.code.length, 0);
    while ((state.history.length > MAX_HISTORY_STEPS || size > MAX_HISTORY_CHARACTERS) && state.history.length > 2) size -= state.history.shift().code.length;
    state.future = [];
    updateHistoryUi();
}

/**
 * Pushes the current text as an undo step unless it is the last step already.
 * @returns {void}
 */
function addHistoryStepIfChanged() {
    if (state.history[state.history.length - 1]?.code !== state.code) addHistoryStep();
}

/**
 * Goes back one undo step.
 * @returns {void}
 */
export function undo() {
    clearTimeout(state.histTimer);
    addHistoryStepIfChanged();
    if (state.history.length < 2) { showToast(translate('Nothing to undo')); return; }
    state.future.push(state.history.pop());
    const step = state.history[state.history.length - 1];
    areas.panel.resetForm();
    setCode(step.code, { history: false });
    if (step.sel != null) ui.codeArea.setSelectionRange(Math.min(step.sel, state.code.length), Math.min(step.sel, state.code.length));
}

/**
 * Goes forward one undone step.
 * @returns {void}
 */
export function redo() {
    const step = state.future.pop();
    if (!step) { showToast(translate('Nothing to redo')); return; }
    state.history.push(step);
    areas.panel.resetForm();
    setCode(step.code, { history: false });
}

/**
 * Applies a change from the panel or a tool as an undo step; a continuous change (merge)
 * becomes one step when the user pauses.
 * @param {string} code - the changed document.
 * @param {EditOptions} [options] - merging and a message.
 * @returns {void}
 */
export function editCode(code, { merge = false, msg = '' } = {}) {
    if (code === state.code) { if (msg) showToast(msg); return; }
    clearTimeout(state.histTimer);
    if (!merge) addHistoryStepIfChanged();
    if (merge) mergeCode(code);
    else { state.merging = false; setCode(code); }
    if (msg) showToast(msg);
}

/**
 * Sets the text of a continuous change: the text before it is an undo step, the change
 * becomes one after a pause.
 * @param {string} code - the changed document.
 * @returns {void}
 */
function mergeCode(code) {
    if (!state.merging) { addHistoryStepIfChanged(); state.merging = true; }
    setCode(code, { history: false });
    state.histTimer = setTimeout(stopMerge, MERGE_STEP_MS);
}

/**
 * Ends a continuous change and makes it an undo step.
 * @returns {void}
 */
function stopMerge() {
    state.merging = false;
    addHistoryStep();
}

/**
 * Takes what the user typed into the code: reads it again (a long document after a pause),
 * makes it an undo step and stores it after a pause, and reports it to a page.
 * @returns {void}
 */
function receiveTypedCode() {
    state.code = ui.codeArea.value;
    clearTimeout(typingTimer);
    if (state.code.length < INSTANT_ANALYSIS_LENGTH) { updateDocument(); renderCode(); } else { renderCode(); typingTimer = setTimeout(updateAndRenderCode, LONG_DOCUMENT_DELAY_MS); }
    clearTimeout(state.histTimer);
    state.histTimer = setTimeout(addHistoryStep, TYPING_STEP_MS);
    startSaveTimer();
    areas.sync?.handleChange();
}

/**
 * Reads the document again and draws the code view.
 * @returns {void}
 */
function updateAndRenderCode() {
    updateDocument();
    renderCode();
}

/**
 * Handles Undo (Ctrl+Z), Redo (Ctrl+Shift+Z, Ctrl+Y) and Escape (leaves the code) in the code view.
 * @param {KeyboardEvent} event - the key pressed in the code.
 * @returns {void}
 */
function handleCodeKeys(event) {
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && !event.altKey && (event.key === 'z' || event.key === 'Z')) { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
    if (modifier && event.key === 'y') { event.preventDefault(); redo(); return; }
    if (event.key === 'Escape') ui.codeArea.blur();
}
