/* The settings of the editor in this browser (qreditor.v1): the document open
   last, the split of the work area, the print sizes of the Check tab and the side
   panel tab open last. */

import { state, areas, SETTINGS_KEY } from './state.js?v=2';

/** German names of the side panel tabs that settings stored in this browser can hold, with their English names. */
const GERMAN_TABS = { inhalt: 'content', pruefen: 'check' };

/**
 * The settings stored in this browser.
 * @typedef {Object} StoredSettings
 * @property {string} [file] - the id of the document open last.
 * @property {number} [split] - the share of the code pane.
 * @property {{dist: number, mm: number}} [print] - the print sizes of the Check tab.
 * @property {string} [itab] - the side panel tab open last.
 */

/**
 * Stores the settings: the open document, the split, the print sizes and the side panel tab.
 * @returns {void}
 */
export function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ file: state.fileId, split: state.split, print: state.print, itab: areas.panel?.getTab() })); } catch (error) { /* storage blocked */ }
}

/**
 * Returns the settings stored in this browser.
 * @returns {?StoredSettings} the settings, null when there are none or storage is blocked.
 */
export function readSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (error) { return null; }
}

/**
 * Turns a German tab name in the stored settings into its English name and stores the settings
 * again under it, so the tab last open in this browser opens again. Runs once at start-up, before
 * the settings are read; the only place that knows the German names.
 * @returns {void}
 */
export function updateStoredSettings() {
    try {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
        if (!settings || !Object.hasOwn(GERMAN_TABS, settings.itab)) return;
        settings.itab = GERMAN_TABS[settings.itab];
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) { /* storage blocked or unreadable: nothing to turn */ }
}
