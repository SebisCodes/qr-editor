/* Shortcuts of the whole page: Ctrl+S saves, Ctrl+E opens Export, Ctrl+O My
   documents, Escape closes the menu of "New"; Undo, Redo and ? (help) only
   while no field takes text and no dialog is open. */

import { areas, getElement } from './state.js?v=2';
import { undo, redo } from './history.js?v=7';
import { isNewMenuOpen, setNewMenuOpen, saveFromShortcut, showHelp } from './toolbar.js?v=7';

/** Fields that take text: the shortcuts without Ctrl pause while one has the focus. */
const TYPING = 'textarea, select, [contenteditable], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=button])';

/**
 * Sets up the shortcuts of the page.
 * @returns {void}
 */
export function startKeyboard() {
    window.addEventListener('keydown', handleShortcut);
}

/**
 * Runs the shortcut of a key.
 * @param {KeyboardEvent} event - the key pressed anywhere on the page.
 * @returns {void}
 */
function handleShortcut(event) {
    const active = document.activeElement;
    const typing = active && active.matches(TYPING);
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key === 's') { event.preventDefault(); saveFromShortcut(); return; }
    if (modifier && event.key === 'e') { event.preventDefault(); areas.exporter.open(); return; }
    if (modifier && event.key === 'o') { event.preventDefault(); areas.files.open(); return; }
    if (event.key === 'Escape' && isNewMenuOpen()) { setNewMenuOpen(false); return; }
    if (typing || getElement('dialog[open]')) return;
    if (modifier && (event.key === 'z' || event.key === 'Z')) { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
    if (modifier && event.key === 'y') { event.preventDefault(); redo(); return; }
    if (modifier) return;
    if (event.key === '?') showHelp();
}
