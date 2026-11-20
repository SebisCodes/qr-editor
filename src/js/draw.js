/**
 * Drawing a layout (render.js createLayout): as SVG text (renderSvg) and on a
 * canvas (drawCanvas), with the pictures of a layout loaded first
 * (importImages). Gradients run across the code (getGradientLine).
 */

import { FONT } from './render.js?v=4';
import { formatNumber, formatPathData } from './shapes.js?v=2';

const SVG_SCALE = 10;                   // the default SVG size in pixels per module
const GRADIENT_ID_PREFIX = 'g';
const RADIAL_REACH = 0.72;              // the radius of a radial gradient, as share of the code's width
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * A point in pixels.
 * @typedef {Object} Point
 * @property {number} x - the horizontal position.
 * @property {number} y - the vertical position.
 */

/**
 * What renderSvg() writes besides the shapes.
 * @typedef {Object} SvgOptions
 * @property {string} [width] - the width as SVG length (e.g. "400" or "46mm"); 10 per module when left out.
 * @property {string} [height] - the height as SVG length; 10 per module when left out.
 * @property {string} [title] - the title of the image.
 */

/**
 * Writes a layout as an SVG document.
 * @param {Layout} layout - the layout.
 * @param {SvgOptions} [options] - size and title.
 * @returns {string} the SVG text, ending with a line break.
 */
export function renderSvg(layout, options = {}) {
    const gradientItems = layout.items.filter(item => item.t === 'path' && typeof item.fill !== 'string');
    const gradientIds = new Map(gradientItems.map((item, i) => [item, GRADIENT_ID_PREFIX + (i + 1)]));
    const gradients = gradientItems.map(item => renderSvgGradient(item.fill, gradientIds.get(item)));
    const body = layout.items.map(item => renderSvgItem(item, gradientIds)).join('\n');
    const width = options.width ?? formatNumber(layout.w * SVG_SCALE), height = options.height ?? formatNumber(layout.h * SVG_SCALE);
    const title = options.title ? `<title>${escapeXml(options.title)}</title>\n` : '';
    const defs = gradients.length ? `<defs>${gradients.join('')}</defs>\n` : '';
    return `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 ${formatNumber(layout.w)} ${formatNumber(layout.h)}" width="${width}" height="${height}" shape-rendering="geometricPrecision">\n${title}${defs}${body}\n</svg>\n`;
}

/**
 * Writes one shape of a layout as SVG element.
 * @param {LayoutItem} item - the shape.
 * @param {Map<LayoutItem, string>} gradientIds - the id of the gradient of every path with a gradient.
 * @returns {string} the element, '' for an unknown shape.
 */
function renderSvgItem(item, gradientIds) {
    if (item.t === 'path') {
        const paint = typeof item.fill === 'string' ? item.fill : `url(#${gradientIds.get(item)})`;
        return `<path d="${formatPathData(item.d)}" fill="${paint}"${item.rule ? ` fill-rule="${item.rule}"` : ''}/>`;
    }
    if (item.t === 'stroke') return `<path d="${formatPathData(item.d)}" fill="none" stroke="${item.color}" stroke-width="${formatNumber(item.width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (item.t === 'image') return `<image x="${formatNumber(item.x)}" y="${formatNumber(item.y)}" width="${formatNumber(item.w)}" height="${formatNumber(item.h)}" href="${escapeXml(item.href.replace(/\s+/g, ''))}" preserveAspectRatio="xMidYMid meet"/>`;
    if (item.t === 'text') return `<text x="${formatNumber(item.x)}" y="${formatNumber(item.y)}" font-family='${FONT}' font-size="${formatNumber(item.size)}" font-weight="${item.weight}" fill="${item.fill}" text-anchor="middle" dominant-baseline="central">${escapeXml(item.text)}</text>`;
    return '';
}

/**
 * Writes a gradient as SVG element.
 * @param {GradientFill} fill - the gradient.
 * @param {string} id - its id.
 * @returns {string} the radialGradient or linearGradient element.
 */
function renderSvgGradient(fill, id) {
    const stops = `<stop offset="0" stop-color="${fill.c1}"/><stop offset="1" stop-color="${fill.c2}"/>`;
    if (fill.type === 'radial') {
        return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${formatNumber(fill.x + fill.w / 2)}" cy="${formatNumber(fill.y + fill.h / 2)}" r="${formatNumber(fill.w * RADIAL_REACH)}">${stops}</radialGradient>`;
    }
    const line = getGradientLine(fill);
    return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${formatNumber(line.x1)}" y1="${formatNumber(line.y1)}" x2="${formatNumber(line.x2)}" y2="${formatNumber(line.y2)}">${stops}</linearGradient>`;
}

/**
 * Escapes a text for an XML attribute or element.
 * @param {string} text - the text.
 * @returns {string} the text with & < > and " as entities.
 */
function escapeXml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Returns the line of a linear gradient across the code at its angle (0 = left to right, 90 = top to bottom),
 * long enough to reach the corners.
 * @param {GradientFill} fill - the gradient.
 * @returns {{x1: number, y1: number, x2: number, y2: number}} start and end of the line.
 */
export function getGradientLine(fill) {
    const angle = (fill.angle || 0) * Math.PI / 180, cx = fill.x + fill.w / 2, cy = fill.y + fill.h / 2;
    const reach = (Math.abs(Math.cos(angle)) * fill.w + Math.abs(Math.sin(angle)) * fill.h) / 2;
    return { x1: cx - Math.cos(angle) * reach, y1: cy - Math.sin(angle) * reach, x2: cx + Math.cos(angle) * reach, y2: cy + Math.sin(angle) * reach };
}

/**
 * Draws a layout on a canvas.
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context - the canvas context.
 * @param {Layout} layout - the layout.
 * @param {number} scale - pixels per module.
 * @param {Map<string, (HTMLImageElement|ImageBitmap)>} [images] - the loaded pictures by address (importImages).
 * @param {Point} [offset] - where the layout starts, in pixels.
 * @returns {void}
 */
export function drawCanvas(context, layout, scale, images = new Map(), offset = { x: 0, y: 0 }) {
    context.save();
    context.translate(offset.x, offset.y);
    context.scale(scale, scale);
    for (const item of layout.items) drawCanvasItem(context, item, images);
    context.restore();
}

/**
 * Draws one shape of a layout on a canvas.
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context - the canvas context.
 * @param {LayoutItem} item - the shape.
 * @param {Map<string, (HTMLImageElement|ImageBitmap)>} images - the loaded pictures by address.
 * @returns {void}
 */
function drawCanvasItem(context, item, images) {
    if (item.t === 'path') {
        context.fillStyle = createCanvasPaint(context, item.fill);
        context.fill(new Path2D(formatPathData(item.d)), item.rule || 'nonzero');
    } else if (item.t === 'stroke') {
        context.strokeStyle = item.color;
        context.lineWidth = item.width;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.stroke(new Path2D(formatPathData(item.d)));
    } else if (item.t === 'image') drawCanvasPicture(context, item, images.get(item.href));
    else if (item.t === 'text') {
        context.fillStyle = item.fill;
        context.font = `${item.weight} ${item.size}px ${FONT}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(item.text, item.x, item.y);
    }
}

/**
 * Draws a picture centered in its box, keeping its proportions; a picture that did not load is left out.
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context - the canvas context.
 * @param {LayoutItem} item - the image item.
 * @param {HTMLImageElement|ImageBitmap|undefined} picture - the loaded picture.
 * @returns {void}
 */
function drawCanvasPicture(context, item, picture) {
    if (!picture || !(picture.naturalWidth || picture.width)) return;
    const pictureWidth = picture.naturalWidth || picture.width, pictureHeight = picture.naturalHeight || picture.height;
    const scale = Math.min(item.w / pictureWidth, item.h / pictureHeight);
    context.drawImage(picture, item.x + (item.w - pictureWidth * scale) / 2, item.y + (item.h - pictureHeight * scale) / 2, pictureWidth * scale, pictureHeight * scale);
}

/**
 * Returns the canvas paint of a color or gradient.
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} context - the canvas context.
 * @param {string|GradientFill} fill - the color or gradient.
 * @returns {string|CanvasGradient} the paint.
 */
function createCanvasPaint(context, fill) {
    if (typeof fill === 'string') return fill;
    let gradient;
    if (fill.type === 'radial') gradient = context.createRadialGradient(fill.x + fill.w / 2, fill.y + fill.h / 2, 0, fill.x + fill.w / 2, fill.y + fill.h / 2, fill.w * RADIAL_REACH);
    else {
        const line = getGradientLine(fill);
        gradient = context.createLinearGradient(line.x1, line.y1, line.x2, line.y2);
    }
    gradient.addColorStop(0, fill.c1);
    gradient.addColorStop(1, fill.c2);
    return gradient;
}

/**
 * Loads the pictures a layout uses; a picture that does not load is left out.
 * @param {Layout} layout - the layout.
 * @returns {Promise<Map<string, HTMLImageElement>>} the decoded pictures by address.
 */
export async function importImages(layout) {
    const pictures = new Map();
    for (const item of layout.items) {
        if (item.t !== 'image' || pictures.has(item.href)) continue;
        const picture = new Image();
        picture.decoding = 'async';
        picture.src = item.href.replace(/\s+/g, '');
        try { await picture.decode(); pictures.set(item.href, picture); } catch (error) { /* a broken picture is left out */ }
    }
    return pictures;
}
