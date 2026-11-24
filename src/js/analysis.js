/* Reading the open document and checking its code.

   updateDocument(), after every change of the text:
     1. draw the document (drawing.js) and keep what was read in the state;
     2. collect the problems of the header, the content type, the encoding and the design;
     3. show the problems and the drawn code;
     4. read the drawn code back after a short pause (the scan check, check.js) and add its
        result to the problems. */

import { state, areas } from './state.js?v=2';
import { drawDocument } from './drawing.js?v=3';
import { getContentProblems } from './payload-check.js?v=2';
import { getDesignProblems, checkScan } from './check.js?v=4';
import { renderBadge, renderPreview } from './preview.js?v=3';
import { renderProblems } from './problems.js?v=5';

/** The pause after a change before the drawn code is read back, in milliseconds. */
const SCAN_DELAY_MS = 260;

/** Design keys a Swiss QR bill takes from the document; every other one is listed as not used. */
const SWISS_KEYS = ['margin', 'mask', 'version'];

/** The order of the problems: errors first, then warnings, then notes. */
const KIND_ORDER = { error: 0, warn: 1, info: 2 };

/** The number of the latest scan check; an older one that finishes later is dropped. */
let scanNumber = 0;

/** The timer of the next scan check. */
let scanTimer = 0;

/**
 * Reads the open document again: draws it, collects its problems, shows them and the code,
 * and starts the scan check.
 * @returns {void}
 */
export function updateDocument() {
    const drawn = drawDocument(state.code);
    Object.assign(state, { doc: drawn.doc, content: drawn.content, type: drawn.type, design: drawn.doc.design, eff: drawn.eff, enc: drawn.enc, layout: drawn.layout });
    state.coreProblems = getCoreProblems(drawn);
    state.scan = null;
    updateProblems();
    renderPreview();
    startScanCheck();
}

/**
 * Returns the problems of a drawn document without the scan check.
 * @param {import('./drawing.js').DrawnDocument} drawn - the document read and drawn.
 * @returns {import('./state.js').Problem[]} the problems in the order they are found.
 */
function getCoreProblems(drawn) {
    const { doc } = drawn;
    const contentLine = doc.contentLine;
    const problems = [...doc.problems];
    for (const problem of getContentProblems(drawn.type, drawn.content)) problems.push({ line: contentLine + (problem.at || 0), kind: problem.kind, msg: problem.msg });
    if (drawn.enc.error) problems.push({ line: contentLine, kind: 'error', msg: drawn.enc.error });
    if (drawn.layout) for (const problem of getDesignProblems(drawn.eff, drawn.layout, drawn.enc, drawn.type === 'swiss')) problems.push({ line: getKeyLine(doc, problem.key), kind: problem.kind, msg: problem.msg });
    problems.push(...getFixedDesignNotes(drawn));
    return problems;
}

/**
 * Returns the line a design problem is shown on: the key's own line, else the --- line, else the first line.
 * @param {Object} doc - the parsed document.
 * @param {string} key - the design key the problem is about.
 * @returns {number} the 0-based line.
 */
function getKeyLine(doc, key) {
    if (doc.set[key] != null) return doc.set[key];
    return doc.header ? doc.sepLine : 0;
}

/**
 * Returns the notes on design lines that a payment type does not use.
 * @param {import('./drawing.js').DrawnDocument} drawn - the document read and drawn.
 * @returns {import('./state.js').Problem[]} a note for the Swiss QR bill or the SEPA code, or none.
 */
function getFixedDesignNotes(drawn) {
    const { doc, type } = drawn;
    const notes = [];
    if (type === 'swiss') {
        const ignored = Object.keys(doc.set).filter(key => !SWISS_KEYS.includes(key));
        if (ignored.length) notes.push({ line: doc.set[ignored[0]], kind: 'info', msg: `The Swiss QR bill is drawn as its standard requires - ${ignored.join(', ')} ${ignored.length === 1 ? 'is' : 'are'} not used` });
    }
    if (type === 'epc' && doc.set.ecc != null && doc.design.ecc !== 'M') notes.push({ line: doc.set.ecc, kind: 'info', msg: 'A SEPA payment code uses error correction M, as the standard requires' });
    return notes;
}

/**
 * Adds the result of the scan check to the problems, sorts them and shows them in the
 * problem list, at the badge and in the side panel.
 * @returns {void}
 */
export function updateProblems() {
    const problems = [...state.coreProblems];
    const scanProblem = getScanProblem(state.scan, state.doc.contentLine);
    if (scanProblem) problems.unshift(scanProblem);
    state.problems = problems.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.line - b.line);
    renderProblems();
    renderBadge();
    areas.panel?.render();
}

/**
 * Returns the problem a scan check found, if any.
 * @param {Object|null} scan - the result of the scan check, null while it runs.
 * @param {number} contentLine - the line where the content starts.
 * @returns {import('./state.js').Problem|null} an error when the code fails, a warning when it scans only in good conditions.
 */
function getScanProblem(scan, contentLine) {
    if (scan && scan.level === 'fail') return { line: contentLine, kind: 'error', msg: scan.wrong ? 'The drawn code reads back something else than the content - check the content for characters the code cannot hold' : 'The drawn code does not scan - raise the contrast, make the logo smaller or choose more error correction' };
    if (scan && scan.level === 'fair') return { line: contentLine, kind: 'warn', msg: `The code scans, but not ${!scan.results.small ? 'when it is small' : 'when it is blurred or the light is poor'} - simpler shapes, more contrast or more error correction help` };
    return null;
}

/**
 * Starts the scan check of the drawn code after a short pause; a newer change cancels it.
 * @returns {void}
 */
function startScanCheck() {
    clearTimeout(scanTimer);
    const number = ++scanNumber;
    renderBadge();
    if (!state.layout) return;
    scanTimer = setTimeout(() => showScanCheck(number), SCAN_DELAY_MS);
}

/**
 * Reads the drawn code back and shows the result, unless a newer check was started meanwhile.
 * @param {number} number - the number of this check.
 * @returns {Promise<void>} settles when the result is shown or dropped.
 */
async function showScanCheck(number) {
    let result;
    try { result = await checkScan(state.layout, state.content); } catch (error) { console.error(error); result = null; }
    if (number !== scanNumber || !result) return;
    state.scan = result;
    updateProblems();
}
