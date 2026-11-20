/* The choices of the Export dialog: its elements, the format and sizes remembered
   in this browser, and the sizes and file name a download is made with (used by
   exportui.js and batch.js). */

import { getSafeFileName } from './util.js?v=3';

/** The media type of each format. */
export const MIME = { svg: 'image/svg+xml', pdf: 'application/pdf', eps: 'application/postscript', png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain', qr: 'text/plain' };

/** Where the chosen format and sizes are remembered. */
const PREFERENCES_KEY = 'qreditor.export';

/** Picture width in pixels: least, most and when the field is empty. */
const MIN_PIXELS = 64;
const MAX_PIXELS = 8192;
const DEFAULT_PIXELS = 1024;

/** Vector width in millimetres: least, most and when the field is empty. */
const MIN_MM = 5;
const MAX_MM = 2000;
const DEFAULT_MM = 50;

/** The resolution of a PNG: least, most and when the field is empty. */
const MIN_DPI = 72;
const MAX_DPI = 1200;
export const DEFAULT_DPI = 300;

/** The elements of the dialog, set by createExportSettings. */
let elements = null;

/** Returns the editor state (see exportui.js). */
let getState = null;

/** The remembered choices. */
let preferences = {};

/**
 * Finds the elements of the Export dialog and puts the remembered format and sizes into it.
 * @param {function(): import('./state.js').EditorState} getEditorState - returns the editor state.
 * @returns {Object<string, HTMLElement>} the dialog, its fields and buttons.
 */
export function createExportSettings(getEditorState) {
    getState = getEditorState;
    elements = getDialogElements();
    readPreferences();
    return elements;
}

/**
 * Returns the elements of the Export dialog.
 * @returns {Object<string, HTMLElement>} the dialog, its fields and buttons.
 */
function getDialogElements() {
    /**
     * Returns the element a selector finds.
     * @param {string} selector - a CSS selector.
     * @returns {?HTMLElement} the element.
     */
    const get = selector => document.querySelector(selector);
    return {
        dialog: get('#export'), format: get('#ex-format'), name: get('#ex-name'), text: get('#ex-text'), info: get('#ex-info'),
        pixels: get('#ex-px'), dpi: get('#ex-dpi'), mm: get('#ex-mm'), measureInfo: get('#ex-measure-info'),
        batchTable: get('#ex-batch-csv'), batchName: get('#ex-batch-name'), batchFormat: get('#ex-batch-format'), batchInfo: get('#ex-batch-info'), batchFile: get('#ex-batch-file'),
        download: get('#ex-download'), zip: get('#ex-zip'), copy: get('#ex-copy'), batchOpen: get('#ex-batch-open'),
    };
}

/**
 * Reads the remembered format and sizes into the dialog.
 * @returns {void}
 */
function readPreferences() {
    try { preferences = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}') || {}; } catch (error) { /* storage blocked */ }
    if (preferences.format && MIME[preferences.format] || preferences.format === 'batch') elements.format.value = preferences.format;
    if (preferences.px) elements.pixels.value = preferences.px;
    if (preferences.dpi) elements.dpi.value = preferences.dpi;
    if (preferences.mm) elements.mm.value = preferences.mm;
}

/**
 * Tells whether a vector width is remembered.
 * @returns {boolean} true when the browser remembers one.
 */
export function hasRememberedWidth() {
    return !!preferences.mm;
}

/**
 * Remembers the chosen format and sizes.
 * @returns {void}
 */
export function savePreferences() {
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ format: elements.format.value, px: elements.pixels.value, dpi: elements.dpi.value, mm: elements.mm.value })); } catch (error) { /* storage blocked */ }
}

/**
 * Returns the file name of a download, without extension.
 * @returns {string} the name in the dialog, else the document's, made safe for a file.
 */
export function getFileName() {
    return getSafeFileName(elements.name.value || getState().name);
}

/**
 * Returns the picture width in the dialog.
 * @returns {number} pixels, within the allowed range.
 */
export function getPixelWidth() {
    return Math.max(MIN_PIXELS, Math.min(MAX_PIXELS, Math.round(+elements.pixels.value || DEFAULT_PIXELS)));
}

/**
 * Returns the vector width in the dialog.
 * @returns {number} millimetres, within the allowed range.
 */
export function getWidthMm() {
    return Math.max(MIN_MM, Math.min(MAX_MM, +elements.mm.value || DEFAULT_MM));
}

/**
 * Returns the resolution written into a PNG.
 * @returns {number} dots per inch, within the allowed range.
 */
export function getPngDpi() {
    return Math.max(MIN_DPI, Math.min(MAX_DPI, +elements.dpi.value || DEFAULT_DPI));
}

/**
 * Returns the size and title of an SVG at the vector width of the dialog.
 * @param {Object} layout - the layout of the code.
 * @returns {{width: string, height: string, title: string}} SVG lengths in mm and the document's name.
 */
export function getSvgSize(layout) {
    const widthMm = getWidthMm();
    return { width: `${widthMm}mm`, height: `${(widthMm * layout.h / layout.w).toFixed(2)}mm`, title: getState().name };
}
