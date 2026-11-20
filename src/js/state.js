/* The state of the QR editor that its modules share: the open document and
   what is read from it, the elements of the work area, and the areas set up
   at start-up (app.js fills `areas`). The document text in `state.code` is
   the single source of truth; everything else in `state` is made from it.
   The field names are read by the browser tests through window.qrEditor.state. */

/** Settings of this browser (open document, split, print sizes, side panel tab). */
export const SETTINGS_KEY = 'qreditor.v1';

/** The name of a document that has none. */
export const DEFAULT_NAME = 'QR code';

/** The screen width up to which the work area shows one pane at a time. */
export const NARROW_SCREEN = matchMedia('(max-width: 860px)');

/**
 * A problem found in the document, with its 0-based line.
 * @typedef {Object} Problem
 * @property {number} line - the 0-based line of the document it is about.
 * @property {string} kind - "error", "warn" or "info".
 * @property {string} msg - the English text (translated when shown).
 */

/**
 * The open document and what the editor read from it.
 * @typedef {Object} EditorState
 * @property {string} code - the QR document as text.
 * @property {Object|null} doc - the parsed document (qrdoc.js parseDoc).
 * @property {string} content - the content that goes into the code.
 * @property {string} type - the content type (payload.js TYPES).
 * @property {Object|null} design - the design of the document's header.
 * @property {Object|null} eff - the design the code is drawn with (fixed for payment types).
 * @property {Object|null} enc - the encoded code (render.js createQrCode), or `{ error }`.
 * @property {Object|null} layout - the drawn layout in module units, null when there is no code.
 * @property {Problem[]} problems - every problem, scan check included, errors first.
 * @property {Problem[]} [coreProblems] - the problems without the scan check.
 * @property {Object|null} scan - the result of the scan check, null while it runs.
 * @property {string} name - the name of the open document.
 * @property {string} fileId - the id of the open document in "My documents", "" without one.
 * @property {number} split - the share of the code pane in the work area.
 * @property {{code: string, sel: number}[]} history - undo steps, the last one is the current text.
 * @property {{code: string, sel: number}[]} future - redo steps.
 * @property {number} histTimer - the timer that makes typing an undo step after a pause.
 * @property {boolean} showProblems - whether the problem list above the code is open.
 * @property {{dist: number, mm: number}} print - scanning distance (cm) and printed width (mm) of the Check tab.
 * @property {boolean} [merging] - a continuous change (dragging, typing in the panel) is under way.
 * @property {boolean} [panelEdit] - the side panel itself is writing, so it is not drawn again.
 */

/** @type {EditorState} */
export const state = {
    code: '', doc: null, content: '', type: 'text', design: null, eff: null, enc: null, layout: null,
    problems: [], scan: null, name: DEFAULT_NAME, fileId: '', split: 0.34,
    history: [], future: [], histTimer: 0, showProblems: true, print: { dist: 30, mm: 30 },
};

/** The elements of the work area. */
export const ui = {
    codeArea: document.querySelector('#code'),
    highlightLayer: document.querySelector('#hl'),
    markLayer: document.querySelector('#marks'),
    gutter: document.querySelector('#gutter'),
    codeStatus: document.querySelector('#code-status'),
    problemBox: document.querySelector('#code-error'),
    codeView: document.querySelector('#qr-view'),
    stage: document.querySelector('#stage'),
    emptyNote: document.querySelector('#qr-empty'),
    scanBadge: document.querySelector('#scan-badge'),
    scanBadgeText: document.querySelector('#scan-text'),
    codeInfo: document.querySelector('#qr-info'),
    work: document.querySelector('#work'),
    toast: document.querySelector('#toast'),
};

/**
 * The areas set up at start-up, through which the modules reach each other; null until app.js sets them.
 * @type {{panel: ?Object, sync: ?Object, files: ?Object, exporter: ?Object, ai: ?Object, aiStatus: ?Object}}
 */
export const areas = { panel: null, sync: null, files: null, exporter: null, ai: null, aiStatus: null };

/**
 * Returns the element a selector finds.
 * @param {string} selector - a CSS selector.
 * @param {ParentNode} [root=document] - where to look.
 * @returns {?Element} the first match, null when there is none.
 */
export const getElement = (selector, root = document) => root.querySelector(selector);

/**
 * Returns every element a selector finds.
 * @param {string} selector - a CSS selector.
 * @param {ParentNode} [root=document] - where to look.
 * @returns {Element[]} the matches in document order.
 */
export const getElements = (selector, root = document) => [...root.querySelectorAll(selector)];

/**
 * Escapes a text for HTML element content.
 * @param {*} text - the text (turned into a string).
 * @returns {string} the text with &, < and > escaped.
 */
export const escapeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Returns a number kept within a range.
 * @param {number} value - the number.
 * @param {number} min - the lowest value.
 * @param {number} max - the highest value.
 * @returns {number} value, or the nearest end of the range.
 */
export const getNumberInRange = (value, min, max) => Math.min(max, Math.max(min, value));
