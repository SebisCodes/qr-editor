/**
 * Writing a layout (render.js createLayout) as EPS (PostScript level 3):
 * paths as vectors, gradients as shadings, the caption in Helvetica Bold with
 * the ISO Latin-1 encoding when its letters exist there (otherwise as a
 * picture), a picture logo as an image laid over the background color, since
 * EPS has no transparency here.
 *
 * convertToEps() runs these steps:
 *   1. the header comments with the bounding box, and the scale to the page;
 *   2. every shape of the layout in turn;
 *   3. the end of the page.
 */

import { importImages } from './draw.js?v=3';
import {
    BASELINE_SHIFT, MM_PER_INCH, POINTS_PER_MM, createPixelPicture, formatPostScriptPath, formatRgb, getCaptionBox, getRgb, renderShading,
} from './export-vector.js?v=3';
import { formatNumber } from './shapes.js?v=2';

const EPS_TYPE = 'application/postscript';
const DEFAULT_TITLE = 'QR code';
const DEFAULT_BACKGROUND = '#ffffff';
const PATH_OPERATORS = { M: 'moveto', L: 'lineto', C: 'curveto', Z: 'closepath' };
const PICTURE_DPI = 300;
const MAX_PICTURE_PIXELS = 1024;
const HEX_PIXELS_PER_LINE = 32;
const LATIN1_FONT = '/Helvetica-Bold findfont dup length dict begin { 1 index /FID ne { def } { pop pop } ifelse } forall /Encoding ISOLatin1Encoding def currentdict end';
const PRINTABLE_FIRST = 0x20;
const LATIN1_LAST = 0xff;
const ASCII_END = 0x7f;

/**
 * The EPS file while it is written.
 * @typedef {Object} EpsPage
 * @property {Array<string>} lines - the lines of the file so far.
 * @property {Layout} layout - the layout.
 * @property {number} sizeMm - the width in millimetres.
 * @property {function(string, number): number} measureText - the width of a text at a font size.
 * @property {Map<string, HTMLImageElement>} images - the loaded pictures of the layout.
 * @property {string} background - the color pictures are laid over: the first shape's color, or white.
 */

/**
 * Writes a layout as an EPS file.
 * @param {Layout} layout - the layout.
 * @param {number} sizeMm - the width in millimetres.
 * @param {function(string, number): number} measureText - the width of a text at a font size.
 * @param {string} [title] - the title in the header (non-ASCII letters become "?").
 * @returns {Promise<Blob>} the EPS file.
 */
export async function convertToEps(layout, sizeMm, measureText, title = DEFAULT_TITLE) {
    const images = await importImages(layout);
    const background = layout.items.length && typeof layout.items[0].fill === 'string' ? layout.items[0].fill : DEFAULT_BACKGROUND;
    const page = { lines: getEpsHeader(layout, sizeMm, title), layout, sizeMm, measureText, images, background };
    for (const item of layout.items) await addEpsItem(page, item);
    page.lines.push('grestore', 'showpage', '%%EOF', '');
    return new Blob([page.lines.join('\n')], { type: EPS_TYPE });
}

/**
 * Returns the header of the file and the transformation from module units to points (y downward).
 * @param {Layout} layout - the layout.
 * @param {number} sizeMm - the width in millimetres.
 * @param {string} title - the title.
 * @returns {Array<string>} the lines.
 */
function getEpsHeader(layout, sizeMm, title) {
    const scale = sizeMm * POINTS_PER_MM / layout.w, width = layout.w * scale, height = layout.h * scale;
    return ['%!PS-Adobe-3.0 EPSF-3.0', `%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}`, `%%HiResBoundingBox: 0 0 ${formatNumber(width)} ${formatNumber(height)}`,
        `%%Title: ${title.replace(/[^\x20-\x7e]/g, '?')}`, '%%Creator: QR Editor (qr.giit.ch)', '%%LanguageLevel: 3', '%%EndComments', 'gsave',
        `0 ${formatNumber(height)} translate ${formatNumber(scale)} ${formatNumber(-scale)} scale`];
}

/**
 * Adds the drawing of one shape.
 * @param {EpsPage} page - the file.
 * @param {LayoutItem} item - the shape.
 * @returns {Promise<void>} resolves when the shape is added.
 */
async function addEpsItem(page, item) {
    if (item.t === 'path') addEpsPath(page, item);
    else if (item.t === 'stroke') {
        page.lines.push(`${formatRgb(item.color)} setrgbcolor ${formatNumber(item.width)} setlinewidth 1 setlinecap 1 setlinejoin`, 'newpath', formatPostScriptPath(item.d, PATH_OPERATORS), 'stroke');
    } else if (item.t === 'image') {
        const pixels = Math.min(MAX_PICTURE_PIXELS, Math.ceil(PICTURE_DPI / MM_PER_INCH * page.sizeMm * item.w / page.layout.w));
        addEpsPicture(page, await createPixelPicture(item, page.images, pixels / item.w), item);
    } else if (item.t === 'text') await addEpsText(page, item);
}

/**
 * Adds a filled path: in its color, or clipped to it with a shading for a gradient.
 * @param {EpsPage} page - the file.
 * @param {LayoutItem} item - the path item.
 * @returns {void}
 */
function addEpsPath(page, item) {
    const isEvenOdd = item.rule === 'evenodd';
    const path = formatPostScriptPath(item.d, PATH_OPERATORS);
    if (typeof item.fill === 'string') page.lines.push(`${formatRgb(item.fill)} setrgbcolor`, 'newpath', path, isEvenOdd ? 'eofill' : 'fill');
    else page.lines.push('gsave newpath', path, isEvenOdd ? 'eoclip' : 'clip', 'newpath', `${renderShading(item.fill)} shfill`, 'grestore');
}

/**
 * Adds a caption line: as text in Helvetica Bold (ISO Latin-1) when all its letters exist there, otherwise as picture.
 * @param {EpsPage} page - the file.
 * @param {LayoutItem} item - the text item.
 * @returns {Promise<void>} resolves when the line is added.
 */
async function addEpsText(page, item) {
    if (isLatin1(item.text)) {
        page.lines.push(LATIN1_FONT, '/QRCaption exch definefont pop', `/QRCaption findfont [${formatNumber(item.size)} 0 0 ${formatNumber(-item.size)} 0 0] makefont setfont`,
            `${formatRgb(item.fill)} setrgbcolor ${formatNumber(item.x)} ${formatNumber(item.y + item.size * BASELINE_SHIFT)} moveto ${formatPostScriptString(item.text)} dup stringwidth pop 2 div neg 0 rmoveto show`);
        return;
    }
    const box = getCaptionBox(item, page.measureText);
    addEpsPicture(page, await createPixelPicture(box, page.images, Math.ceil(PICTURE_DPI / MM_PER_INCH * page.sizeMm / page.layout.w)), box);
}

/**
 * Tells whether every letter of a text is printable ISO Latin-1.
 * @param {string} text - the text.
 * @returns {boolean} true when the text can be shown with ISOLatin1Encoding.
 */
function isLatin1(text) {
    for (const character of text) if (character.codePointAt(0) > LATIN1_LAST || character.codePointAt(0) < PRINTABLE_FIRST) return false;
    return true;
}

/**
 * Writes a text as PostScript string: ( ) and \ escaped, letters above ASCII as octal escapes.
 * @param {string} text - a Latin-1 text.
 * @returns {string} the string with its parentheses.
 */
function formatPostScriptString(text) {
    return '(' + [...text].map(character => {
        const code = character.charCodeAt(0);
        if (character === '(' || character === ')' || character === '\\') return '\\' + character;
        return code < ASCII_END ? character : '\\' + code.toString(8).padStart(3, '0');
    }).join('') + ')';
}

/**
 * Adds a picture laid over the background color, as hex image data.
 * @param {EpsPage} page - the file.
 * @param {?PixelPicture} picture - the pixels; nothing is added for null.
 * @param {LayoutItem} box - where the picture goes: x, y, w and h of the image item or the caption box, in module units.
 * @returns {void}
 */
function addEpsPicture(page, picture, box) {
    if (!picture) return;
    const hexPixels = getOpaqueHexPixels(picture, page.background);
    page.lines.push(`gsave ${formatNumber(box.x)} ${formatNumber(box.y)} translate ${formatNumber(box.w)} ${formatNumber(box.h)} scale`, `/pic ${picture.w * 3} string def`,
        `${picture.w} ${picture.h} 8 [${picture.w} 0 0 ${picture.h} 0 0] { currentfile pic readhexstring pop } false 3 colorimage`);
    for (let i = 0; i < hexPixels.length; i += HEX_PIXELS_PER_LINE) page.lines.push(hexPixels.slice(i, i + HEX_PIXELS_PER_LINE).join(''));
    page.lines.push('grestore');
}

/**
 * Returns every pixel of a picture blended over a background color, as six hex digits.
 * @param {PixelPicture} picture - the pixels.
 * @param {string} background - the background color.
 * @returns {Array<string>} one "rrggbb" per pixel.
 */
function getOpaqueHexPixels(picture, background) {
    const [red, green, blue] = getRgb(background).map(value => value * 255);
    const hexPixels = [];
    for (let i = 0; i < picture.w * picture.h; i++) {
        const opacity = picture.alpha ? picture.alpha[i] / 255 : 1;
        const pixel = [picture.color[i * 3] * opacity + red * (1 - opacity), picture.color[i * 3 + 1] * opacity + green * (1 - opacity), picture.color[i * 3 + 2] * opacity + blue * (1 - opacity)];
        hexPixels.push(pixel.map(value => Math.round(value).toString(16).padStart(2, '0')).join(''));
    }
    return hexPixels;
}
