/* Many codes from a table (Export > "Many codes from a table"): a CSV or TSV
   (pasted or opened) whose first row names the columns; the placeholders
   {{column}} of the document are filled per row (also in the caption). Each row
   becomes an SVG or PNG in a ZIP (named from a chosen column) or a page of one
   PDF; rows whose content does not fit are left out and listed. */

import { renderSvg } from './draw.js?v=3';
import { convertToPdf, convertToImage } from './export.js?v=4';
import { createZip } from './zip.js?v=4';
import { saveFile, getSafeFileName } from './util.js?v=3';
import { MIME, getFileName, getPixelWidth, getWidthMm, getSvgSize } from './export-settings.js?v=2';

/** At most this many rows at once. */
const MAX_ROWS = 5000;

/** The largest table file taken, in bytes. */
const MAX_TABLE_BYTES = 10 * 1024 * 1024;

/** A placeholder {{column}} in the document. */
const PLACEHOLDER = /\{\{\s*([^{}\n]{1,60}?)\s*\}\}/g;

/** A column whose values name the files until the user chooses another. */
const NAME_COLUMN = /^(name|file|filename|title)$/i;

/** The table line of the first row (1-based, after the header line). */
const FIRST_ROW_LINE = 2;

/** The resolution of the PNG files of a batch. */
const BATCH_DPI = 300;

/** After this many rows the progress is shown and the page may draw. */
const PROGRESS_STEP = 50;

/** At most this many left-out rows are named. */
const MAX_NAMED_ROWS = 20;

/** The longest file name taken from a column. */
const MAX_FILE_NAME = 80;

/**
 * A batch to make: the document, the table and how the files are made and named.
 * @typedef {Object} BatchJob
 * @property {string} code - the document with its placeholders.
 * @property {string[]} head - the names of the columns.
 * @property {string[][]} rows - the rows.
 * @property {string} format - "svg", "png" or "pdf".
 * @property {string} column - the index of the column that names the files, "" for the row number.
 */

/**
 * The codes made from a table.
 * @typedef {Object} BatchResult
 * @property {{name: string, data: Blob}[]} files - the files of the ZIP (SVG or PNG).
 * @property {Object[]} pages - the layouts of the PDF pages.
 * @property {number[]} skipped - the table lines left out (1-based, header included).
 */

/** The editor's functions (see exportui.js). */
let editor = null;

/** The elements of the Export dialog. */
let elements = null;

/**
 * A table: its header row and the rows below it.
 * @typedef {Object} Table
 * @property {string[]} head - the names of the columns.
 * @property {string[][]} rows - the rows.
 */

/**
 * Sets up the table field, the column choice and opening a table file.
 * @param {import('./exportui.js').ExportEditor} exportEditor - the editor's functions.
 * @param {Object<string, HTMLElement>} dialogElements - the elements of the Export dialog.
 * @returns {void}
 */
export function startBatch(exportEditor, dialogElements) {
    editor = exportEditor;
    elements = dialogElements;
    elements.batchTable.addEventListener('input', updateBatch);
    elements.batchName.addEventListener('change', () => { elements.batchName.dataset.chosen = '1'; });
    elements.batchOpen.addEventListener('click', () => elements.batchFile.click());
    elements.batchFile.addEventListener('change', openTableFile);
}

/**
 * Returns a CSV or TSV text as rows of fields (quotes as in RFC 4180); the separator is guessed
 * from the first line. Empty rows are left out.
 * @param {string} text - the table.
 * @returns {string[][]} the rows.
 */
export function parseTable(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const separator = ['\t', ';', ','].map(candidate => [candidate, firstLine.split(candidate).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (char === '"') quoted = false;
            else field += char;
        } else if (char === '"' && field === '') quoted = true;
        else if (char === separator) { row.push(field); field = ''; }
        else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.some(value => value !== '')) rows.push(row);
            row = [];
        } else field += char;
    }
    row.push(field);
    if (row.some(value => value !== '')) rows.push(row);
    return rows;
}

/**
 * Returns the document with each {{column}} filled with the row's value (unknown placeholders stay).
 * @param {string} code - the document.
 * @param {string[]} head - the names of the columns.
 * @param {string[]} row - the row.
 * @returns {string} the filled document; line breaks of values become spaces.
 */
export function getFilledDocument(code, head, row) {
    return code.replace(PLACEHOLDER, (placeholder, column) => {
        const index = head.findIndex(name => name.trim().toLowerCase() === column.trim().toLowerCase());
        return index < 0 ? placeholder : String(row[index] ?? '').replace(/\r?\n/g, ' ');
    });
}

/**
 * Returns the table in the dialog.
 * @returns {Table} its header and rows.
 */
function getTable() {
    const rows = parseTable(elements.batchTable.value.trim());
    return { head: rows[0] || [], rows: rows.slice(1) };
}

/**
 * Shows the columns to name the files by, the placeholders and whether the table has them.
 * @returns {void}
 */
export function updateBatch() {
    const { head, rows } = getTable();
    updateNameColumns(head);
    elements.batchInfo.textContent = getPlaceholderInfo(head, rows);
    elements.info.textContent = rows.length > MAX_ROWS ? `${editor.translate('At most')} ${MAX_ROWS} ${editor.translate('rows at once')}` : '';
}

/**
 * Creates an option of a choice.
 * @param {string} value - the option's value.
 * @param {string} label - the text it shows.
 * @returns {HTMLOptionElement} the option.
 */
function createOption(value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
}

/**
 * Fills the choice of the column that names the files; until the user chooses, the names come from a
 * column called name / file, else the first column.
 * @param {string[]} head - the names of the columns.
 * @returns {void}
 */
function updateNameColumns(head) {
    const choice = elements.batchName, translate = editor.translate;
    const kept = choice.value;
    choice.replaceChildren(...[['', translate('Row number')], ...head.map((name, i) => [String(i), name || `${translate('Column')} ${i + 1}`])].map(([value, label]) => createOption(value, label)));
    const named = head.findIndex(name => NAME_COLUMN.test(name.trim()));
    choice.value = choice.dataset.chosen && [...choice.options].some(option => option.value === kept) ? kept : head.length ? String(Math.max(0, named)) : '';
}

/**
 * Returns what the dialog says about the placeholders: how to write them, which the document has,
 * which the table lacks, or how many rows there are.
 * @param {string[]} head - the names of the columns.
 * @param {string[][]} rows - the rows.
 * @returns {string} the translated line.
 */
function getPlaceholderInfo(head, rows) {
    const translate = editor.translate;
    const used = [...new Set([...editor.getState().code.matchAll(PLACEHOLDER)].map(match => match[1].trim()))];
    const missing = used.filter(column => !head.some(name => name.trim().toLowerCase() === column.toLowerCase()));
    /**
     * Returns placeholders written as {{column}}, separated by commas.
     * @param {string[]} columns - the column names.
     * @returns {string} the list.
     */
    const formatPlaceholders = columns => columns.map(column => `{{${column}}}`).join(', ');
    if (!used.length) return translate('Write placeholders like {{url}} into the content (or the caption) - each row of the table fills them.');
    if (!head.length) return `${translate('Placeholders in the document')}: ${formatPlaceholders(used)}`;
    return missing.length ? `${translate('Not in the table')}: ${formatPlaceholders(missing)}` : `${rows.length} ${rows.length === 1 ? translate('row') : translate('rows')} · ${formatPlaceholders(used)}`;
}

/**
 * Reads an opened table file into the table field.
 * @returns {Promise<void>} settles when the table is shown or refused.
 */
async function openTableFile() {
    const file = elements.batchFile.files[0];
    elements.batchFile.value = '';
    if (!file) return;
    if (file.size > MAX_TABLE_BYTES) { editor.showToast(editor.translate('The table is larger than 10 MB')); return; }
    elements.batchTable.value = await file.text();
    updateBatch();
}

/**
 * Makes one code per row of the table and downloads them: a ZIP of SVG or PNG files, or one PDF.
 * @returns {Promise<void>} settles when the download is made.
 * @throws {Error} when the table has no rows, too many, or no row makes a code.
 */
export async function exportBatch() {
    const { head, rows } = getTable();
    const translate = editor.translate;
    if (!rows.length) throw new Error(translate('Paste a table with a header row and at least one row'));
    if (rows.length > MAX_ROWS) throw new Error(`${translate('At most')} ${MAX_ROWS} ${translate('rows at once')}`);
    const job = { code: editor.getState().code, head, rows, format: elements.batchFormat.value, column: elements.batchName.value };
    const result = await createBatchFiles(job);
    if (!result.files.length && !result.pages.length) throw new Error(translate('No row made a code - see the content'));
    if (job.format === 'pdf') saveFile(await convertToPdf(result.pages[0], getWidthMm(), editor.getCaptionWidth, result.pages), `${getFileName()}-codes.pdf`);
    else saveFile(await createZip(result.files), `${getFileName()}-codes.zip`);
    showBatchResult(result);
}

/**
 * Draws the code of every row: a file for the ZIP or a page for the PDF, with a unique name.
 * A step of exportBatch that also shows its progress in the dialog every 50 rows and lets the
 * page draw meanwhile; it returns what it made for exportBatch to save.
 * @param {BatchJob} job - the document, the table, the format and the naming column.
 * @returns {Promise<BatchResult>} the files or pages, and the table lines left out.
 */
async function createBatchFiles(job) {
    const { code, head, rows, format, column } = job;
    const files = [], pages = [], skipped = [], names = new Set();
    for (let i = 0; i < rows.length; i++) {
        const drawn = editor.drawDocument(getFilledDocument(code, head, rows[i]));
        if (!drawn.layout) { skipped.push(i + FIRST_ROW_LINE); continue; }
        const name = getUniqueRowName(column === '' ? String(i + 1).padStart(String(rows.length).length, '0') : rows[i][+column] || String(i + 1), names);
        names.add(name.toLowerCase());
        if (format === 'pdf') pages.push(drawn.layout);
        else files.push({ name: `${name}.${format}`, data: format === 'svg' ? new Blob([renderSvg(drawn.layout, getSvgSize(drawn.layout))], { type: MIME.svg }) : await convertToImage(drawn.layout, getPixelWidth(), MIME.png, BATCH_DPI) });
        if (i % PROGRESS_STEP === PROGRESS_STEP - 1) { elements.info.textContent = `${i + 1} / ${rows.length}`; await new Promise(resolve => setTimeout(resolve)); }
    }
    return { files, pages, skipped };
}

/**
 * Returns a file name for a row that no other row has (a number is added when it is taken).
 * @param {string} wanted - the name from the chosen column or the row number.
 * @param {Set<string>} names - the names taken, in lower case.
 * @returns {string} the unique name.
 */
function getUniqueRowName(wanted, names) {
    let name = getSafeFileName(wanted).slice(0, MAX_FILE_NAME);
    for (let k = 2; names.has(name.toLowerCase()); k++) name = `${name.replace(/-\d+$/, '')}-${k}`;
    return name;
}

/**
 * Says how many codes were made and which table lines were left out.
 * @param {BatchResult} result - the made files or pages and the left-out lines.
 * @returns {void}
 */
function showBatchResult(result) {
    const { files, pages, skipped } = result;
    const translate = editor.translate;
    const made = files.length || pages.length;
    elements.info.textContent = skipped.length ? `${translate('Left out (content too long)')}: ${translate('lines')} ${skipped.slice(0, MAX_NAMED_ROWS).join(', ')}${skipped.length > MAX_NAMED_ROWS ? ' …' : ''}` : '';
    editor.showToast(`${made} ${made === 1 ? translate('code') : translate('codes')} ${translate('made')}${skipped.length ? ` - ${skipped.length} ${translate('left out')}` : ''}`);
}
