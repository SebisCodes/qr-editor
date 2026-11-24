/* The bar above the work area: "New" with its menu of templates, My documents,
   Undo and Redo, Copy, Download (the code as SVG), Help, and closing the dialogs. */

import { state, ui, areas, getElement, getElements } from './state.js?v=2';
import { translate } from './translate.js?v=2';
import { showToast } from './toast.js?v=2';
import { renderSvg } from './draw.js?v=3';
import { saveFile, getSafeFileName } from './util.js?v=3';
import { openDialog } from './dialogs.js?v=5';
import { undo, redo } from './history.js?v=6';
import { createFromTemplate } from './documents.js?v=6';

/** A downloaded SVG is sized so that the code itself (without quiet zone) is this wide, in millimetres. */
const SVG_CODE_WIDTH_MM = 25;

/** The "New" button and its menu. */
const newButton = getElement('#btn-new');
const newMenu = getElement('#new-menu');

/**
 * Sets up "New" with its menu, closed by Escape, a click elsewhere or a choice.
 * @returns {void}
 */
export function startNewMenu() {
    newButton.addEventListener('click', () => setNewMenuOpen());
    newMenu.addEventListener('click', createFromMenu);
    newMenu.addEventListener('keydown', moveInNewMenu);
    document.addEventListener('pointerdown', closeNewMenuOutside);
}

/**
 * Sets up My documents, Undo and Redo in the bar.
 * @returns {void}
 */
export function startHistoryButtons() {
    getElement('#btn-files').addEventListener('click', () => areas.files.open());
    getElement('#btn-undo').addEventListener('click', undo);
    getElement('#btn-redo').addEventListener('click', redo);
}

/**
 * Sets up Copy, Download and Help in the bar, and closing the dialogs with their close
 * buttons and with a click beside them.
 * @returns {void}
 */
export function startBarButtons() {
    getElement('#btn-copy').addEventListener('click', copyDocument);
    getElement('#btn-download').addEventListener('click', saveSvg);
    getElements('dialog [data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
    getElements('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
    getElement('#btn-help').addEventListener('click', showHelp);
}

/**
 * Tells whether the menu of "New" is open.
 * @returns {boolean} true while it is shown.
 */
export function isNewMenuOpen() {
    return !newMenu.hidden;
}

/**
 * Opens or closes the menu of "New"; an opened menu has the focus on its first entry.
 * @param {boolean} [isOpen] - open it; without a value the menu switches.
 * @returns {void}
 */
export function setNewMenuOpen(isOpen = newMenu.hidden) {
    newMenu.hidden = !isOpen;
    newButton.setAttribute('aria-expanded', isOpen);
    if (isOpen) newMenu.querySelector('button').focus();
}

/**
 * Creates a document from the entry chosen in the menu of "New".
 * @param {MouseEvent} event - the click in the menu.
 * @returns {void}
 */
function createFromMenu(event) {
    const entry = event.target.closest('[data-new]');
    if (!entry) return;
    setNewMenuOpen(false);
    createFromTemplate(entry.dataset.new);
}

/**
 * Moves through the menu of "New" with the arrow keys and closes it with Escape.
 * @param {KeyboardEvent} event - the key in the menu.
 * @returns {void}
 */
function moveInNewMenu(event) {
    const entries = getElements('button', newMenu), index = entries.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); entries[(index + (event.key === 'ArrowDown' ? 1 : entries.length - 1)) % entries.length].focus(); }
    if (event.key === 'Escape') { event.stopPropagation(); setNewMenuOpen(false); newButton.focus(); }
}

/**
 * Closes the menu of "New" when the pointer goes down outside it.
 * @param {PointerEvent} event - the press anywhere on the page.
 * @returns {void}
 */
function closeNewMenuOutside(event) {
    if (!newMenu.hidden && !event.target.closest('#new-menu, #btn-new')) setNewMenuOpen(false);
}

/**
 * Copies the QR document to the clipboard (with the old copy command where the clipboard is not allowed).
 * @returns {Promise<void>} settles when it is copied.
 */
async function copyDocument() {
    try { await navigator.clipboard.writeText(state.code); } catch (error) { ui.codeArea.select(); document.execCommand('copy'); }
    showToast(translate('QR document copied'));
}

/**
 * Downloads the code as SVG, the code itself 25 mm wide.
 * @returns {void}
 */
export function saveSvg() {
    const layout = state.layout;
    if (!layout) { showToast(translate('There is no code to download yet')); return; }
    const size = { width: `${(layout.w / layout.code.n * SVG_CODE_WIDTH_MM).toFixed(0)}mm`, height: `${(layout.h / layout.code.n * SVG_CODE_WIDTH_MM).toFixed(0)}mm`, title: state.name };
    saveFile(renderSvg(layout, size), `${getSafeFileName(state.name)}.svg`, 'image/svg+xml');
    showToast(translate('SVG downloaded'));
}

/**
 * Saves on Ctrl+S: to the server or the page around the editor when one is set up, otherwise the SVG.
 * @returns {void}
 */
export function saveFromShortcut() {
    const sync = areas.sync;
    if (sync && sync.isActive()) { sync.save(); return; }
    saveSvg();
}

/**
 * Opens the help.
 * @returns {void}
 */
export function showHelp() {
    openDialog(getElement('#help'));
}
