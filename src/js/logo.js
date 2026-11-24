/* A picture of the user's as logo: it becomes part of the document as a data
   URI (SVG as it is, other pictures scaled to at most 512 pixels), and the
   error correction is raised to H unless the document chose Q or H. */

import { state } from './state.js?v=2';
import { translate } from './translate.js?v=2';
import { showToast } from './toast.js?v=2';
import { setKeys } from './qrdoc.js?v=4';
import { editCode } from './history.js?v=5';

/** The picture types a logo can be. */
const LOGO_TYPES = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';

/** The largest picture taken, in bytes. */
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

/** The largest SVG taken, in bytes (it is kept as it is). */
const MAX_SVG_BYTES = 200 * 1024;

/** Pictures are scaled down to this many pixels on their longer side. */
const MAX_LOGO_PIXELS = 512;

/** The quality of a JPEG logo. */
const JPEG_QUALITY = 0.9;

/** The hidden file input of the logo picture, made by startLogoPicker. */
let logoInput = null;

/**
 * Adds the hidden file input of the logo picture to the page.
 * @returns {void}
 */
export function startLogoPicker() {
    logoInput = document.createElement('input');
    logoInput.type = 'file';
    logoInput.accept = LOGO_TYPES;
    logoInput.hidden = true;
    document.body.append(logoInput);
    logoInput.addEventListener('change', addLogoPicture);
}

/**
 * Opens the browser's file choice for a logo picture.
 * @returns {void}
 */
export function openLogoChoice() {
    logoInput.click();
}

/**
 * Writes the chosen picture into the document as logo (one undo step).
 * @returns {Promise<void>} settles when the logo is written or refused.
 */
async function addLogoPicture() {
    const file = logoInput.files[0];
    logoInput.value = '';
    if (!file) return;
    if (file.size > MAX_PICTURE_BYTES) { showToast(translate('The picture is larger than 5 MB')); return; }
    if (file.type === 'image/svg+xml' && file.size > MAX_SVG_BYTES) { showToast(translate('The SVG is larger than 200 KB')); return; }
    const uri = file.type === 'image/svg+xml' ? await readSvgAsDataUri(file) : await readPictureAsDataUri(file);
    const pairs = { logo: uri };
    if (!state.doc.set.ecc || state.design.ecc === 'L' || state.design.ecc === 'M') pairs.ecc = 'H';
    editCode(setKeys(state.code, pairs), { msg: translate('Logo added - it is part of the document') });
}

/**
 * Reads an SVG file as a data URI, unchanged.
 * @param {File} file - the SVG.
 * @returns {Promise<string>} the data URI.
 */
async function readSvgAsDataUri(file) {
    return 'data:image/svg+xml;base64,' + btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));
}

/**
 * Reads a picture as a PNG or JPEG data URI, scaled down to the logo size.
 * @param {File} file - the picture.
 * @returns {Promise<string>} the data URI.
 */
async function readPictureAsDataUri(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_LOGO_PIXELS / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', JPEG_QUALITY);
}
