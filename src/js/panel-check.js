/* The Check tab of the side panel: the scan check in its three conditions, the
   data of the code, the contrast of each color against the background, the print
   size (smallest size for a scanning distance, module size for a printed width)
   and every problem; a click on a problem selects its line in the code. */

import { RECOVERY } from './render.js?v=4';
import { getContrast } from './check.js?v=4';
import { escapeAttribute } from './panel-html.js?v=2';

/** The contrast that scans reliably, and the least that scans at all. */
const GOOD_CONTRAST = 4.5;
const LEAST_CONTRAST = 3;

/** A module smaller than this, in millimetres, is too small for many phones. */
const MIN_MODULE_MM = 0.4;

/** The smallest printed size the print check names, in millimetres. */
const MIN_PRINT_MM = 10;

/** The scanning distance is this many times the size of the code. */
const DISTANCE_PER_SIZE = 10;

/** Millimeters in a centimeter. */
const MM_PER_CM = 10;

/** A whole in percent. */
const PERCENT = 100;

/** The Check tab's body, set by startCheckTab. */
let body = null;

/** The panel's functions (see panel.js). */
let actions = null;

/**
 * Sets up the Check tab.
 * @param {HTMLElement} tabBody - the body of the tab.
 * @param {Object} panelActions - the panel's functions (getState, savePrint, showLine).
 * @returns {void}
 */
export function startCheckTab(tabBody, panelActions) {
    body = tabBody;
    actions = panelActions;
    body.addEventListener('input', updatePrintSize);
    body.addEventListener('click', showProblemLine);
}

/**
 * Draws the Check tab.
 * @param {import('./state.js').EditorState} state - the editor state.
 * @returns {void}
 */
export function renderCheckTab(state) {
    body.innerHTML = renderScanSection(state.scan) + renderCodeSection(state) + renderContrastSection(state.eff || state.design)
        + renderPrintSection(state) + renderProblemSection(state.problems);
}

/**
 * Returns the mark of one condition of the scan check.
 * @param {?boolean} passed - whether the code was read, null while the check runs.
 * @returns {string} its HTML.
 */
function renderScanMark(passed) {
    if (passed == null) return '<span class="pr-mark waiting">…</span>';
    return passed ? '<span class="pr-mark good">✓</span>' : '<span class="pr-mark bad">✕</span>';
}

/**
 * Returns the result of the scan check in words.
 * @param {?Object} scan - the scan check, null while it runs.
 * @returns {string} the English sentence.
 */
function getScanHeading(scan) {
    if (!scan) return 'Checking…';
    if (scan.level === 'good') return 'Scans reliably and reads back exactly the content';
    if (scan.level === 'fair') return 'Scans, but only in good conditions';
    return scan.wrong ? 'Reads back something else than the content' : 'Does not scan';
}

/**
 * Returns the scan check: the result and its three conditions.
 * @param {?Object} scan - the scan check, null while it runs.
 * @returns {string} its HTML.
 */
function renderScanSection(scan) {
    let html = '<h3>Scan check</h3>';
    html += `<p class="scan-result" data-state="${scan ? scan.level : 'wait'}">${escapeAttribute(getScanHeading(scan))}</p><ul class="scan-list">`;
    html += `<li>${renderScanMark(scan ? scan.results.normal : null)} <span>Normal size</span></li><li>${renderScanMark(scan ? scan.results.small : null)} <span>Small (3 pixels per module)</span></li><li>${renderScanMark(scan ? scan.results.harsh : null)} <span>Blurred, with less contrast</span></li></ul>`;
    html += '<p class="muted">The editor reads its own drawing with a QR decoder (jsQR) in your browser. Test the printed code with a phone as well.</p>';
    return html;
}

/**
 * Returns the data of the code: version, error correction, fill, mask and the logo's cover.
 * @param {import('./state.js').EditorState} state - the editor state.
 * @returns {string} its HTML.
 */
function renderCodeSection(state) {
    const encoding = state.enc;
    let html = '<h3>The code</h3><dl class="values">';
    if (encoding && !encoding.error) {
        const percent = Math.round(encoding.bytes / encoding.capacity * PERCENT);
        html += `<dt>Version</dt><dd data-no-i18n>${encoding.version} (${encoding.size} × ${encoding.size})</dd>`;
        html += `<dt>Error correction</dt><dd><span data-no-i18n>${encoding.ecc}</span> - repairs about ${Math.round(RECOVERY[encoding.ecc] * PERCENT)} %</dd>`;
        html += `<dt>Data</dt><dd>${encoding.bytes} of ${encoding.capacity} bytes (${percent} %)</dd>`;
        html += `<dt>Mask</dt><dd data-no-i18n>${encoding.mask}</dd>`;
        if (state.layout && state.layout.cover) html += `<dt>Logo covers</dt><dd>${Math.round(state.layout.cover * PERCENT)} % of the modules</dd>`;
    } else html += `<dt>Version</dt><dd>-</dd>`;
    return html + '</dl>';
}

/**
 * Returns the contrast of the dark color, the second color and the eye color against the background.
 * @param {Object} design - the design the code is drawn with.
 * @returns {string} its HTML.
 */
function renderContrastSection(design) {
    let html = '<h3>Contrast</h3><dl class="values">';
    const background = design.background === 'transparent' ? '#ffffff' : design.background;
    const inks = [['Dark color', design.color]];
    if (design.gradient !== 'none' && design.color2) inks.push(['Second color', design.color2]);
    if (design['eye-color']) inks.push(['Eyes', design['eye-color']]);
    for (const [label, color] of inks) {
        const ratio = getContrast(color, background);
        html += `<dt>${escapeAttribute(label)}</dt><dd><span class="swatch" style="background:${escapeAttribute(color)}"></span><span class="swatch" style="background:${escapeAttribute(background)}"></span> <span data-no-i18n>${ratio.toFixed(1)}:1</span> ${ratio >= GOOD_CONTRAST ? '✓' : ratio >= LEAST_CONTRAST ? '!' : '✕'}</dd>`;
    }
    return html + '</dl>';
}

/**
 * Returns the print size: the fields for distance and width, and what they mean.
 * @param {import('./state.js').EditorState} state - the editor state.
 * @returns {string} its HTML.
 */
function renderPrintSection(state) {
    let html = '<h3>Print size</h3>';
    html += `<div class="form-row"><label class="field" for="p-dist"><span>Scanning distance (cm)</span><input type="number" id="p-dist" min="5" max="5000" step="5" value="${state.print.dist}" inputmode="decimal"></label><label class="field" for="p-mm"><span>Printed width (mm)</span><input type="number" id="p-mm" min="5" max="5000" step="1" value="${state.print.mm}" inputmode="decimal"></label></div>`;
    html += `<p class="print-info" id="p-info">${renderPrintInfo(state)}</p>`;
    return html;
}

/**
 * Returns every problem as a button that selects its line.
 * @param {import('./state.js').Problem[]} problems - the problems.
 * @returns {string} its HTML.
 */
function renderProblemSection(problems) {
    let html = '<h3>Problems</h3>';
    html += problems.length ? `<ul class="pr-list">${problems.map(problem => `<li class="${problem.kind === 'error' ? 'err' : problem.kind === 'info' ? 'info' : 'warn'}"><button type="button" class="pr-button" data-line="${problem.line}"><span class="kind">${problem.kind === 'error' ? '✕' : problem.kind === 'info' ? 'i' : '!'}</span><span>${escapeAttribute(problem.msg)}</span></button></li>`).join('')}</ul>` : '<p class="muted">No problems.</p>';
    return html;
}

/**
 * Returns what the print sizes mean: the smallest size for the distance, the module size for the width.
 * @param {import('./state.js').EditorState} state - the editor state.
 * @returns {string} its HTML, empty without a code.
 */
function renderPrintInfo(state) {
    if (!state.enc || state.enc.error || !state.layout) return '';
    const modules = state.layout.w;                      // modules across, with quiet zone and frame
    const minMm = Math.max(MIN_PRINT_MM, state.print.dist * MM_PER_CM / DISTANCE_PER_SIZE);
    const moduleMm = state.print.mm / modules;
    const largeEnough = moduleMm >= MIN_MODULE_MM;
    return escapeAttribute(`From ${state.print.dist} cm the code should be at least ${(minMm / MM_PER_CM).toFixed(1)} cm wide.`) + '<br>' +
        escapeAttribute(`At ${state.print.mm} mm one module is ${moduleMm.toFixed(2)} mm `) + (largeEnough ? '✓' : escapeAttribute('- below 0.4 mm many phones fail; print it larger') + ' !');
}

/**
 * Takes a new scanning distance or printed width, shows what it means and stores it.
 * @param {InputEvent} event - the input in the tab.
 * @returns {void}
 */
function updatePrintSize(event) {
    const state = actions.getState();
    if (event.target.id === 'p-dist' && +event.target.value > 0) state.print.dist = +event.target.value;
    else if (event.target.id === 'p-mm' && +event.target.value > 0) state.print.mm = +event.target.value;
    else return;
    document.querySelector('#p-info').innerHTML = renderPrintInfo(state);
    actions.savePrint();
}

/**
 * Selects the line of a clicked problem in the code (not while text in the tab is being selected).
 * @param {MouseEvent} event - the click in the tab.
 * @returns {void}
 */
function showProblemLine(event) {
    const button = event.target.closest('[data-line]');
    if (button && !String(getSelection())) actions.showLine(+button.dataset.line);
}
