/* The code view: the text area with the highlighting and the problem marks
   laid under it, the line numbers, the band of the cursor's line, wrapping
   of long lines (shared wrap.js), and moving the cursor to a place in the code. */

import { state, ui, NARROW_SCREEN, escapeHtml } from './state.js?v=2';
import { translate } from './translate.js?v=2';
import { createWrap } from './wrap.js?v=5';
import { highlight } from './highlight.js?v=2';
import { updateHistoryUi } from './history.js?v=6';
import { showPane } from './panes.js?v=6';

/** The height of one line of code, in pixels. */
const LINE_HEIGHT = 20;

/** The top padding of the code view, in pixels (the cursor band starts there). */
const CODE_PADDING_TOP = 10;

/** Documents up to this length are highlighted; longer ones are shown as plain text. */
const MAX_HIGHLIGHT_LENGTH = 1500000;

/** Space kept left and right of the cursor when the view scrolls sideways, in pixels. */
const SCROLL_MARGIN_RIGHT = 60;
const SCROLL_MARGIN_LEFT = 40;

/** Bytes per kilobyte in the status line. */
const BYTES_PER_KB = 1024;

/** The number of characters measured for the character width. */
const MEASURE_CHARACTERS = 100;

/** The wrapping of long lines (wrap.js), set by startCodeView. */
let lineWrap = null;

/** The band behind the line of the cursor. */
let lineBand = null;

/** The width of one character of the code font, measured once. */
let charWidth = 0;

/**
 * Sets up wrapping of long lines; runs once at start-up, before the code is shown.
 * @returns {void}
 */
export function startLineWrap() {
    lineWrap = createWrap({ prefix: 'qreditor', ta: ui.codeArea, layers: [ui.highlightLayer, ui.markLayer], gutter: ui.gutter, button: document.getElementById('btn-wrap'), onChange: renderAndSyncCode });
}

/**
 * Draws the code view again and lines its layers up with the text, after wrapping is switched.
 * @returns {void}
 */
function renderAndSyncCode() {
    renderCode();
    syncScroll();
}

/**
 * Adds the cursor band and keeps the layers in step with scrolling and the cursor.
 * @returns {void}
 */
export function startCodeView() {
    lineBand = document.createElement('div');
    lineBand.className = 'line-band';
    lineBand.setAttribute('aria-hidden', 'true');
    ui.markLayer.before(lineBand);
    ui.codeArea.addEventListener('scroll', syncScroll);
    ui.codeArea.addEventListener('keyup', moveLineBand);
    ui.codeArea.addEventListener('click', moveLineBand);
}

/**
 * Returns the 0-based line of a position in the document.
 * @param {number} position - a character offset.
 * @returns {number} the line it is on.
 */
export function getLineOfPosition(position) {
    let line = 0;
    for (let i = state.code.indexOf('\n'); i >= 0 && i < position; i = state.code.indexOf('\n', i + 1)) line++;
    return line;
}

/**
 * Returns the 0-based column of a position in the document.
 * @param {number} position - a character offset.
 * @returns {number} its distance from the start of its line.
 */
function getColumnOfPosition(position) {
    return position - (state.code.lastIndexOf('\n', position - 1) + 1);
}

/**
 * Returns where a line starts in the document.
 * @param {number} line - the 0-based line.
 * @returns {number} the offset of its first character (the end of the document past the last line).
 */
function getLineStart(line) {
    let position = 0;
    for (let current = 0; current < line && position >= 0; current++) {
        const lineBreak = state.code.indexOf('\n', position);
        if (lineBreak < 0) return state.code.length;
        position = lineBreak + 1;
    }
    return position;
}

/**
 * Returns where a line ends in the document.
 * @param {number} line - the 0-based line.
 * @returns {number} the offset of its line break, or the end of the document.
 */
function getLineEnd(line) {
    const start = getLineStart(line);
    const lineBreak = state.code.indexOf('\n', start);
    return lineBreak < 0 ? state.code.length : lineBreak;
}

/**
 * Draws the highlighting, the problem marks, the line numbers and the status line of the code.
 * @returns {void}
 */
export function renderCode() {
    const code = state.code;
    ui.highlightLayer.innerHTML = code.length < MAX_HIGHLIGHT_LENGTH ? highlight(code, state.doc, state.type) + '\n' : escapeHtml(code) + '\n';
    renderMarks();
    lineWrap.update(code);
    ui.codeStatus.textContent = getCodeStatus(code);
    updateHistoryUi();
}

/**
 * Returns the status line below the code: lines and size.
 * @param {string} code - the document.
 * @returns {string} for example "12 lines · 1.4 KB".
 */
function getCodeStatus(code) {
    const lines = code.split('\n').length;
    const bytes = new Blob([code]).size;
    return `${lines} ${lines === 1 ? translate('line') : translate('lines')} · ${bytes < BYTES_PER_KB ? bytes + ' B' : (bytes / BYTES_PER_KB).toFixed(1) + ' KB'}`;
}

/**
 * Marks the lines with errors and warnings in the layer under the text.
 * @returns {void}
 */
export function renderMarks() {
    const lines = state.code.split('\n');
    const markByLine = new Map();
    for (const problem of state.problems) {
        if (problem.kind !== 'info' && (!markByLine.has(problem.line) || problem.kind === 'error')) markByLine.set(problem.line, problem.kind === 'error' ? 'err' : 'warn');
    }
    ui.markLayer.innerHTML = lines.map((line, i) => (markByLine.has(i) ? `<mark class="${markByLine.get(i)}">${escapeHtml(line || ' ')}</mark>` : escapeHtml(line))).join('\n') + '\n';
}

/**
 * Moves the highlighting, the marks and the line numbers with the scrolled text.
 * @returns {void}
 */
export function syncScroll() {
    const shift = `translate(${-ui.codeArea.scrollLeft}px, ${-ui.codeArea.scrollTop}px)`;
    ui.highlightLayer.style.transform = shift;
    ui.markLayer.style.transform = shift;
    ui.gutter.style.transform = `translateY(${-ui.codeArea.scrollTop}px)`;
    moveLineBand();
}

/**
 * Moves the band to the line of the cursor; it is hidden while text is selected in the code.
 * @returns {void}
 */
function moveLineBand() {
    const codeArea = ui.codeArea;
    lineBand.hidden = codeArea.selectionStart !== codeArea.selectionEnd && document.activeElement === codeArea;
    const line = getLineOfPosition(codeArea.selectionStart);
    lineBand.style.transform = `translateY(${CODE_PADDING_TOP + lineWrap.getLineTop(line) - codeArea.scrollTop}px)`;
    lineBand.style.height = lineWrap.getLineHeight(line) + 'px';
}

/**
 * Returns the width of one character of the code font; measured once and kept (a cache).
 * @returns {number} the width in pixels.
 */
function getCharWidth() {
    if (!charWidth) {
        const probe = document.createElement('span');
        probe.textContent = 'x'.repeat(MEASURE_CHARACTERS);
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
        probe.style.font = getComputedStyle(ui.codeArea).font;
        document.body.appendChild(probe);
        charWidth = probe.getBoundingClientRect().width / MEASURE_CHARACTERS;
        probe.remove();
    }
    return charWidth;
}

/**
 * Selects a part of the code and scrolls it into view.
 * @param {number} position - where the selection starts.
 * @param {boolean} [focus=true] - focus the code (not on a narrow screen).
 * @param {number} [selectionEnd=position] - where the selection ends.
 * @returns {void}
 */
export function showInCode(position, focus = true, selectionEnd = position) {
    const codeArea = ui.codeArea;
    if (focus && !NARROW_SCREEN.matches) codeArea.focus({ preventScroll: true });
    codeArea.setSelectionRange(position, selectionEnd);
    showLineInView(getLineOfPosition(position));
    showColumnInView(getColumnOfPosition(position));
    syncScroll();
}

/**
 * Scrolls the code so that a line is in view, a third down from the top, when it is not.
 * @param {number} line - the 0-based line.
 * @returns {void}
 */
function showLineInView(line) {
    const codeArea = ui.codeArea;
    const top = lineWrap.getLineTop(line), height = codeArea.clientHeight;
    if (top < codeArea.scrollTop + LINE_HEIGHT || top > codeArea.scrollTop + height - LINE_HEIGHT * 2) codeArea.scrollTop = Math.max(0, top - height / 3);
}

/**
 * Scrolls the code sideways so that a column is in view, when it is not.
 * @param {number} column - the 0-based column.
 * @returns {void}
 */
function showColumnInView(column) {
    const codeArea = ui.codeArea;
    const x = column * getCharWidth();
    if (x < codeArea.scrollLeft || x > codeArea.scrollLeft + codeArea.clientWidth - SCROLL_MARGIN_RIGHT) codeArea.scrollLeft = Math.max(0, x - SCROLL_MARGIN_LEFT);
}

/**
 * Selects a whole line in the code and scrolls to it; on a narrow screen the code pane is shown first.
 * @param {number} line - the 0-based line.
 * @returns {void}
 */
export function showLine(line) {
    if (NARROW_SCREEN.matches) showPane('code');
    showInCode(getLineStart(line), true, getLineEnd(line));
}
