/* Pieces of HTML the tabs of the side panel share: escaping, and the small
   pictures of the module shapes, eyes and built-in logos for the pickers. */

import { SYMBOLS, formatPathData } from './shapes.js?v=2';

/** Small pictures of the module shapes (a 3 x 3 pattern), 22 x 22. */
export const MODULE_PICTURES = {
    square: '<path d="M2 2h6v6H2zM8 8h6v6H8zM14 2h6v6h-6zM2 14h6v6H2zM14 14h6v6h-6z"/>',
    rounded: '<path d="M5 2h3v6H2V5a3 3 0 0 1 3-3zM8 8h6v6H8zM14 2h3a3 3 0 0 1 3 3v3h-6zM2 14h6v6H5a3 3 0 0 1-3-3zM14 14h6v3a3 3 0 0 1-3 3h-3z"/>',
    dots: '<circle cx="5" cy="5" r="2.8"/><circle cx="11" cy="11" r="2.8"/><circle cx="17" cy="5" r="2.8"/><circle cx="5" cy="17" r="2.8"/><circle cx="17" cy="17" r="2.8"/>',
    soft: '<rect x="2.3" y="2.3" width="5.4" height="5.4" rx="1.8"/><rect x="8.3" y="8.3" width="5.4" height="5.4" rx="1.8"/><rect x="14.3" y="2.3" width="5.4" height="5.4" rx="1.8"/><rect x="2.3" y="14.3" width="5.4" height="5.4" rx="1.8"/><rect x="14.3" y="14.3" width="5.4" height="5.4" rx="1.8"/>',
    diamond: '<path d="M5 2l3 3-3 3-3-3zM11 8l3 3-3 3-3-3zM17 2l3 3-3 3-3-3zM5 14l3 3-3 3-3-3zM17 14l3 3-3 3-3-3z"/>',
    'bars-v': '<rect x="2.6" y="2.4" width="4.8" height="17.2" rx="2.4"/><rect x="8.6" y="8.4" width="4.8" height="5.2" rx="2.4"/><rect x="14.6" y="2.4" width="4.8" height="17.2" rx="2.4"/>',
    'bars-h': '<rect x="2.4" y="2.6" width="17.2" height="4.8" rx="2.4"/><rect x="8.4" y="8.6" width="5.2" height="4.8" rx="2.4"/><rect x="2.4" y="14.6" width="17.2" height="4.8" rx="2.4"/>',
};

/** Small pictures of the eye frames, 22 x 22. */
export const FRAME_PICTURES = {
    square: '<path fill-rule="evenodd" d="M2 2h18v18H2zM5 5v12h12V5z"/>',
    rounded: '<path fill-rule="evenodd" d="M8 2h6a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6zM8.5 5A3.5 3.5 0 0 0 5 8.5v5A3.5 3.5 0 0 0 8.5 17h5a3.5 3.5 0 0 0 3.5-3.5v-5A3.5 3.5 0 0 0 13.5 5z"/>',
    circle: '<path fill-rule="evenodd" d="M11 2a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"/>',
    leaf: '<path fill-rule="evenodd" d="M10 2h10v10a8 8 0 0 1-8 8H2V10a8 8 0 0 1 8-8zm0 3a5 5 0 0 0-5 5v7h7a5 5 0 0 0 5-5V5z"/>',
};

/** Small pictures of the eye centers, 22 x 22. */
export const BALL_PICTURES = {
    square: '<rect x="5" y="5" width="12" height="12"/>',
    rounded: '<rect x="5" y="5" width="12" height="12" rx="3.5"/>',
    circle: '<circle cx="11" cy="11" r="6.5"/>',
    diamond: '<path d="M11 3.5l7.5 7.5-7.5 7.5-7.5-7.5z"/>',
    leaf: '<path d="M10 5h7v7a5 5 0 0 1-5 5H5v-7a5 5 0 0 1 5-5z"/>',
};

/** The labels of the shape pickers. */
export const PICKER_LABELS = { modules: 'Module shape', 'eye-frame': 'Eye frame', 'eye-ball': 'Eye center' };

/** The names of the shapes and the built-in logos. */
export const CHOICE_NAMES = {
    square: 'Square', rounded: 'Rounded', dots: 'Dots', soft: 'Soft squares', diamond: 'Diamonds', 'bars-v': 'Vertical bars', 'bars-h': 'Horizontal bars',
    circle: 'Circle', leaf: 'Leaf', none: 'No logo',
    wifi: 'WiFi', web: 'Web', mail: 'Mail', phone: 'Phone', chat: 'Chat', pin: 'Map pin', calendar: 'Calendar', user: 'Person', pay: 'Payment card', star: 'Star', heart: 'Heart',
};

/**
 * Escapes a text for HTML content and attribute values.
 * @param {*} text - the text; null and undefined become empty.
 * @returns {string} the text with &, <, > and " escaped.
 */
export function escapeAttribute(text) {
    return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Returns the small picture of a built-in logo, in the colors of the text around it.
 * @param {string} name - the name of the symbol (render SYMBOLS).
 * @returns {string} an SVG of 24 x 24.
 */
export function renderSymbolPicture(name) {
    const symbol = SYMBOLS[name];
    const fill = symbol.fill ? `<path d="${formatPathData(symbol.fill)}" fill="currentColor" stroke="none"/>` : '';
    const stroke = symbol.stroke ? `<path d="${formatPathData(symbol.stroke)}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : '';
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${fill}${stroke}</svg>`;
}
