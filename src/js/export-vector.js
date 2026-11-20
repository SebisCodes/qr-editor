/**
 * What the PDF and EPS writers (export-pdf.js, export-eps.js) share: colors
 * as RGB fractions, paths and gradients in the PostScript imaging model that
 * both formats use, and texts or pictures as pixels for what a format cannot
 * hold otherwise.
 */

import { getGradientLine } from './draw.js?v=3';
import { FONT } from './render.js?v=4';
import { formatNumber } from './shapes.js?v=2';

/** Points per millimetre. */
export const POINTS_PER_MM = 72 / 25.4;

/** Millimetres per inch, for the resolution of pictures. */
export const MM_PER_INCH = 25.4;

/** The shift from the middle of a caption line to its baseline, as share of the font size. */
export const BASELINE_SHIFT = 0.36;

const RADIAL_REACH = 0.72;              // the radius of a radial gradient, as share of the code's width
const DEFAULT_COLOR = '#000';
const BOX_TOP = 0.75;                   // the box of a caption picture reaches this share of the font size above its middle
const BOX_HEIGHT = 1.5;

/**
 * A text or picture as pixels.
 * @typedef {Object} PixelPicture
 * @property {number} w - the width in pixels.
 * @property {number} h - the height in pixels.
 * @property {Uint8Array} color - red, green and blue of every pixel.
 * @property {?Uint8Array} alpha - the opacity of every pixel, null when all are opaque.
 */

/**
 * Returns red, green and blue of a color as fractions.
 * @param {string} hex - the color #rgb or #rrggbb (black when empty).
 * @returns {Array<number>} red, green and blue, 0 to 1.
 */
export function getRgb(hex) {
    let digits = String(hex || DEFAULT_COLOR).replace('#', '');
    if (digits.length === 3) digits = [...digits].map(digit => digit + digit).join('');
    const value = parseInt(digits, 16);
    return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255];
}

/**
 * Writes a color as three fractions, as the rg / setrgbcolor operators take it.
 * @param {string} hex - the color.
 * @returns {string} e.g. "0.114 0.169 0.325".
 */
export function formatRgb(hex) {
    return getRgb(hex).map(formatNumber).join(' ');
}

/**
 * Writes a path with the operators of a format.
 * @param {Path} path - the path.
 * @param {Object<string, string>} operators - the operators of move, line and curve by letter (M, L, C), and Z for close.
 * @returns {string} one command per line.
 */
export function formatPostScriptPath(path, operators) {
    return path.map(command => (command[0] === 'M' || command[0] === 'L' || command[0] === 'C'
        ? `${command.slice(1).map(formatNumber).join(' ')} ${operators[command[0]]}`
        : operators.Z)).join('\n');
}

/**
 * Writes a gradient as shading dictionary (type 2 axial or type 3 radial), as PDF and PostScript level 3 read it.
 * @param {GradientFill} fill - the gradient.
 * @returns {string} the dictionary "<< /ShadingType … >>".
 */
export function renderShading(fill) {
    let type, coordinates;
    if (fill.type === 'radial') {
        type = 3;
        coordinates = [fill.x + fill.w / 2, fill.y + fill.h / 2, 0, fill.x + fill.w / 2, fill.y + fill.h / 2, fill.w * RADIAL_REACH];
    } else {
        type = 2;
        const line = getGradientLine(fill);
        coordinates = [line.x1, line.y1, line.x2, line.y2];
    }
    return `<< /ShadingType ${type} /ColorSpace /DeviceRGB /Coords [${coordinates.map(formatNumber).join(' ')}] /Function << /FunctionType 2 /Domain [0 1] /C0 [${formatRgb(fill.c1)}] /C1 [${formatRgb(fill.c2)}] /N 1 >> /Extend [true true] >>`;
}

/**
 * Returns the box of a caption line as a picture item, a little larger than its text.
 * @param {LayoutItem} item - the text item.
 * @param {function(string, number): number} measureText - the width of a text at a font size.
 * @returns {LayoutItem} the text item with the box x, y, w, h and its middle cx, cy.
 */
export function getCaptionBox(item, measureText) {
    const boxWidth = measureText(item.text, item.size) + item.size;
    return { t: 'text', ...item, x: item.x - boxWidth / 2, y: item.y - item.size * BOX_TOP, w: boxWidth, h: item.size * BOX_HEIGHT, cx: item.x, cy: item.y };
}

/**
 * Draws a text or picture item into pixels.
 * @param {LayoutItem} item - an image item, or a text item with its box (getCaptionBox).
 * @param {Map<string, HTMLImageElement>} images - the loaded pictures by address.
 * @param {number} pixelsPerUnit - pixels per module.
 * @returns {Promise<?PixelPicture>} the pixels, null for a picture that did not load.
 */
export async function createPixelPicture(item, images, pixelsPerUnit) {
    const width = Math.max(1, Math.round(item.w * pixelsPerUnit)), height = Math.max(1, Math.round(item.h * pixelsPerUnit));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (item.t === 'image') {
        const picture = images.get(item.href);
        if (!picture) return null;
        drawFittedPicture(context, picture, width, height);
    } else drawCenteredText(context, item, pixelsPerUnit, width, height);
    return getPixelChannels(context.getImageData(0, 0, width, height).data, width, height);
}

/**
 * Draws a picture centered on a canvas, as large as fits with its proportions.
 * @param {CanvasRenderingContext2D} context - the canvas context.
 * @param {HTMLImageElement} picture - the picture.
 * @param {number} width - the canvas width.
 * @param {number} height - the canvas height.
 * @returns {void}
 */
function drawFittedPicture(context, picture, width, height) {
    const pictureWidth = picture.naturalWidth || picture.width, pictureHeight = picture.naturalHeight || picture.height;
    const scale = Math.min(width / pictureWidth, height / pictureHeight);
    context.drawImage(picture, (width - pictureWidth * scale) / 2, (height - pictureHeight * scale) / 2, pictureWidth * scale, pictureHeight * scale);
}

/**
 * Draws a caption line centered on a canvas.
 * @param {CanvasRenderingContext2D} context - the canvas context.
 * @param {LayoutItem} item - the text item.
 * @param {number} pixelsPerUnit - pixels per module.
 * @param {number} width - the canvas width.
 * @param {number} height - the canvas height.
 * @returns {void}
 */
function drawCenteredText(context, item, pixelsPerUnit, width, height) {
    context.fillStyle = item.fill;
    context.font = `${item.weight} ${item.size * pixelsPerUnit}px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(item.text, width / 2, height / 2);
}

/**
 * Splits RGBA pixels into color and opacity.
 * @param {Uint8ClampedArray} data - the RGBA pixels.
 * @param {number} width - the width in pixels.
 * @param {number} height - the height in pixels.
 * @returns {PixelPicture} the pixels; alpha is null when every pixel is opaque.
 */
function getPixelChannels(data, width, height) {
    const color = new Uint8Array(width * height * 3), alpha = new Uint8Array(width * height);
    let isOpaque = true;
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        color[j * 3] = data[i]; color[j * 3 + 1] = data[i + 1]; color[j * 3 + 2] = data[i + 2];
        alpha[j] = data[i + 3];
        if (data[i + 3] !== 255) isOpaque = false;
    }
    return { w: width, h: height, color, alpha: isOpaque ? null : alpha };
}
