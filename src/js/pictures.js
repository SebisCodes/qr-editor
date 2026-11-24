/* Opening files and reading QR codes from pictures: a .qr or text file becomes
   a document as it is; a picture (opened, dropped or pasted) is read for a QR
   code with jsQR (check.js) and its content becomes a new document. Nothing in
   the viewer. */

import { translate } from './translate.js?v=2';
import { showToast } from './toast.js?v=2';
import { DEFAULT_NAME, getElement } from './state.js?v=2';
import { VIEWER } from './sync.js?v=25';
import { setContent } from './qrdoc.js?v=4';
import { getContentType, TYPE_NAMES } from './payload.js?v=5';
import { readImage } from './check.js?v=4';
import { createDocument } from './documents.js?v=6';

/** Files larger than this are not opened as documents, in bytes. */
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/** A file read as a picture, by its type or its name. */
const PICTURE_TYPE = /^image\//;
const PICTURE_NAME = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

/** A file opened as a document, by its name or its type. */
const DOCUMENT_NAME = /\.(qr|txt)$/i;
const TEXT_TYPE = /^text\//;

/** The file input of "Open". */
const fileInput = getElement('#file');

/** How deep the pointer is in nested elements while files are dragged over the page. */
let dragDepth = 0;

/**
 * Sets up "Open", dropping files on the page and pasting a picture.
 * @returns {void}
 */
export function startPictures() {
    getElement('#btn-open').addEventListener('click', openFileChoice);
    fileInput.addEventListener('change', openPickedFiles);
    window.addEventListener('dragenter', showDropTarget);
    window.addEventListener('dragover', enableFileDrop);
    window.addEventListener('dragleave', hideDropTarget);
    window.addEventListener('drop', openDroppedFiles);
    window.addEventListener('paste', readPastedPicture);
}

/**
 * Opens the browser's file choice of "Open".
 * @returns {void}
 */
export function openFileChoice() {
    fileInput.click();
}

/**
 * Opens the files chosen with "Open" and empties the choice.
 * @returns {Promise<void>} settles when every file is handled.
 */
async function openPickedFiles() {
    await openFiles([...fileInput.files]);
    fileInput.value = '';
}

/**
 * Opens files one after the other: a picture is read for a QR code, a .qr or text file
 * becomes a document; anything else is reported.
 * @param {File[]} files - the files.
 * @returns {Promise<void>} settles when every file is handled.
 */
async function openFiles(files) {
    for (const file of files) {
        if (PICTURE_TYPE.test(file.type) || PICTURE_NAME.test(file.name)) { await readPictureCode(file, file.name); continue; }
        if (!DOCUMENT_NAME.test(file.name) && !TEXT_TYPE.test(file.type)) { showToast(`"${file.name}" ${translate('is neither a .qr file nor a picture')}`); continue; }
        if (file.size > MAX_DOCUMENT_BYTES) { showToast(translate('The file is larger than 20 MB')); continue; }
        const text = (await file.text()).replace(/\r\n/g, '\n');
        if (createDocument(file.name.replace(/\.[^.]+$/, '') || DEFAULT_NAME, text)) showToast(`"${file.name}" ${translate('opened - it is now in "My documents"')}`);
    }
}

/**
 * Reads a picture for a QR code; its content becomes a new document. A command that returns
 * whether a code was found, for the callers that go on with it.
 * @param {Blob} picture - the picture.
 * @param {string} [label=''] - where it comes from, for the message.
 * @returns {Promise<boolean>} true when a code was found.
 */
export async function readPictureCode(picture, label = '') {
    let found = null;
    try { found = await readImage(picture); } catch (error) { console.error(error); }
    if (!found) { showToast(label ? `${translate('No QR code found in')} "${label}"` : translate('No QR code found in the picture')); return false; }
    receiveScannedText(found.text, label);
    return true;
}

/**
 * Makes the content of a QR code that was read a new document with the default design.
 * @param {string} text - the content read.
 * @param {string} label - where it comes from, for the message.
 * @returns {void}
 */
export function receiveScannedText(text, label) {
    const type = getContentType(text);
    const name = `${translate(TYPE_NAMES[type])} ${translate('read')}`;
    if (createDocument(name, setContent('', text))) showToast(`${translate('QR code read')} (${translate(TYPE_NAMES[type])})${label ? ` ${translate('from')} "${label}"` : ''} - ${translate('it is a new document')}`);
}

/**
 * Marks the page as a drop target while files are dragged over it.
 * @param {DragEvent} event - the drag entering an element.
 * @returns {void}
 */
function showDropTarget(event) {
    if (VIEWER) return;
    if (!event.dataTransfer.types.includes('Files')) return;
    dragDepth++;
    document.body.classList.add('drop');
    event.preventDefault();
}

/**
 * Lets files be dropped on the page.
 * @param {DragEvent} event - the drag over an element.
 * @returns {void}
 */
function enableFileDrop(event) {
    if (!VIEWER && event.dataTransfer.types.includes('Files')) event.preventDefault();
}

/**
 * Removes the drop mark when the dragged files leave the page.
 * @returns {void}
 */
function hideDropTarget() {
    if (--dragDepth > 0) return;
    dragDepth = 0;
    document.body.classList.remove('drop');
}

/**
 * Opens the files dropped on the page.
 * @param {DragEvent} event - the drop.
 * @returns {void}
 */
function openDroppedFiles(event) {
    dragDepth = 0;
    document.body.classList.remove('drop');
    if (VIEWER) return;
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    event.preventDefault();
    openFiles(files);
}

/**
 * Reads a pasted picture for a QR code; text is left to the other paste handlers.
 * @param {ClipboardEvent} event - the paste.
 * @returns {void}
 */
function readPastedPicture(event) {
    if (VIEWER) return;
    const item = [...(event.clipboardData?.items || [])].find(entry => PICTURE_TYPE.test(entry.type));
    if (!item) return;
    event.preventDefault();
    readPictureCode(item.getAsFile(), translate('the clipboard'));
}
