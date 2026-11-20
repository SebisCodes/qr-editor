/**
 * Writing layouts (render.js createLayout) as a PDF 1.4 file, one page per
 * layout: paths as vectors, gradients as shadings, the caption in Helvetica
 * Bold when its letters exist in Windows-1252 (otherwise as a picture), a
 * picture logo as an image. Objects are numbered from 1 in the order they are
 * added; 1 is the catalog, 2 the page tree, 3 the font.
 *
 * convertToPdf() runs these steps:
 *   1. add the font;
 *   2. per layout: the drawing operations, the shadings and images they use,
 *      the content stream and the page;
 *   3. fill in catalog and page tree, add the document information;
 *   4. write the objects with their cross-reference table.
 */

import { importImages } from './draw.js?v=3';
import {
    BASELINE_SHIFT, MM_PER_INCH, POINTS_PER_MM, createPixelPicture, formatPostScriptPath, formatRgb, getCaptionBox, renderShading,
} from './export-vector.js?v=3';
import { formatNumber } from './shapes.js?v=2';

const encoder = new TextEncoder();
const PDF_TYPE = 'application/pdf';
const PDF_HEADER = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
const CATALOG_NUMBER = 1;
const PAGES_NUMBER = 2;
const FONT_NUMBER = 3;
const FONT_DICTIONARY = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
const INFO_DICTIONARY = '<< /Producer (QR Editor, qr.giit.ch) /Creator (QR Editor, qr.giit.ch) >>';
const PATH_OPERATORS = { M: 'm', L: 'l', C: 'c', Z: 'h' };
const PICTURE_DPI = 600;
const MAX_PICTURE_PIXELS = 2048;
const MEASURE_FONT = 'Helvetica, Arial';
const XREF_OFFSET_DIGITS = 10;
/** The letters of Windows-1252 outside Latin-1, by Unicode code point. */
const CP1252_EXTRA = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
const STRING_ESCAPES = [0x28, 0x29, 0x5c];   // ( ) and \ get a backslash in a PDF string
const ASCII_END = 0x7f;

/**
 * One page while it is written.
 * @typedef {Object} PdfPage
 * @property {Array<?Uint8Array>} objects - the objects of the file so far (object n at index n - 1).
 * @property {Layout} layout - the layout of the page.
 * @property {number} sizeMm - the width of the page in millimetres.
 * @property {function(string, number, string=): number} measureText - the width of a text at a font size.
 * @property {Map<string, HTMLImageElement>} images - the loaded pictures of the layout.
 * @property {Array<string>} operations - the drawing operations of the page.
 * @property {Array<number>} shadings - the object numbers of the shadings the page uses.
 * @property {Array<number>} pictures - the object numbers of the images the page uses.
 */

/**
 * Writes one or more layouts as a PDF file.
 * @param {Layout} layout - the layout, used when pages is null.
 * @param {number} sizeMm - the width of each page in millimetres.
 * @param {function(string, number, string=): number} measureText - the width of a text at a font size (and font).
 * @param {?Array<Layout>} [pages] - several layouts, one page each.
 * @returns {Promise<Blob>} the PDF file.
 */
export async function convertToPdf(layout, sizeMm, measureText, pages = null) {
    const objects = [null, null, encoder.encode(FONT_DICTIONARY)];
    const pageNumbers = [];
    for (const pageLayout of pages || [layout]) await addPdfPage(objects, pageNumbers, pageLayout, sizeMm, measureText);
    objects[CATALOG_NUMBER - 1] = encoder.encode(`<< /Type /Catalog /Pages ${PAGES_NUMBER} 0 R >>`);
    objects[PAGES_NUMBER - 1] = encoder.encode(`<< /Type /Pages /Kids [${pageNumbers.map(number => number + ' 0 R').join(' ')}] /Count ${pageNumbers.length} >>`);
    const infoNumber = getNextObjectNumber(objects);
    objects.push(encoder.encode(INFO_DICTIONARY));
    return new Blob(createPdfFileParts(objects, infoNumber), { type: PDF_TYPE });
}

/**
 * Returns the number the next object of the file gets.
 * @param {Array<?Uint8Array>} objects - the objects so far.
 * @returns {number} the object number.
 */
function getNextObjectNumber(objects) {
    return objects.length + 1;
}

/**
 * Adds the objects of one page: its shadings and images, its content stream and the page itself.
 * @param {Array<?Uint8Array>} objects - the objects of the file, added to.
 * @param {Array<number>} pageNumbers - the object numbers of the pages, added to.
 * @param {Layout} layout - the layout of the page.
 * @param {number} sizeMm - the width of the page in millimetres.
 * @param {function(string, number, string=): number} measureText - the width of a text at a font size.
 * @returns {Promise<void>} resolves when the page is added.
 */
async function addPdfPage(objects, pageNumbers, layout, sizeMm, measureText) {
    const images = await importImages(layout);
    const scale = sizeMm * POINTS_PER_MM / layout.w, pageWidth = layout.w * scale, pageHeight = layout.h * scale;
    const operations = [`q ${formatNumber(scale)} 0 0 ${formatNumber(-scale)} 0 ${formatNumber(pageHeight)} cm`];
    const page = { objects, layout, sizeMm, measureText, images, operations, shadings: [], pictures: [] };
    for (const item of layout.items) await addPdfItem(page, item);
    operations.push('Q');
    const content = await createPdfStream(encoder.encode(operations.join('\n')));
    const contentNumber = getNextObjectNumber(objects);
    objects.push(joinBytes(encoder.encode('<< /Filter /FlateDecode /Length '), content));
    pageNumbers.push(getNextObjectNumber(objects));
    objects.push(encoder.encode(`<< /Type /Page /Parent ${PAGES_NUMBER} 0 R /MediaBox [0 0 ${formatNumber(pageWidth)} ${formatNumber(pageHeight)}] /Resources ${renderPdfResources(page)} /Contents ${contentNumber} 0 R >>`));
}

/**
 * Writes the resource dictionary of a page: the font, its shadings and its images.
 * @param {PdfPage} page - the page.
 * @returns {string} the dictionary.
 */
function renderPdfResources(page) {
    const shadings = page.shadings.length ? ` /Shading << ${page.shadings.map(number => `/Sh${number} ${number} 0 R`).join(' ')} >>` : '';
    const pictures = page.pictures.length ? ` /XObject << ${page.pictures.map(number => `/Im${number} ${number} 0 R`).join(' ')} >>` : '';
    return `<< /Font << /F1 ${FONT_NUMBER} 0 R >>${shadings}${pictures} >>`;
}

/**
 * Adds the drawing of one shape to a page.
 * @param {PdfPage} page - the page.
 * @param {LayoutItem} item - the shape.
 * @returns {Promise<void>} resolves when the shape is added.
 */
async function addPdfItem(page, item) {
    if (item.t === 'path') addPdfPath(page, item);
    else if (item.t === 'stroke') page.operations.push(`${formatRgb(item.color)} RG ${formatNumber(item.width)} w 1 J 1 j\n${formatPostScriptPath(item.d, PATH_OPERATORS)}\nS`);
    else if (item.t === 'image') {
        const pixels = Math.min(MAX_PICTURE_PIXELS, Math.ceil(PICTURE_DPI / MM_PER_INCH * page.sizeMm * item.w / page.layout.w));
        await addPdfPicture(page, await createPixelPicture(item, page.images, pixels / item.w), item);
    } else if (item.t === 'text') await addPdfText(page, item);
}

/**
 * Adds a filled path: in its color, or clipped to it with a shading for a gradient.
 * @param {PdfPage} page - the page.
 * @param {LayoutItem} item - the path item.
 * @returns {void}
 */
function addPdfPath(page, item) {
    const evenOdd = item.rule === 'evenodd' ? '*' : '';
    const path = formatPostScriptPath(item.d, PATH_OPERATORS);
    if (typeof item.fill === 'string') {
        page.operations.push(`${formatRgb(item.fill)} rg\n${path}\nf${evenOdd}`);
        return;
    }
    const shadingNumber = getNextObjectNumber(page.objects);
    page.objects.push(encoder.encode(renderShading(item.fill)));
    page.shadings.push(shadingNumber);
    page.operations.push(`q\n${path}\nW${evenOdd} n\n/Sh${shadingNumber} sh\nQ`);
}

/**
 * Adds a caption line: as text in Helvetica Bold when all its letters exist in Windows-1252, otherwise as picture.
 * @param {PdfPage} page - the page.
 * @param {LayoutItem} item - the text item.
 * @returns {Promise<void>} resolves when the line is added.
 */
async function addPdfText(page, item) {
    const bytes = getWinAnsiBytes(item.text);
    if (bytes) {
        const width = page.measureText(item.text, item.size, MEASURE_FONT);
        const position = `${formatNumber(item.x - width / 2)} ${formatNumber(item.y + item.size * BASELINE_SHIFT)}`;
        page.operations.push(`BT /F1 ${formatNumber(item.size)} Tf ${formatRgb(item.fill)} rg 1 0 0 -1 ${position} Tm ${formatPdfString(bytes)} Tj ET`);
        return;
    }
    const box = getCaptionBox(item, page.measureText);
    await addPdfPicture(page, await createPixelPicture(box, page.images, Math.ceil(PICTURE_DPI / MM_PER_INCH * page.sizeMm / page.layout.w)), box);
}

/**
 * Returns the Windows-1252 bytes of a text.
 * @param {string} text - the text.
 * @returns {?Array<number>} the bytes, null when a letter is missing there.
 */
function getWinAnsiBytes(text) {
    const bytes = [];
    for (const character of text) {
        const code = character.codePointAt(0);
        if (code >= 0x20 && code < 0x7f) bytes.push(code);
        else if (code >= 0xa0 && code <= 0xff) bytes.push(code);
        else if (CP1252_EXTRA[code]) bytes.push(CP1252_EXTRA[code]);
        else return null;
    }
    return bytes;
}

/**
 * Writes bytes as a PDF string: ( ) and \ escaped, bytes above ASCII as octal escapes.
 * @param {Array<number>} bytes - the bytes.
 * @returns {string} the string with its parentheses.
 */
function formatPdfString(bytes) {
    return '(' + bytes.map(byte => {
        if (STRING_ESCAPES.includes(byte)) return '\\' + String.fromCharCode(byte);
        return byte < ASCII_END ? String.fromCharCode(byte) : '\\' + byte.toString(8).padStart(3, '0');
    }).join('') + ')';
}

/**
 * Adds a picture as image object (with a soft mask for transparency) and draws it in its box.
 * @param {PdfPage} page - the page.
 * @param {?PixelPicture} picture - the pixels; nothing is added for null.
 * @param {LayoutItem} box - where the picture goes: x, y, w and h of the image item or the caption box, in module units.
 * @returns {Promise<void>} resolves when the picture is added.
 */
async function addPdfPicture(page, picture, box) {
    if (!picture) return;
    const { objects } = page;
    const imageHead = `<< /Type /XObject /Subtype /Image /Width ${picture.w} /Height ${picture.h}`;
    let maskNumber = 0;
    if (picture.alpha) {
        const mask = joinBytes(encoder.encode(`${imageHead} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length `), await createPdfStream(picture.alpha));
        maskNumber = getNextObjectNumber(objects);
        objects.push(mask);
    }
    const image = joinBytes(encoder.encode(`${imageHead} /ColorSpace /DeviceRGB /BitsPerComponent 8 ${maskNumber ? `/SMask ${maskNumber} 0 R ` : ''}/Filter /FlateDecode /Length `), await createPdfStream(picture.color));
    const imageNumber = getNextObjectNumber(objects);
    objects.push(image);
    page.pictures.push(imageNumber);
    page.operations.push(`q ${formatNumber(box.w)} 0 0 ${formatNumber(-box.h)} ${formatNumber(box.x)} ${formatNumber(box.y + box.h)} cm /Im${imageNumber} Do Q`);
}

/**
 * Returns the end of a stream object: "<length> >>", the stream keyword, the deflated bytes and "endstream".
 * @param {Uint8Array} bytes - the bytes of the stream.
 * @returns {Promise<Uint8Array>} the bytes that follow "/Length " in the object.
 */
async function createPdfStream(bytes) {
    const deflated = await compressBytes(bytes);
    return joinBytes(encoder.encode(`${deflated.length} >>\nstream\n`), deflated, encoder.encode('\nendstream'));
}

/**
 * Compresses bytes with deflate (zlib format, as /FlateDecode reads it).
 * @param {Uint8Array} bytes - the bytes.
 * @returns {Promise<Uint8Array>} the compressed bytes.
 */
async function compressBytes(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Joins byte arrays.
 * @param {...Uint8Array} arrays - the arrays in order.
 * @returns {Uint8Array} one array with all bytes.
 */
function joinBytes(...arrays) {
    const out = new Uint8Array(arrays.reduce((sum, array) => sum + array.length, 0));
    let offset = 0;
    for (const array of arrays) { out.set(array, offset); offset += array.length; }
    return out;
}

/**
 * Returns the parts of the PDF file: header, every object, the cross-reference table and the trailer.
 * @param {Array<Uint8Array>} objects - the objects (object n at index n - 1).
 * @param {number} infoNumber - the number of the document information.
 * @returns {Array<Uint8Array>} the parts in file order.
 */
function createPdfFileParts(objects, infoNumber) {
    const parts = [encoder.encode(PDF_HEADER)];
    const offsets = [];
    let offset = parts[0].length;
    for (const [i, object] of objects.entries()) {
        const head = encoder.encode(`${i + 1} 0 obj\n`), tail = encoder.encode('\nendobj\n');
        offsets.push(offset);
        parts.push(head, object, tail);
        offset += head.length + object.length + tail.length;
    }
    const entries = offsets.map(entry => String(entry).padStart(XREF_OFFSET_DIGITS, '0') + ' 00000 n \n').join('');
    parts.push(encoder.encode(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}trailer\n<< /Size ${objects.length + 1} /Root ${CATALOG_NUMBER} 0 R /Info ${infoNumber} 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
    return parts;
}
