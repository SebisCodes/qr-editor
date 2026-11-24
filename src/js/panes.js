/* The panes of the work area: the splitter between code and stage (dragged or
   moved with the arrow keys, remembered in the settings), the side panel (a
   column on the desktop, closed at the start), and on a narrow screen the tabs
   that show one pane at a time. */

import { state, ui, getNumberInRange, getElement, getElements } from './state.js?v=2';
import { resizePreview } from './preview.js?v=3';
import { renderCode, syncScroll } from './codeview.js?v=7';
import { saveEditorState } from './documents.js?v=7';

/** The smallest and largest share of the code pane. */
const MIN_SPLIT = 0.12;
const MAX_SPLIT = 0.85;

/** How far an arrow key moves the splitter, as share of the work area. */
const SPLIT_STEP = 0.03;

/** The splitter between code and stage. */
const splitter = getElement('#splitter');

/**
 * Lets the splitter be dragged and moved with the arrow keys, the pane tabs switch panes and the
 * side panel's button open and close the side panel's column.
 * @returns {void}
 */
export function startPanes() {
    splitter.addEventListener('pointerdown', startSplitDrag);
    splitter.addEventListener('keydown', moveSplitOnKey);
    getElements('[data-pane]').forEach(button => button.addEventListener('click', () => showPane(button.dataset.pane)));
    showSidePanel(false);
    getElement('#btn-panel').addEventListener('click', () => showSidePanel(ui.work.dataset.panel !== 'open'));
}

/**
 * Opens or closes the side panel's column.
 * @param {boolean} isOpen - true to open it.
 * @returns {void}
 */
export function showSidePanel(isOpen) {
    ui.work.dataset.panel = isOpen ? 'open' : 'closed';
    getElement('#btn-panel').setAttribute('aria-expanded', String(isOpen));
}

/**
 * Sets the widths of the code pane and the stage from the split.
 * @returns {void}
 */
export function updateSplit() {
    ui.work.style.setProperty('--code-fr', state.split.toFixed(4) + 'fr');
    ui.work.style.setProperty('--view-fr', (1 - state.split).toFixed(4) + 'fr');
}

/**
 * Follows the pointer while the splitter is dragged; the split is stored when it is let go.
 * @param {PointerEvent} event - the press on the splitter.
 * @returns {void}
 */
function startSplitDrag(event) {
    splitter.setPointerCapture(event.pointerId);
    const workBox = ui.work.getBoundingClientRect();
    const available = workBox.width - getElement('.inspector').offsetWidth - splitter.offsetWidth;
    /**
     * Moves the split with the pointer.
     * @param {PointerEvent} moveEvent - the pointer move.
     * @returns {void}
     */
    const move = moveEvent => { state.split = getNumberInRange((moveEvent.clientX - workBox.left) / available, MIN_SPLIT, MAX_SPLIT); updateSplit(); };
    /**
     * Ends the drag and stores the split.
     * @returns {void}
     */
    const stop = () => { splitter.removeEventListener('pointermove', move); splitter.removeEventListener('pointerup', stop); saveEditorState(); };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', stop);
}

/**
 * Moves the splitter with the left and right arrow keys and stores the split.
 * @param {KeyboardEvent} event - the key on the splitter.
 * @returns {void}
 */
function moveSplitOnKey(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    state.split = getNumberInRange(state.split + (event.key === 'ArrowLeft' ? -SPLIT_STEP : SPLIT_STEP), MIN_SPLIT, MAX_SPLIT);
    updateSplit();
    saveEditorState();
}

/**
 * Shows one pane on a narrow screen and marks its tab.
 * @param {string} pane - "code", "drawing" or "properties".
 * @returns {void}
 */
export function showPane(pane) {
    ui.work.dataset.show = pane;
    getElements('[data-pane]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.pane === pane)));
    requestAnimationFrame(() => { resizePreview(); if (pane === 'code') { renderCode(); syncScroll(); } });
}
