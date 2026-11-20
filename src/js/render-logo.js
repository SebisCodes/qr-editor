/**
 * The logo of a layout (render.js createLayout): the square of modules it
 * clears and how much of the code that covers, then the logo itself - the
 * Swiss cross of a QR bill, a built-in symbol or a picture, each on a light
 * plate where needed. Sizes are in modules.
 */

import { isFinder, isInSquare } from './render-modules.js?v=2';
import { createRoundedRectPath, getPlacedPath, SYMBOLS } from './shapes.js?v=2';

const DEFAULT_LOGO_PERCENT = 20;
/** A whole in percent. */
const PERCENT = 100;
/** The Swiss QR bill: a 7 mm Swiss cross in the middle of a 46 mm code. */
const SWISS_CROSS_MM = 7;
const SWISS_CODE_MM = 46;
const SWISS_LOGO = 'swiss';
const SWISS_CROSS = { border: 0.12, arm: 0.6, armWidth: 3.2 };   // the white border and cross on the black square, as shares of its side
const SYMBOL_GRID = 24;                 // the grid of the built-in symbols
const SYMBOL_SHARE = 0.8;               // a symbol fills this share of the logo square
const SYMBOL_INSET = 0.1;
const SYMBOL_STROKE = 2;                // the pen width of a symbol on its grid
const SYMBOL_PLATE_RADIUS = 0.22;       // of the logo square
const PICTURE_PLATE = { spread: 0.3, radius: 0.6 };
const WHITE = '#ffffff';
const BLACK = '#000000';
const TRANSPARENT = 'transparent';

/**
 * A square in module units.
 * @typedef {Object} LogoBox
 * @property {number} x - the left edge.
 * @property {number} y - the top edge.
 * @property {number} s - the side.
 */

/**
 * The logo area of a layout.
 * @typedef {Object} LogoArea
 * @property {?string} logo - the logo (a symbol name, "swiss" or a picture address), null without one.
 * @property {?ClearSquare} clear - the square of modules the logo clears.
 * @property {?LogoBox} square - where a symbol or picture is drawn.
 * @property {?LogoBox} box - the square of the logo as drawn (the Swiss cross for a QR bill).
 * @property {number} cover - the share of the data modules in the cleared square.
 */

/**
 * Returns the logo area: the square of modules it clears (an odd or even number of modules,
 * like the code, so it sits in the middle) and the share of the data modules it covers.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @returns {LogoArea} the logo area.
 */
export function getLogoArea(frame) {
    const { design, n, ox, oy } = frame;
    const logo = design.logo && design.logo !== 'none' ? design.logo : null;
    if (!logo) return { logo: null, clear: null, square: null, box: null, cover: 0 };
    const size = n * (+design['logo-size'] || DEFAULT_LOGO_PERCENT) / PERCENT;
    let side = Math.ceil(size + 1);
    if (side % 2 !== n % 2) side++;
    const start = (n - side) / 2;
    const clear = { a: start, b: start + side };
    const square = { x: ox + (n - size) / 2, y: oy + (n - size) / 2, s: size };
    const box = logo === SWISS_LOGO ? getSwissCrossBox(frame) : square;
    return { logo, clear, square, box, cover: getCoveredShare(n, clear) };
}

/**
 * Returns the share of the data modules (all but the finder patterns) inside the cleared square.
 * @param {number} n - the modules per side.
 * @param {ClearSquare} clear - the cleared square.
 * @returns {number} the share, 0 to 1.
 */
function getCoveredShare(n, clear) {
    let data = 0, hidden = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (isFinder(x, y, n)) continue;
        data++;
        if (isInSquare(clear, x, y)) hidden++;
    }
    return hidden / data;
}

/**
 * Returns the logo: the Swiss cross, a built-in symbol or a picture, each on a light plate where needed.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @param {LogoArea} logoArea - the logo area.
 * @returns {Array<LayoutItem>} the items of the logo, none without one.
 */
export function createLogoItems(frame, logoArea) {
    const { logo } = logoArea;
    if (!logo) return [];
    if (logo === SWISS_LOGO) return createSwissCrossItems(frame);
    if (SYMBOLS[logo]) return createSymbolItems(frame, logoArea.square, SYMBOLS[logo]);
    return createPictureItems(frame, logoArea.square, logo);
}

/**
 * Returns the middle and size of the Swiss cross: 7 mm of the 46 mm of the code.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @returns {{size: number, cx: number, cy: number}} the side of the black square and its center.
 */
function getSwissCross(frame) {
    const { n, ox, oy } = frame;
    return { size: n * SWISS_CROSS_MM / SWISS_CODE_MM, cx: ox + n / 2, cy: oy + n / 2 };
}

/**
 * Returns the square of the Swiss cross, the logo box of a Swiss QR bill.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @returns {LogoBox} the square.
 */
function getSwissCrossBox(frame) {
    const { size, cx, cy } = getSwissCross(frame);
    return { x: cx - size / 2, y: cy - size / 2, s: size };
}

/**
 * Returns the Swiss cross: a black square with a white border and a white cross.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @returns {Array<LayoutItem>} border, square and cross.
 */
function createSwissCrossItems(frame) {
    const { size, cx, cy } = getSwissCross(frame);
    const border = size * SWISS_CROSS.border;
    const armWidth = size * SWISS_CROSS.arm / SWISS_CROSS.armWidth, armLength = size * SWISS_CROSS.arm;
    return [
        { t: 'path', d: createRoundedRectPath(cx - size / 2 - border, cy - size / 2 - border, size + 2 * border, size + 2 * border, 0), fill: WHITE },
        { t: 'path', d: createRoundedRectPath(cx - size / 2, cy - size / 2, size, size, 0), fill: BLACK },
        { t: 'path', d: [...createRoundedRectPath(cx - armWidth / 2, cy - armLength / 2, armWidth, armLength, 0), ...createRoundedRectPath(cx - armLength / 2, cy - armWidth / 2, armLength, armWidth, 0)], fill: WHITE },
    ];
}

/**
 * Returns a built-in symbol in the color of the eyes (or of the modules), on a plate when the
 * modules stay under it or the background is transparent.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @param {LogoBox} square - where the symbol goes.
 * @param {LogoSymbol} symbol - the symbol.
 * @returns {Array<LayoutItem>} plate, filled areas and lines, as far as there.
 */
function createSymbolItems(frame, square, symbol) {
    const { design, light, dark, fillDark } = frame;
    const { x, y, s } = square;
    const background = light === TRANSPARENT ? null : light;
    const items = [];
    if (design['logo-clear'] === 'no' || !background) items.push({ t: 'path', d: createRoundedRectPath(x, y, s, s, s * SYMBOL_PLATE_RADIUS), fill: background || WHITE });
    const scale = s * SYMBOL_SHARE / SYMBOL_GRID, left = x + s * SYMBOL_INSET, top = y + s * SYMBOL_INSET;
    const ink = design['eye-color'] || (typeof fillDark === 'string' ? fillDark : dark);
    if (symbol.fill) items.push({ t: 'path', d: getPlacedPath(symbol.fill, left, top, scale), fill: ink });
    if (symbol.stroke) items.push({ t: 'stroke', d: getPlacedPath(symbol.stroke, left, top, scale), color: ink, width: SYMBOL_STROKE * scale });
    return items;
}

/**
 * Returns a picture logo, on a plate in the background color when the modules stay under it.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @param {LogoBox} square - where the picture goes.
 * @param {string} href - the picture as data: address.
 * @returns {Array<LayoutItem>} plate (when needed) and picture.
 */
function createPictureItems(frame, square, href) {
    const { x, y, s } = square;
    const background = frame.light === TRANSPARENT ? null : frame.light;
    const items = [];
    if (frame.design['logo-clear'] === 'no' && background) {
        const { spread, radius } = PICTURE_PLATE;
        items.push({ t: 'path', d: createRoundedRectPath(x - spread, y - spread, s + 2 * spread, s + 2 * spread, radius), fill: background });
    }
    items.push({ t: 'image', x, y, w: s, h: s, href });
    return items;
}
