/**
 * Writing a drawn code (render.js createLayout) as a file: PDF and EPS as
 * vectors (export-pdf.js, export-eps.js, offered here), PNG / JPEG / WebP as
 * pixels. A PNG gets its resolution (dpi) written in.
 */

import { drawCanvas, importImages } from './draw.js?v=3';

export { convertToPdf } from './export-pdf.js?v=3';
export { convertToEps } from './export-eps.js?v=3';

const PNG_TYPE = 'image/png';
const JPEG_TYPE = 'image/jpeg';
const PICTURE_QUALITY = 0.92;
const WHITE = '#ffffff';
const METRES_PER_INCH = 0.0254;
const PNG_SIGNATURE_AND_HEADER = 8 + 25;     // the signature and the IHDR chunk; pHYs goes right after them
const PHYS_CHUNK_LENGTH = 21;                // length, type, 9 bytes of data, CRC
const PHYS_DATA_LENGTH = 9;
const PHYS_TYPE = [0x70, 0x48, 0x59, 0x73];  // "pHYs"
const PHYS_UNIT_METRE = 1;
const CRC_POLYNOMIAL = 0xedb88320;
const CRC_TABLE = createCrcTable();

/**
 * Options of createCodeCanvas().
 * @typedef {Object} CanvasOptions
 * @property {boolean} [opaque] - fill the canvas white first (for formats without transparency).
 */

/**
 * Draws a code on a new canvas.
 * @param {Layout} layout - the layout.
 * @param {number} pixelWidth - the width in pixels; the height follows the layout.
 * @param {CanvasOptions} [options] - whether the canvas is opaque.
 * @returns {Promise<HTMLCanvasElement>} the canvas with the code.
 */
export async function createCodeCanvas(layout, pixelWidth, options = {}) {
    const images = await importImages(layout);
    const scale = pixelWidth / layout.w;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(layout.w * scale);
    canvas.height = Math.round(layout.h * scale);
    const context = canvas.getContext('2d');
    if (options.opaque) { context.fillStyle = WHITE; context.fillRect(0, 0, canvas.width, canvas.height); }
    drawCanvas(context, layout, scale, images);
    return canvas;
}

/**
 * Writes a code as picture file; JPEG gets a white background, PNG its resolution when one is given.
 * @param {Layout} layout - the layout.
 * @param {number} pixelWidth - the width in pixels.
 * @param {string} [type] - the media type: image/png, image/jpeg or image/webp.
 * @param {number} [dpi] - the resolution written into a PNG, 0 for none.
 * @returns {Promise<?Blob>} the file, null when the browser cannot write the type.
 */
export async function convertToImage(layout, pixelWidth, type = PNG_TYPE, dpi = 0) {
    const canvas = await createCodeCanvas(layout, pixelWidth, { opaque: type === JPEG_TYPE });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, PICTURE_QUALITY));
    if (type !== PNG_TYPE || !dpi || !blob) return blob;
    return getPngWithDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
}

/**
 * Returns a PNG with a pHYs chunk (pixels per metre) right after its IHDR chunk.
 * @param {Uint8Array} png - the PNG file.
 * @param {number} dpi - the resolution in dots per inch.
 * @returns {Blob} the PNG file with the resolution.
 */
export function getPngWithDpi(png, dpi) {
    const pixelsPerMetre = Math.round(dpi / METRES_PER_INCH);
    const chunk = new Uint8Array(PHYS_CHUNK_LENGTH);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, PHYS_DATA_LENGTH);
    chunk.set(PHYS_TYPE, 4);
    view.setUint32(8, pixelsPerMetre);
    view.setUint32(12, pixelsPerMetre);
    chunk[16] = PHYS_UNIT_METRE;
    view.setUint32(17, getCrc32(chunk.subarray(4, 17)));
    return new Blob([png.subarray(0, PNG_SIGNATURE_AND_HEADER), chunk, png.subarray(PNG_SIGNATURE_AND_HEADER)], { type: PNG_TYPE });
}

/**
 * Creates the table of the CRC-32 that PNG chunks carry.
 * @returns {Uint32Array} the 256 entries.
 */
function createCrcTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let value = n;
        for (let k = 0; k < 8; k++) value = value & 1 ? CRC_POLYNOMIAL ^ (value >>> 1) : value >>> 1;
        table[n] = value >>> 0;
    }
    return table;
}

/**
 * Returns the CRC-32 of bytes, as a PNG chunk carries it.
 * @param {Uint8Array} bytes - the chunk type and data.
 * @returns {number} the checksum.
 */
function getCrc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
