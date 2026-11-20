/* The Export dialog: SVG, PDF, EPS (vectors, width in mm), PNG, JPEG, WebP
   (width in pixels, PNG with its dpi), the content as text, the .qr document,
   all of them in one ZIP, copying as picture or text, and many codes from a
   table (batch.js). The chosen format and sizes are remembered in this browser. */

import { renderSvg } from './draw.js?v=3';
import { convertToPdf, convertToEps, convertToImage, createCodeCanvas } from './export.js?v=4';
import { openDialog } from './dialogs.js?v=5';
import { createZip } from './zip.js?v=4';
import { saveFile } from './util.js?v=3';
import { MIME, DEFAULT_DPI, createExportSettings, hasRememberedWidth, savePreferences, getFileName, getPixelWidth, getWidthMm, getPngDpi, getSvgSize } from './export-settings.js?v=2';
import { startBatch, updateBatch, exportBatch, parseTable, getFilledDocument } from './batch.js?v=3';

/** The file extension of each format. */
const EXTENSION = { svg: 'svg', pdf: 'pdf', eps: 'eps', png: 'png', jpeg: 'jpg', webp: 'webp', txt: 'txt', qr: 'qr' };

/** The formats made as pictures in pixels. */
const PICTURE = new Set(['png', 'jpeg', 'webp']);

/** The formats of "All in one ZIP", in order. */
const ZIP_FORMATS = ['svg', 'pdf', 'eps', 'png', 'qr', 'txt'];

/** The printed width a Swiss QR bill starts with, in millimetres. */
const SWISS_MM = 46;

/** A module smaller than this, in millimetres, is too small for many phones. */
const MIN_MODULE_MM = 0.4;

/** Millimetres per inch. */
const MM_PER_INCH = 25.4;

/** The editor's functions, set by startExport. */
let editor = null;

/** The elements of the dialog. */
let elements = null;

/** The note below the format list. */
let hint = null;

/**
 * The functions the Export dialog calls.
 * @typedef {Object} ExportEditor
 * @property {function(): import('./state.js').EditorState} getState - the editor state.
 * @property {function(string, string=): import('./drawing.js').DrawnDocument} drawDocument - reads and draws a document.
 * @property {function(string, number, string=): number} getCaptionWidth - the width of a caption.
 * @property {function(string): void} showToast - shows a message.
 * @property {function(string): string} translate - translates an on-screen text.
 */

/**
 * Sets up the Export dialog and many codes from a table.
 * @param {ExportEditor} exportEditor - what the dialog may use of the editor.
 * @returns {{open: function(): void, update: function(): void, createBlob: function(string, Object=, string=): Promise<Blob>,
 *   exportBatch: function(): Promise<void>, parseTable: function(string): string[][], getFilledDocument: function(string, string[], string[]): string}}
 *   the Export API.
 */
export function startExport(exportEditor) {
    editor = exportEditor;
    elements = createExportSettings(editor.getState);
    hint = document.createElement('p');
    hint.className = 'hint ex-hint';
    hint.hidden = true;
    elements.text.before(hint);
    elements.download.addEventListener('click', saveChosenFormat);
    elements.zip.addEventListener('click', saveAllAsZip);
    elements.copy.addEventListener('click', copyChosen);
    [elements.format, elements.pixels, elements.dpi, elements.mm, elements.batchFormat, elements.batchName].forEach(input => input.addEventListener('change', update));
    [elements.pixels, elements.dpi, elements.mm, elements.name].forEach(input => input.addEventListener('input', update));
    startBatch(editor, elements);
    return { open, update, createBlob, exportBatch, parseTable, getFilledDocument };
}

/**
 * Opens the dialog with the document's name (a Swiss QR bill starts at 46 mm).
 * @returns {void}
 */
function open() {
    elements.name.value = editor.getState().name;
    if (editor.getState().type === 'swiss' && !hasRememberedWidth()) elements.mm.value = SWISS_MM;
    update();
    openDialog(elements.dialog);
}

/**
 * Shows the fields, the preview text and the size of the chosen format.
 * @returns {void}
 */
function update() {
    const format = elements.format.value, state = editor.getState();
    const isText = format === 'svg' || format === 'txt' || format === 'qr';
    showFormatFields(format, isText);
    if (!state.layout && format !== 'txt' && format !== 'qr' && format !== 'batch') { showNoCode(); return; }
    if (format === 'svg') elements.text.value = renderSvg(state.layout, getSvgSize(state.layout));
    else if (format === 'txt') elements.text.value = state.content;
    else if (format === 'qr') elements.text.value = state.code;
    if (PICTURE.has(format)) showPictureSize(format, state.layout);
    else if (format === 'svg' || format === 'pdf' || format === 'eps') showVectorSize(format, state.layout);
    else if (format === 'batch') updateBatch();
    else elements.info.textContent = '';
}

/**
 * Shows the fields and buttons that belong to a format and hides the others.
 * @param {string} format - the chosen format.
 * @param {boolean} isText - the format is shown as text in the dialog.
 * @returns {void}
 */
function showFormatFields(format, isText) {
    const { dialog, dpi } = elements;
    const isVector = format === 'svg' || format === 'pdf' || format === 'eps';
    dialog.dataset.format = format;
    dialog.querySelectorAll('.only-picture').forEach(element => { element.hidden = !PICTURE.has(format); });
    dialog.querySelectorAll('.only-measure').forEach(element => { element.hidden = !isVector; });
    dialog.querySelectorAll('.only-batch').forEach(element => { element.hidden = format !== 'batch'; });
    dpi.closest('label').classList.toggle('off', format !== 'png');
    dpi.disabled = format !== 'png';
    elements.text.hidden = !isText;
    hint.hidden = isText || format === 'batch';
    elements.copy.hidden = format === 'batch' || format === 'pdf' || format === 'eps';
    elements.zip.hidden = format === 'batch';
}

/**
 * Says that there is no code to export.
 * @returns {void}
 */
function showNoCode() {
    elements.text.value = '';
    hint.hidden = false;
    hint.textContent = editor.translate('There is no code yet - see the problems above the code.');
    elements.info.textContent = '';
}

/**
 * Shows the size of a picture (and its printed size at the dpi of a PNG).
 * @param {string} format - "png", "jpeg" or "webp".
 * @param {Object} layout - the layout of the code.
 * @returns {void}
 */
function showPictureSize(format, layout) {
    const translate = editor.translate;
    const width = getPixelWidth(), height = Math.round(width * layout.h / layout.w);
    const dpi = +elements.dpi.value || DEFAULT_DPI;
    hint.textContent = translate('(The picture is made when you download it.)');
    elements.info.textContent = format === 'png' ? `${width} × ${height} ${translate('pixels')} = ${(width / dpi * MM_PER_INCH).toFixed(1)} mm ${translate('at')} ${dpi} dpi` : `${width} × ${height} ${translate('pixels')}`;
}

/**
 * Shows the size of a vector format and of one module in it.
 * @param {string} format - "svg", "pdf" or "eps".
 * @param {Object} layout - the layout of the code.
 * @returns {void}
 */
function showVectorSize(format, layout) {
    const translate = editor.translate;
    const widthMm = getWidthMm();
    const moduleMm = widthMm / layout.w;
    elements.measureInfo.textContent = `${translate('One module')} ${moduleMm.toFixed(2)} mm${moduleMm < MIN_MODULE_MM ? ' - ' + translate('below 0.4 mm many phones fail') : ''}`;
    if (format !== 'svg') hint.textContent = format === 'pdf' ? translate('(A vector PDF, one page as large as the code - made when you download it.)') : translate('(A vector EPS for print shops - made when you download it.)');
    elements.info.textContent = `${widthMm} × ${(widthMm * layout.h / layout.w).toFixed(1)} mm`;
}

/**
 * Makes the file of a format.
 * @param {string} format - a key of MIME.
 * @param {import('./state.js').EditorState} [state] - the document (the open one by default).
 * @param {string} [fileTitle] - the title written into SVG and EPS (the document's name by default).
 * @returns {Promise<Blob>} the file.
 * @throws {Error} when the format needs a code and there is none.
 */
async function createBlob(format, state = editor.getState(), fileTitle = state.name) {
    const layout = state.layout;
    if (format === 'txt') return new Blob([state.content], { type: 'text/plain;charset=utf-8' });
    if (format === 'qr') return new Blob([state.code], { type: 'text/plain;charset=utf-8' });
    if (!layout) throw new Error(editor.translate('There is no code yet - see the problems above the code.'));
    if (format === 'svg') return new Blob([renderSvg(layout, { ...getSvgSize(layout), title: fileTitle })], { type: MIME.svg });
    if (format === 'pdf') return convertToPdf(layout, getWidthMm(), editor.getCaptionWidth);
    if (format === 'eps') return convertToEps(layout, getWidthMm(), editor.getCaptionWidth, fileTitle);
    return convertToImage(layout, getPixelWidth(), MIME[format], format === 'png' ? getPngDpi() : 0);
}

/**
 * Runs a download while its button is disabled; an error is shown as a message.
 * @param {HTMLButtonElement} button - the button pressed.
 * @param {function(): Promise<void>} action - the download.
 * @returns {Promise<void>} settles when the download is done or failed.
 */
async function runWithButton(button, action) {
    button.disabled = true;
    try { await action(); } catch (error) { console.error(error); editor.showToast(error.message); } finally { button.disabled = false; }
}

/**
 * Downloads the chosen format, or runs the batch.
 * @returns {Promise<void>} settles when the download is done or failed.
 */
function saveChosenFormat() {
    const format = elements.format.value;
    return runWithButton(elements.download, () => saveFormat(format));
}

/**
 * Remembers the export settings and downloads one format, or runs the batch.
 * @param {string} format - the chosen format, "batch" for many codes from a table.
 * @returns {Promise<void>} settles when the download is done; rejects when it failed.
 */
async function saveFormat(format) {
    savePreferences();
    if (format === 'batch') { await exportBatch(); return; }
    saveFile(await createBlob(format), `${getFileName()}.${EXTENSION[format]}`);
    editor.showToast(editor.translate('Downloaded'));
}

/**
 * Downloads SVG, PDF, EPS, PNG, the .qr document and the content in one ZIP.
 * @returns {Promise<void>} settles when the download is done or failed.
 */
function saveAllAsZip() {
    return runWithButton(elements.zip, saveZip);
}

/**
 * Builds every ZIP format and downloads them in one ZIP.
 * @returns {Promise<void>} settles when the download is done; rejects when it failed.
 */
async function saveZip() {
    const name = getFileName(), files = [];
    for (const format of ZIP_FORMATS) files.push({ name: `${name}.${EXTENSION[format]}`, data: await createBlob(format) });
    saveFile(await createZip(files), `${name}-all.zip`);
    editor.showToast(editor.translate('ZIP downloaded: SVG, PDF, EPS, PNG, the .qr document and the content'));
}

/**
 * Copies the chosen format: a picture as PNG, a text format as text (with the old copy command
 * where the clipboard is not allowed).
 * @returns {Promise<void>} settles when it is copied or refused.
 */
async function copyChosen() {
    const format = elements.format.value, translate = editor.translate;
    try {
        if (PICTURE.has(format)) { await copyPicture(); editor.showToast(translate('Picture copied - paste it into a document or a chat')); return; }
        await navigator.clipboard.writeText(elements.text.value);
    } catch (error) {
        if (PICTURE.has(format)) { editor.showToast(translate('This browser does not let the page copy pictures - download it instead')); return; }
        elements.text.select(); document.execCommand('copy');
    }
    editor.showToast(translate('Copied to the clipboard'));
}

/**
 * Copies the code as a PNG at the picture width of the dialog.
 * @returns {Promise<void>} settles when it is copied.
 * @throws {Error} when the browser does not let the page copy pictures.
 */
async function copyPicture() {
    const canvas = await createCodeCanvas(editor.getState().layout, getPixelWidth());
    const blob = await new Promise(resolve => canvas.toBlob(resolve, MIME.png));
    await navigator.clipboard.write([new ClipboardItem({ [MIME.png]: blob })]);
}
