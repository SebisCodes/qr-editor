/* Highlighting of the QR document in the code view: design keys and values
   (colors underlined in their own color), comments, the --- line, and the
   content by its type (WiFi fields, vCard and event properties, payment lines,
   the scheme and parameters of links), with {{column}} placeholders marked. */

import { KEYS } from './qrdoc.js?v=4';
import { escapeHtml } from './state.js?v=2';

/** A design line: indent, key, colon, value. */
const KEY_LINE = /^(\s*)([A-Za-z][A-Za-z0-9-]*)(\s*:)(.*)$/;

/** A color value of a design line. */
const COLOR_VALUE = /^\s*#([0-9a-f]{3}|[0-9a-f]{6})\s*$/i;

/** Values longer than this are highlighted only up to here (a picture logo). */
const MAX_VALUE_HIGHLIGHT = 3000;

/** A {{column}} placeholder of the batch. */
const PLACEHOLDER = /\{\{[^{}\n]{1,60}\}\}/g;

/**
 * Returns the document as highlighted HTML, line by line.
 * @param {string} code - the QR document.
 * @param {Object} doc - the parsed document (qrdoc.js parseDoc).
 * @param {string} type - the content type.
 * @returns {string} the HTML of the lines, joined with line breaks.
 */
export function highlight(code, doc, type) {
    const out = [];
    const lines = code.split('\n');
    const separator = doc.header ? doc.sepLine : -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (i < separator) out.push(highlightHeaderLine(line));
        else if (i === separator) out.push(`<span class="d">${escapeHtml(line)}</span>`);
        else out.push(highlightContentLine(line, type, i - separator - 1));
    }
    return out.join('\n');
}

/**
 * Returns a line of the header highlighted: a comment, a design line or plain text.
 * @param {string} line - the line.
 * @returns {string} its HTML.
 */
function highlightHeaderLine(line) {
    const match = KEY_LINE.exec(line);
    if (/^\s*#/.test(line)) return `<span class="c">${escapeHtml(line)}</span>`;
    if (!match) return escapeHtml(line);
    const known = !!KEYS[match[2].toLowerCase()];
    const value = match[4];
    const color = COLOR_VALUE.exec(value);
    const valueHtml = value.length > MAX_VALUE_HIGHLIGHT ? escapeHtml(value.slice(0, MAX_VALUE_HIGHLIGHT)) + `<span class="p">${escapeHtml(value.slice(MAX_VALUE_HIGHLIGHT))}</span>` : escapeHtml(value);
    const valueSpan = color ? `<span class="s color-value" style="text-decoration-color:${escapeHtml('#' + color[1])}">${valueHtml}</span>` : `<span class="s">${valueHtml}</span>`;
    return `${escapeHtml(match[1])}<span class="${known ? 'k' : 'e'}">${escapeHtml(match[2])}</span><span class="p">${escapeHtml(match[3])}</span>${valueSpan}`;
}

/**
 * Marks the {{column}} placeholders in highlighted HTML.
 * @param {string} html - escaped HTML of a line.
 * @returns {string} the HTML with each placeholder in a span.
 */
function highlightPlaceholders(html) {
    return html.replace(PLACEHOLDER, placeholder => `<span class="e">${placeholder}</span>`);
}

/**
 * Returns a line of the content highlighted by its type.
 * @param {string} line - the line.
 * @param {string} type - the content type.
 * @param {number} index - the 0-based line within the content.
 * @returns {string} its HTML.
 */
function highlightContentLine(line, type, index) {
    if (type === 'wifi') return highlightPlaceholders(escapeHtml(line).replace(/(WIFI:|(?<=;|WIFI:)(?:T|S|P|H|R|I|K):)/g, '<span class="k">$1</span>'));
    if (type === 'contact' || type === 'event') return highlightPropertyLine(line);
    if (type === 'epc' || type === 'swiss') return index === 0 ? `<span class="k">${escapeHtml(line)}</span>` : highlightPlaceholders(escapeHtml(line));
    const scheme = /^([a-z][a-z0-9+.-]*:)(.*)$/i.exec(line);
    if (index === 0 && scheme && type !== 'text') return `<span class="k">${escapeHtml(scheme[1])}</span>${highlightPlaceholders(escapeHtml(scheme[2]).replace(/([?&])([^=&]+=)/g, '$1<span class="a">$2</span>'))}`;
    return highlightPlaceholders(escapeHtml(line));
}

/**
 * Returns a line of a contact or an event highlighted: MeCard fields, or the property before the colon.
 * @param {string} line - the line.
 * @returns {string} its HTML.
 */
function highlightPropertyLine(line) {
    const colon = line.indexOf(':');
    if (/^MECARD:/i.test(line)) return highlightPlaceholders(escapeHtml(line).replace(/(MECARD:|(?<=;|MECARD:)[A-Z-]+:)/g, '<span class="k">$1</span>'));
    return colon > 0 ? `<span class="k">${escapeHtml(line.slice(0, colon))}</span><span class="p">:</span>${highlightPlaceholders(escapeHtml(line.slice(colon + 1)))}` : highlightPlaceholders(escapeHtml(line));
}
