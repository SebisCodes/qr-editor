/**
 * Encoding and laying out a QR code. createQrCode() makes the code with
 * qrcodegen (Project Nayuki); createLayout() turns it and the design into one
 * list of shapes in module units (paths of M / L / C / Z commands, lines,
 * text, a picture). Every output is made from that list - the canvas, SVG
 * (draw.js), PDF and EPS (export.js) - so they look the same. A Swiss QR bill
 * is always drawn as its standard requires (getEffectiveDesign).
 *
 * createLayout() runs these steps; the items are listed in this order:
 *   1. the caption: its lines and size, and the band it needs;
 *   2. the frame: sizes, where the code sits, its colors;
 *   3. background and frame;
 *   4. the logo area and how much of the code it covers;
 *   5. the modules in their shape;
 *   6. the alignment patterns as whole rings (all shapes except square);
 *   7. the finder patterns (the three eyes);
 *   8. the logo;
 *   9. the caption.
 * The steps are in render-caption.js (1, 9), render-logo.js (4, 8) and
 * render-modules.js (5 to 7).
 */

import qrcodegen from '../vendor/qrcodegen/qrcodegen.js';
import { createCaptionItems, getCaptionLayout } from './render-caption.js?v=2';
import { createLogoItems, getLogoArea } from './render-logo.js?v=3';
import { createAlignmentItems, createFinderItems, createModuleItems, getAlignmentCenters } from './render-modules.js?v=2';
import { createRoundedRectPath } from './shapes.js?v=2';

const { QrCode, QrSegment } = qrcodegen;
const ECC = { L: QrCode.Ecc.LOW, M: QrCode.Ecc.MEDIUM, Q: QrCode.Ecc.QUARTILE, H: QrCode.Ecc.HIGH };

/** The share of the code each error correction level repairs. */
export const RECOVERY = { L: 0.07, M: 0.15, Q: 0.25, H: 0.30 };

/** The font of the caption. */
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** The largest QR code version (ISO/IEC 18004: versions 1 to 40). */
export const MAX_VERSION = 40;
const MODE_BITS = 4;
const BITS_PER_BYTE = 8;
const TOO_LONG = 'The content is too long for a QR code at this error correction - shorten it or choose L';
const FRAME_PADDING = 1.6;              // modules between the frame's edge and the quiet zone
const FRAME_RADIUS = 2;
const FILLED_INNER_RADIUS = 1.2;
const LINE_FRAME = { outer: 0.3, outerRadius: 1.8, inner: 0.9, innerRadius: 1.3 };
const LIGHT = '#ffffff';
const TRANSPARENT = 'transparent';

/**
 * A QR code made from a content, or why it could not be made.
 * @typedef {Object} Encoding
 * @property {Object} [qr] - the QrCode of qrcodegen.
 * @property {number} [version] - the version, 1 to 40.
 * @property {string} [ecc] - the error correction level, L, M, Q or H.
 * @property {number} [size] - the modules per side.
 * @property {number} [mask] - the mask pattern, 0 to 7.
 * @property {number} [bytes] - the bytes the content takes.
 * @property {number} [capacity] - the data bytes of the version and level.
 * @property {string} [error] - why there is no code.
 */

/**
 * One shape of a layout, in module units.
 * @typedef {Object} LayoutItem
 * @property {string} t - "path" (filled), "stroke" (a line), "image" (a picture) or "text".
 * @property {Path} [d] - the path (path, stroke).
 * @property {(string|GradientFill)} [fill] - the color or gradient (path), the color (text).
 * @property {string} [rule] - "evenodd" for a path with holes.
 * @property {string} [color] - the color of a line.
 * @property {number} [width] - the width of a line or picture.
 * @property {number} [x] - the left edge of a picture, the center of a text.
 * @property {number} [y] - the top edge of a picture, the middle of a text.
 * @property {number} [w] - the width of a picture.
 * @property {number} [h] - the height of a picture.
 * @property {string} [href] - the picture as data: address.
 * @property {number} [size] - the font size of a text.
 * @property {string} [text] - the text.
 * @property {number} [weight] - the font weight of a text.
 */

/**
 * A gradient over the code.
 * @typedef {Object} GradientFill
 * @property {string} type - "linear" or "radial".
 * @property {string} c1 - the first color.
 * @property {string} c2 - the second color.
 * @property {number} angle - the direction of a linear gradient in degrees (0 = left to right).
 * @property {number} x - the left edge of the code.
 * @property {number} y - the top edge of the code.
 * @property {number} w - the width of the code.
 * @property {number} h - the height of the code.
 */

/**
 * A drawn code: every shape in module units.
 * @typedef {Object} Layout
 * @property {number} w - the width.
 * @property {number} h - the height.
 * @property {Array<LayoutItem>} items - the shapes, from back to front.
 * @property {{x: number, y: number, n: number, m: number}} code - where the modules start, their number per side and the quiet zone.
 * @property {number} cover - the share of the data modules the logo area covers, 0 without a logo.
 * @property {?{x: number, y: number, s: number}} logoBox - the square of the logo, null without one.
 * @property {number} quiet - the quiet zone in modules.
 */

/**
 * The sizes and colors of a layout that every step uses.
 * @typedef {Object} LayoutFrame
 * @property {Object} qr - the QrCode.
 * @property {number} n - the modules per side.
 * @property {number} margin - the quiet zone in modules.
 * @property {Design} design - the design.
 * @property {boolean} isFramed - whether the code has a frame.
 * @property {number} pad - the space between the frame's edge and the quiet zone.
 * @property {number} full - the code with its quiet zone, per side.
 * @property {number} width - the width of the layout.
 * @property {number} height - the height of the layout.
 * @property {boolean} isAbove - whether the caption is above the code.
 * @property {number} codeY - the top of the quiet zone.
 * @property {number} ox - the left edge of the modules.
 * @property {number} oy - the top edge of the modules.
 * @property {string} dark - the color of the modules.
 * @property {string} light - the background color, or "transparent".
 * @property {string} frameColor - the color of the frame and the caption.
 * @property {(string|GradientFill)} fillDark - the paint of the modules.
 */

/**
 * Makes the QR code of a content at the error correction, version and mask of the design.
 * @param {string} content - the content.
 * @param {Design} design - the design (ecc, version, mask, boost).
 * @returns {Encoding} the code, or an error when the content does not fit.
 */
export function createQrCode(content, design) {
    const level = ECC[design.ecc] || ECC.M;
    const minVersion = design.version === 'auto' ? 1 : +design.version;
    const mask = design.mask === 'auto' ? -1 : +design.mask;
    const segments = QrSegment.makeSegments(String(content ?? ''));
    try {
        const qr = QrCode.encodeSegments(segments, level, minVersion, MAX_VERSION, mask, design.boost !== 'no');
        const eccName = Object.keys(ECC).find(key => ECC[key] === qr.errorCorrectionLevel);
        const bits = segments.reduce((sum, segment) => sum + MODE_BITS + segment.mode.numCharCountBits(qr.version) + segment.bitData.length, 0);
        return { qr, version: qr.version, ecc: eccName, size: qr.size, mask: qr.mask, bytes: Math.ceil(bits / BITS_PER_BYTE), capacity: getDataCodewords(qr.version, qr.errorCorrectionLevel) };
    } catch (error) {
        return { error: TOO_LONG };
    }
}

/**
 * Returns the data codewords of a version and level (the same tables as qrcodegen).
 * @param {number} version - the version, 1 to 40.
 * @param {Object} level - the Ecc of qrcodegen.
 * @returns {number} the number of data bytes.
 */
function getDataCodewords(version, level) {
    return Math.floor(QrCode.getNumRawDataModules(version) / BITS_PER_BYTE)
        - QrCode.ECC_CODEWORDS_PER_BLOCK[level.ordinal][version] * QrCode.NUM_ERROR_CORRECTION_BLOCKS[level.ordinal][version];
}

/**
 * Returns the design of a code: a Swiss QR bill always has the design its standard asks for.
 * @param {Design} design - the design of the document.
 * @param {boolean} isSwiss - whether the code is a Swiss QR bill.
 * @returns {Design} the design to draw with.
 */
export function getEffectiveDesign(design, isSwiss) {
    if (!isSwiss) return design;
    return { ...design, ecc: 'M', boost: 'no', version: 'auto', mask: design.mask, margin: design.margin, color: '#000000', color2: '', gradient: 'none', background: '#ffffff',
        modules: 'square', 'eye-frame': 'square', 'eye-ball': 'square', 'eye-color': '', logo: 'swiss', 'logo-size': '15', 'logo-clear': 'yes', frame: 'none', caption: '' };
}

/**
 * Lays out a code with its design as shapes in module units.
 * @param {Encoding} encoding - the code (without error).
 * @param {Design} design - the design to draw with.
 * @param {function(string, number): number} [measureText] - the width of a text at a font size; estimated when left out.
 * @returns {Layout} the layout.
 */
export function createLayout(encoding, design, measureText) {
    const margin = +design.margin;
    const isFramed = design.frame !== 'none';
    const caption = getCaptionLayout(design, encoding.qr.size + 2 * margin, isFramed, measureText);
    const frame = getLayoutFrame(encoding.qr, design, caption);
    const logoArea = getLogoArea(frame);
    const alignments = getAlignmentCenters(frame, logoArea);
    const items = [
        ...createBackgroundItems(frame),
        ...createModuleItems(frame, logoArea, alignments),
        ...createAlignmentItems(frame, alignments),
        ...createFinderItems(frame),
        ...createLogoItems(frame, logoArea),
        ...createCaptionItems(frame, caption),
    ];
    return { w: frame.width, h: frame.height, items, code: { x: frame.ox, y: frame.oy, n: frame.n, m: frame.margin }, cover: logoArea.cover, logoBox: logoArea.box, quiet: frame.margin };
}

/**
 * Returns the sizes, places and colors of a layout.
 * @param {Object} qr - the QrCode.
 * @param {Design} design - the design.
 * @param {CaptionLayout} caption - the caption.
 * @returns {LayoutFrame} the frame of the layout.
 */
function getLayoutFrame(qr, design, caption) {
    const n = qr.size, margin = +design.margin;
    const isFramed = design.frame !== 'none';
    const pad = isFramed ? FRAME_PADDING : 0;
    const full = n + 2 * margin;
    const isAbove = design['caption-position'] === 'above';
    const codeY = pad + (isAbove ? caption.band : 0);
    const ox = pad + margin, oy = codeY + margin;
    const dark = design.color;
    const fillDark = design.gradient !== 'none' && design.color2
        ? { type: design.gradient, c1: dark, c2: design.color2, angle: +design.angle, x: ox, y: oy, w: n, h: n }
        : dark;
    return {
        qr, n, margin, design, isFramed, pad, full, width: full + 2 * pad, height: full + 2 * pad + caption.band, isAbove, codeY, ox, oy,
        dark, light: design.background, frameColor: design['frame-color'] || dark, fillDark,
    };
}

/**
 * Returns the background and the frame: a filled frame with a light field for the code,
 * or the background (unless transparent) with an optional line frame.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @returns {Array<LayoutItem>} the items.
 */
function createBackgroundItems(frame) {
    const { design, isFramed, pad, full, width, height, codeY, light, frameColor } = frame;
    if (design.frame === 'filled') {
        return [
            { t: 'path', d: createRoundedRectPath(0, 0, width, height, FRAME_RADIUS), fill: frameColor },
            { t: 'path', d: createRoundedRectPath(pad, codeY, full, full, FILLED_INNER_RADIUS), fill: light === TRANSPARENT ? LIGHT : light },
        ];
    }
    const items = [];
    if (light !== TRANSPARENT) {
        const area = isFramed ? createRoundedRectPath(0, 0, width, height, FRAME_RADIUS) : [['M', 0, 0], ['L', width, 0], ['L', width, height], ['L', 0, height], ['Z']];
        items.push({ t: 'path', d: area, fill: light });
    }
    if (design.frame === 'line') {
        const { outer, outerRadius, inner, innerRadius } = LINE_FRAME;
        const ring = [...createRoundedRectPath(outer, outer, width - 2 * outer, height - 2 * outer, outerRadius), ...createRoundedRectPath(inner, inner, width - 2 * inner, height - 2 * inner, innerRadius)];
        items.push({ t: 'path', d: ring, fill: frameColor, rule: 'evenodd' });
    }
    return items;
}
