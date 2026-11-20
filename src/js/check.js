/**
 * Checks of a drawn code: it is read back with jsQR (Cosmo Wolfe, Apache 2.0)
 * under three conditions (checkScan), the colors are compared (contrast as WCAG
 * measures it), the logo against what the error correction can repair, the
 * quiet zone against the 4 modules of the standard (getDesignProblems).
 * readImage() also reads codes in pictures and camera frames. Nothing leaves
 * the browser.
 *
 * checkScan() runs these steps:
 *   1. draw the code large and read it: it must give back exactly the content;
 *   2. draw it small (3 pixels per module) and read it;
 *   3. draw it blurred and with less contrast and read it;
 *   4. "good" when all three read, "fair" when only the first does.
 */

import '../vendor/jsqr/jsQR.js';
import { drawCanvas, importImages } from './draw.js?v=3';
import { RECOVERY } from './render.js?v=4';

/**
 * The design a code is drawn with (qrdoc.js DEFAULTS keys, values as strings).
 * @typedef {Object<string, string>} Design
 */

/**
 * A layout in module units (render.js createLayout).
 * @typedef {import('./render.js').Layout} Layout
 */

/**
 * An encoded code (render.js createQrCode).
 * @typedef {import('./render.js').Encoding} Encoding
 */

const jsQR = globalThis.jsQR;

const READ_SIZES = [1000, 1600, 600, 2400];  // the longer side in pixels a picture is read at, in this order
const MAX_UPSCALE = 4;
const WHITE = '#ffffff';
const WCAG_WEIGHTS = [0.2126, 0.7152, 0.0722];
const WCAG_FLARE = 0.05;
/** The sRGB transfer of WCAG's relative luminance: linear up to the limit, else ((v + offset) / (1 + offset)) ^ exponent. */
const SRGB_LINEAR_LIMIT = 0.03928;
const SRGB_LINEAR_SLOPE = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_EXPONENT = 2.4;
/** The largest value of one color channel. */
const CHANNEL_MAX = 255;
/** A whole in percent. */
const PERCENT = 100;
const CONTRAST_ERROR = 3;               // below this contrast many scanners fail
const CONTRAST_WARNING = 4.5;           // from this contrast on a code scans reliably
const STANDARD_QUIET_ZONE = 4;
const MIN_QUIET_ZONE = 2;
const LOGO_ERROR_SHARE = 0.8;           // a logo that covers more of what the error correction repairs is an error
const LOGO_WARNING_SHARE = 0.5;
const SCAN_PIXELS = 900;                // the code is read back at about this width
const LARGE_SCALE = { min: 4, max: 10 };
const SMALL_SCALE = 3;
const HARSH_SCALE = { min: 5, max: 8 };
const HARSH_BLUR = 0.28;                // pixels of blur per pixel of a module
const HARSH_HAZE = { color: '#9a9a9a', alpha: 0.38 };
const SCAN_MARGIN = 2;                  // modules of white around the drawn code

/**
 * A code read from pixels.
 * @typedef {Object} ReadCode
 * @property {string} text - the content as text.
 * @property {Array<number>} bytes - the content as bytes.
 * @property {number} version - the version of the code.
 */

/**
 * A problem of the design.
 * @typedef {Object} DesignProblem
 * @property {string} kind - "error", "warn" or "info".
 * @property {string} key - the design line it is about.
 * @property {string} msg - what is wrong (English; the language pack translates it).
 */

/**
 * The result of checkScan().
 * @typedef {Object} ScanResult
 * @property {string} level - "good" (all three conditions read), "fair" (only the large code reads) or "fail".
 * @property {boolean} [wrong] - the code reads, but gives back another content.
 * @property {string} [text] - the content read back, when it is wrong.
 * @property {{normal: boolean, small: boolean, harsh: boolean}} results - which conditions read the content.
 */

/**
 * Reads the QR code in an image.
 * @param {ImageData} imageData - the pixels.
 * @returns {?ReadCode} the code, null when there is none.
 */
export function readPixels(imageData) {
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    return code ? { text: code.data, bytes: code.binaryData, version: code.version } : null;
}

/**
 * Reads the QR code in a picture or camera frame. Large pictures are scaled down, small ones up;
 * several sizes are tried (a video frame once).
 * @param {File|Blob|HTMLImageElement|ImageBitmap|HTMLVideoElement} source - the picture.
 * @returns {Promise<?ReadCode>} the code, null when none is found.
 */
export async function readImage(source) {
    const picture = await importPicture(source);
    const width = picture.videoWidth || picture.naturalWidth || picture.width, height = picture.videoHeight || picture.naturalHeight || picture.height;
    if (!width || !height) return null;
    for (const target of READ_SIZES) {
        const code = readScaledPicture(picture, width, height, Math.min(MAX_UPSCALE, target / Math.max(width, height)));
        if (code) return code;
        if (picture.videoWidth) break;
    }
    return null;
}

/**
 * Returns a picture that can be drawn: a file is decoded (an SVG file through an image element).
 * @param {File|Blob|HTMLImageElement|ImageBitmap|HTMLVideoElement} source - the picture.
 * @returns {Promise<HTMLImageElement|ImageBitmap|HTMLVideoElement>} the drawable picture.
 */
async function importPicture(source) {
    if (!(source instanceof Blob)) return source;
    if (!/svg/.test(source.type)) return createImageBitmap(source);
    const image = new Image();
    image.src = URL.createObjectURL(source);
    try { await image.decode(); } finally { URL.revokeObjectURL(image.src); }
    return image;
}

/**
 * Draws a picture scaled on white and reads the code in it.
 * @param {HTMLImageElement|ImageBitmap|HTMLVideoElement} picture - the picture.
 * @param {number} width - its width in pixels.
 * @param {number} height - its height in pixels.
 * @param {number} scale - the factor it is drawn at.
 * @returns {?ReadCode} the code, null when none is found.
 */
function readScaledPicture(picture, width, height, scale) {
    const scaledWidth = Math.max(1, Math.round(width * scale)), scaledHeight = Math.max(1, Math.round(height * scale));
    const canvas = new OffscreenCanvas(scaledWidth, scaledHeight), context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, scaledWidth, scaledHeight);
    context.drawImage(picture, 0, 0, scaledWidth, scaledHeight);
    return readPixels(context.getImageData(0, 0, scaledWidth, scaledHeight));
}

/**
 * Returns the relative luminance of a color as WCAG defines it.
 * @param {string} hex - the color #rgb or #rrggbb.
 * @returns {number} the luminance, 0 (black) to 1 (white).
 */
function getLuminance(hex) {
    let digits = hex.replace('#', '');
    if (digits.length === 3) digits = [...digits].map(digit => digit + digit).join('');
    const channels = [0, 2, 4].map(i => parseInt(digits.slice(i, i + 2), 16) / CHANNEL_MAX).map(value => (value <= SRGB_LINEAR_LIMIT ? value / SRGB_LINEAR_SLOPE : ((value + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_EXPONENT));
    return WCAG_WEIGHTS[0] * channels[0] + WCAG_WEIGHTS[1] * channels[1] + WCAG_WEIGHTS[2] * channels[2];
}

/**
 * Returns the contrast ratio of two colors as WCAG defines it.
 * @param {string} color - the first color #rgb or #rrggbb.
 * @param {string} background - the second color.
 * @returns {number} the ratio, 1 to 21.
 */
export function getContrast(color, background) {
    const first = getLuminance(color), second = getLuminance(background);
    return (Math.max(first, second) + WCAG_FLARE) / (Math.min(first, second) + WCAG_FLARE);
}

/**
 * Returns the problems of a design: contrast, light on dark, transparency, quiet zone, logo and eyes.
 * A Swiss QR bill has its fixed design and no problems here.
 * @param {Design} design - the design.
 * @param {?Layout} layout - the layout, null when the code could not be made.
 * @param {?Encoding} encoding - the code.
 * @param {boolean} isSwiss - whether the code is a Swiss QR bill.
 * @returns {Array<DesignProblem>} the problems in this order: colors, quiet zone, logo cover, eyes, logo and error correction.
 */
export function getDesignProblems(design, layout, encoding, isSwiss) {
    if (isSwiss) return [];
    return [
        ...getColorProblems(design),
        ...getQuietZoneProblems(design),
        ...getLogoCoverProblems(layout, encoding),
        ...getEyeProblems(design),
        ...getLogoLevelProblems(design, encoding),
    ];
}

/**
 * Returns the problems of the colors: the contrast of every ink to the background, light on dark, transparency.
 * @param {Design} design - the design.
 * @returns {Array<DesignProblem>} the problems.
 */
function getColorProblems(design) {
    const problems = [];
    const background = design.background === 'transparent' ? WHITE : design.background;
    const inks = [['color', design.color]];
    if (design.gradient !== 'none' && design.color2) inks.push(['color2', design.color2]);
    if (design['eye-color']) inks.push(['eye-color', design['eye-color']]);
    for (const [key, color] of inks) {
        const ratio = getContrast(color, background);
        if (ratio < CONTRAST_ERROR) problems.push({ kind: 'error', key, msg: `Contrast ${ratio.toFixed(1)}:1 between ${color} and the background is too low - scanners need at least 3:1, better 4.5:1 or more` });
        else if (ratio < CONTRAST_WARNING) problems.push({ kind: 'warn', key, msg: `Contrast ${ratio.toFixed(1)}:1 between ${color} and the background is low - 4.5:1 or more scans reliably, also in poor light` });
    }
    if (design.background !== 'transparent' && getLuminance(design.color) > getLuminance(background)) problems.push({ kind: 'warn', key: 'background', msg: 'Light code on a dark background: many scanners read it, but some older ones do not - dark on light is safest' });
    if (design.background === 'transparent') problems.push({ kind: 'info', key: 'background', msg: 'Transparent background: print the code only on a plain, light surface' });
    return problems;
}

/**
 * Returns the problem of a quiet zone narrower than the 4 modules of the standard.
 * @param {Design} design - the design.
 * @returns {Array<DesignProblem>} the problem, or none.
 */
function getQuietZoneProblems(design) {
    const margin = +design.margin;
    if (margin < MIN_QUIET_ZONE) return [{ kind: 'error', key: 'margin', msg: `A quiet zone of ${margin} ${margin === 1 ? 'module' : 'modules'} is too small - the standard asks for 4, with less than 2 many scanners fail` }];
    if (margin < STANDARD_QUIET_ZONE) return [{ kind: 'warn', key: 'margin', msg: `The quiet zone has ${margin} modules - the standard asks for 4 (a light frame of 4 modules around the code)` }];
    return [];
}

/**
 * Returns the problem of a logo that hides much of what the error correction can repair.
 * @param {?Layout} layout - the layout.
 * @param {?Encoding} encoding - the code.
 * @returns {Array<DesignProblem>} the problem, or none.
 */
function getLogoCoverProblems(layout, encoding) {
    if (!layout || !layout.cover) return [];
    const repairable = RECOVERY[encoding.ecc];
    const percent = Math.round(layout.cover * PERCENT), repairablePercent = Math.round(repairable * PERCENT);
    if (layout.cover > repairable * LOGO_ERROR_SHARE) return [{ kind: 'error', key: 'logo-size', msg: `The logo hides about ${percent} % of the code, error correction ${encoding.ecc} repairs at most ${repairablePercent} % - make the logo smaller or choose error correction H` }];
    if (layout.cover > repairable * LOGO_WARNING_SHARE) return [{ kind: 'warn', key: 'logo-size', msg: `The logo hides about ${percent} % of the code, error correction ${encoding.ecc} repairs at most ${repairablePercent} % - little room is left for dirt and damage; H is safer` }];
    return [];
}

/**
 * Returns the note on round eyes, which some scanners do not find.
 * @param {Design} design - the design.
 * @returns {Array<DesignProblem>} the note, or none.
 */
function getEyeProblems(design) {
    if (design['eye-frame'] !== 'circle' && design['eye-frame'] !== 'leaf') return [];
    return [{ kind: 'info', key: 'eye-frame', msg: 'Round eyes are read by phone cameras, but some scanner apps and devices only find square ones - for codes many people scan, square or rounded eyes are safer' }];
}

/**
 * Returns the problem of a logo with a low error correction (L or M).
 * @param {Design} design - the design.
 * @param {?Encoding} encoding - the code.
 * @returns {Array<DesignProblem>} the problem, or none.
 */
function getLogoLevelProblems(design, encoding) {
    if (design.logo === 'none' || !encoding || (encoding.ecc !== 'L' && encoding.ecc !== 'M')) return [];
    return [{ kind: 'warn', key: 'ecc', msg: `A logo takes away part of the code: error correction Q or H keeps it readable (now ${encoding.ecc})` }];
}

/**
 * Reads back a drawn code: one large, one small and one blurred with less contrast. Only "good"
 * means a code reads well also in poor conditions.
 * @param {Layout} layout - the layout.
 * @param {string} content - the content the code must give back.
 * @returns {Promise<ScanResult>} how well the code reads.
 */
export async function checkScan(layout, content) {
    const images = await importImages(layout);
    const largeScale = Math.max(LARGE_SCALE.min, Math.min(LARGE_SCALE.max, Math.floor(SCAN_PIXELS / (layout.w || layout.code.n))));
    const expected = String(content);
    /**
     * Tells whether a code is found and gives back the content.
     * @param {?ReadCode} code - the code read, or null.
     * @returns {boolean} true when it holds exactly the content.
     */
    const isExpected = code => !!code && code.text === expected;
    const normal = await readDrawnCode(layout, images, largeScale, false);
    if (!normal) return { level: 'fail', results: { normal: false, small: false, harsh: false } };
    if (!isExpected(normal)) return { level: 'fail', wrong: true, text: normal.text, results: { normal: false, small: false, harsh: false } };
    const small = isExpected(await readDrawnCode(layout, images, SMALL_SCALE, false));
    const harsh = isExpected(await readDrawnCode(layout, images, Math.max(HARSH_SCALE.min, Math.min(HARSH_SCALE.max, largeScale)), true));
    return { level: small && harsh ? 'good' : 'fair', results: { normal: true, small, harsh } };
}

/**
 * Draws the code at a number of pixels per module on white, optionally blurred and with less contrast, and reads it.
 * @param {Layout} layout - the layout.
 * @param {Map<string, HTMLImageElement>} images - the loaded pictures of the layout.
 * @param {number} pixelsPerModule - the size of a module in pixels.
 * @param {boolean} isHarsh - whether the code is blurred and hazed.
 * @returns {Promise<?ReadCode>} the code read, null when none is found.
 */
async function readDrawnCode(layout, images, pixelsPerModule, isHarsh) {
    const margin = SCAN_MARGIN * pixelsPerModule;
    const width = Math.ceil(layout.w * pixelsPerModule) + 2 * margin, height = Math.ceil(layout.h * pixelsPerModule) + 2 * margin;
    const context = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
    context.fillStyle = WHITE;
    context.fillRect(0, 0, width, height);
    if (isHarsh) context.filter = `blur(${(pixelsPerModule * HARSH_BLUR).toFixed(2)}px)`;
    drawCanvas(context, layout, pixelsPerModule, images, { x: margin, y: margin });
    context.filter = 'none';
    if (isHarsh) {
        context.globalAlpha = HARSH_HAZE.alpha;
        context.fillStyle = HARSH_HAZE.color;
        context.fillRect(0, 0, width, height);
        context.globalAlpha = 1;
    }
    return readPixels(context.getImageData(0, 0, width, height));
}
