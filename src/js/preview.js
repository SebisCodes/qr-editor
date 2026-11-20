/* The code on the stage: the same SVG as the export, sized to fit the stage,
   with the scan badge (the result of the scan check) and a line about the code
   (type, version, size, error correction) below it. */

import { state, ui } from './state.js?v=2';
import { translate } from './translate.js?v=2';
import { TYPE_NAMES } from './payload.js?v=5';
import { renderSvg } from './draw.js?v=3';

/** The padding around the code on the stage, in pixels: at least, at most and as share of the width. */
const PADDING_MIN = 16;
const PADDING_MAX = 48;
const PADDING_SHARE = 0.06;

/**
 * Keeps the code fitted to the stage when the stage changes its size.
 * @returns {void}
 */
export function startPreview() {
    new ResizeObserver(() => resizePreview()).observe(ui.stage);
}

/**
 * Shows the state of the scan check at the badge and the line about the code.
 * @returns {void}
 */
export function renderBadge() {
    const badge = ui.scanBadge;
    badge.dataset.state = getBadgeState();
    ui.scanBadgeText.textContent = getBadgeText();
    badge.title = translate('Show the details of the scan check');
    ui.codeInfo.textContent = getCodeInfo();
}

/**
 * Returns the state of the scan badge.
 * @returns {string} "fail" without a code, "wait" while the check runs, else the level of the check.
 */
function getBadgeState() {
    if (!state.layout) return 'fail';
    return !state.scan ? 'wait' : state.scan.level;
}

/**
 * Returns the text of the scan badge.
 * @returns {string} the translated result of the scan check.
 */
function getBadgeText() {
    const scan = state.scan;
    if (!state.layout) return translate('No code');
    if (!scan) return translate('Checking…');
    if (scan.level === 'good') return translate('Scans');
    return scan.level === 'fair' ? translate('Scans in good conditions') : translate('Does not scan');
}

/**
 * Returns the line about the code below the stage.
 * @returns {string} type, version, size and error correction, empty without a code.
 */
function getCodeInfo() {
    const encoding = state.enc;
    if (!encoding || encoding.error) return '';
    return `${TYPE_NAMES[state.type] ? translate(TYPE_NAMES[state.type]) : ''} · ${translate('version')} ${encoding.version} · ${encoding.size} × ${encoding.size} · ${translate('error correction')} ${encoding.ecc}`;
}

/**
 * Draws the code on the stage, or the note why there is none.
 * @returns {void}
 */
export function renderPreview() {
    if (!state.layout) {
        ui.codeView.innerHTML = '';
        ui.emptyNote.hidden = false;
        ui.emptyNote.textContent = state.enc?.error ? translate(state.enc.error) : translate('Type the content below the line --- in the code, or choose a type under Edit.');
        return;
    }
    ui.emptyNote.hidden = !!state.content || !!state.layout;
    ui.codeView.innerHTML = renderSvg(state.layout, { width: '100%', height: '100%', title: state.name });
    resizePreview();
}

/**
 * Sizes the drawn code to fill the stage, keeping its proportions and a padding.
 * @returns {void}
 */
export function resizePreview() {
    if (!state.layout) return;
    const stageBox = ui.stage.getBoundingClientRect();
    const padding = Math.max(PADDING_MIN, Math.min(PADDING_MAX, stageBox.width * PADDING_SHARE));
    const scale = Math.max(1, Math.min((stageBox.width - 2 * padding) / state.layout.w, (stageBox.height - 2 * padding) / state.layout.h));
    ui.codeView.style.width = Math.floor(state.layout.w * scale) + 'px';
    ui.codeView.style.height = Math.floor(state.layout.h * scale) + 'px';
}
