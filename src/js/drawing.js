/* A QR document drawn as a layout: the document is read, its content type
   found, the design a type requires applied, the code encoded and laid out
   as shapes in module units (render.js). Used for the open document, the
   thumbnails of "My documents", the batch and the exports. Caption widths
   are measured with the canvas text metrics. */

import { parseDoc } from './qrdoc.js?v=4';
import { getContentType } from './payload.js?v=5';
import { createQrCode, createLayout, getEffectiveDesign, FONT } from './render.js?v=4';

/** The font size the widths are measured at; they are scaled from it. */
const MEASURE_SIZE = 100;

/** The canvas context used for measuring text. */
const measureContext = document.createElement('canvas').getContext('2d');

/**
 * A document read and drawn.
 * @typedef {Object} DrawnDocument
 * @property {Object} doc - the parsed document (qrdoc.js parseDoc).
 * @property {string} content - the content that goes into the code.
 * @property {string} type - the content type.
 * @property {Object} eff - the design the code is drawn with.
 * @property {Object} enc - the encoded code, or `{ error }`.
 * @property {Object|null} layout - the layout in module units, null when there is no code.
 */

/**
 * Returns the width of a text in the caption's bold font at 100 units, for placing the cursor.
 * @param {string} text - the text.
 * @returns {number} the width at font size 100.
 */
export function getTextWidth(text) {
    measureContext.font = `700 ${MEASURE_SIZE}px ${FONT}`;
    return measureContext.measureText(text).width;
}

/**
 * Returns the width of a caption in module units, for the layout.
 * @param {string} text - the caption text.
 * @param {number} size - the font size in module units.
 * @param {string} [family=FONT] - the font family.
 * @returns {number} the width in the units of size.
 */
export function getCaptionWidth(text, size, family = FONT) {
    measureContext.font = `700 ${MEASURE_SIZE}px ${family}`;
    return measureContext.measureText(text).width * size / MEASURE_SIZE;
}

/**
 * Reads a document text and draws its code (also for thumbnails, the batch and exports).
 * @param {string} code - the QR document.
 * @param {string} [overrideContent] - a content to draw instead of the document's own.
 * @returns {DrawnDocument} the document, its content, type, design, encoding and layout.
 */
export function drawDocument(code, overrideContent) {
    const doc = parseDoc(code);
    const content = overrideContent ?? doc.content;
    const type = getContentType(content);
    const eff = getFixedDesign(type, doc.design);
    const enc = createQrCode(content, eff);
    return { doc, content, type, eff, enc, layout: enc.error ? null : createLayout(enc, eff, getCaptionWidth) };
}

/**
 * Returns the design a content type requires: the Swiss QR bill as its standard, EPC with error correction M.
 * @param {string} type - the content type.
 * @param {Object} design - the design of the document.
 * @returns {Object} the design the code is drawn with.
 */
export function getFixedDesign(type, design) {
    if (type === 'swiss') return getEffectiveDesign(design, true);
    if (type === 'epc') return { ...design, ecc: 'M', boost: 'no' };
    return design;
}
