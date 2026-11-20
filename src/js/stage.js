/* The stage around the drawn code: a click on the code selects the content in
   the code view, a click on the caption edits it in place (Enter or leaving the
   field writes the caption line, Escape cancels), and the scan badge opens the
   Check tab. Nothing is edited in the viewer. */

import { state, ui, areas, NARROW_SCREEN, getElements } from './state.js?v=2';
import { translate } from './translate.js?v=2';
import { VIEWER } from './sync.js?v=23';
import { setKey } from './qrdoc.js?v=4';
import { getTextWidth } from './drawing.js?v=3';
import { editCode } from './history.js?v=3';
import { showInCode } from './codeview.js?v=3';
import { showPane } from './panes.js?v=3';

/** The font size of the caption field when the caption's own size is unknown, in pixels. */
const DEFAULT_FONT_SIZE = 16;

/** The smallest font size of the caption field, in pixels. */
const MIN_FONT_SIZE = 12;

/** The caption size in module units when the layout has none. */
const DEFAULT_CAPTION_SIZE = 2;

/** How far the caption field reaches beyond the caption, in pixels: left (at least 4 from the stage), up, and in width and height. */
const FIELD_LEFT_OVERHANG = 20;
const FIELD_MIN_LEFT = 4;
const FIELD_TOP_OVERHANG = 6;
const FIELD_EXTRA_WIDTH = 40;
const FIELD_EXTRA_HEIGHT = 12;

/** The narrowest caption field, in pixels. */
const FIELD_MIN_WIDTH = 160;

/**
 * Opens the Check tab from the scan badge and takes clicks on the stage.
 * @returns {void}
 */
export function startStage() {
    ui.scanBadge.addEventListener('click', showScanDetails);
    ui.stage.addEventListener('click', handleStageClick);
}

/**
 * Shows the Check tab with the details of the scan check (the side pane on a narrow screen).
 * @returns {void}
 */
function showScanDetails() {
    if (NARROW_SCREEN.matches) showPane('properties');
    areas.panel.showTab('check');
}

/**
 * Edits the caption when it is clicked, and selects the content in the code when the code is clicked.
 * @param {MouseEvent} event - the click on the stage.
 * @returns {void}
 */
function handleStageClick(event) {
    if (VIEWER) return;
    const text = event.target.closest('text');
    if (text) { editCaption(text, event.clientX); return; }
    if (!event.target.closest('svg') || NARROW_SCREEN.matches) return;
    const contentStart = state.doc.header ? state.doc.contentStart : 0;
    showInCode(contentStart, true, contentStart + state.content.length);
}

/**
 * Edits the caption in place: a field over the caption, the cursor where the click was.
 * @param {SVGTextElement} textElement - the line of the caption that was clicked.
 * @param {number} clickX - where the click was, in client pixels.
 * @returns {void}
 */
function editCaption(textElement, clickX) {
    const textBox = textElement.getBoundingClientRect();
    const input = createCaptionInput(textElement, textBox);
    ui.stage.append(input);
    const texts = getElements('#qr-view svg text');
    texts.forEach(text => { text.style.visibility = 'hidden'; });
    input.focus();
    const cursor = getCaptionCursor(texts, textElement, textBox, clickX);
    input.setSelectionRange(cursor, cursor);
    watchCaptionInput(input, texts);
}

/**
 * Creates the field that edits the caption, placed and sized over the clicked line.
 * @param {SVGTextElement} textElement - the line of the caption that was clicked.
 * @param {DOMRect} textBox - where that line is on the screen.
 * @returns {HTMLInputElement} the field, not yet in the page.
 */
function createCaptionInput(textElement, textBox) {
    const stageBox = ui.stage.getBoundingClientRect();
    const input = document.createElement('input');
    input.className = 'title-edit';
    input.value = state.design.caption;
    input.setAttribute('aria-label', translate('Caption'));
    input.setAttribute('data-no-i18n', '');
    const fontSize = parseFloat(getComputedStyle(textElement).fontSize) || DEFAULT_FONT_SIZE;
    const pixelsPerModule = ui.codeView.getBoundingClientRect().width / state.layout.w;
    const captionSize = state.layout.items.find(item => item.t === 'text')?.size || DEFAULT_CAPTION_SIZE;
    input.style.cssText = `left:${Math.max(FIELD_MIN_LEFT, textBox.left - stageBox.left - FIELD_LEFT_OVERHANG)}px;top:${textBox.top - stageBox.top - FIELD_TOP_OVERHANG}px;width:${Math.max(FIELD_MIN_WIDTH, textBox.width + FIELD_EXTRA_WIDTH)}px;height:${textBox.height + FIELD_EXTRA_HEIGHT}px;font-size:${Math.max(MIN_FONT_SIZE, Math.min(fontSize, captionSize * pixelsPerModule))}px`;
    return input;
}

/**
 * Returns where the cursor goes in the caption: before or after the character that was hit
 * (nearest gap) in the line that was clicked; a caption on two lines is one text broken at a space.
 * @param {SVGTextElement[]} texts - the lines of the caption.
 * @param {SVGTextElement} textElement - the line that was clicked.
 * @param {DOMRect} textBox - where that line is on the screen.
 * @param {number} clickX - where the click was, in client pixels.
 * @returns {number} the offset in the whole caption.
 */
function getCaptionCursor(texts, textElement, textBox, clickX) {
    const lineIndex = Math.max(0, texts.indexOf(textElement)), lines = texts.map(text => text.textContent);
    const before = lines.slice(0, lineIndex).reduce((total, line) => total + line.length + 1, 0);
    const lineText = lines[lineIndex] || '';
    const scale = textBox.width / (getTextWidth(lineText) || 1);
    let offset = 0, best = Infinity;
    for (let i = 0; i <= lineText.length; i++) {
        const distance = Math.abs(textBox.left + getTextWidth(lineText.slice(0, i)) * scale - clickX);
        if (distance < best) { best = distance; offset = i; }
    }
    return before + offset;
}

/**
 * Ends the caption edit on Enter or leaving the field (writes the caption line, one undo step)
 * and on Escape (cancels).
 * @param {HTMLInputElement} input - the caption field.
 * @param {SVGTextElement[]} texts - the hidden lines of the caption.
 * @returns {void}
 */
function watchCaptionInput(input, texts) {
    let done = false;
    /**
     * Removes the field, shows the caption again and writes it when it is kept and changed.
     * @param {boolean} keep - write the caption (false cancels).
     * @returns {void}
     */
    const stopRenameEdit = keep => {
        if (done) return;
        done = true;
        const value = input.value.replace(/[\r\n]+/g, ' ');
        input.remove();
        texts.forEach(text => { text.style.visibility = ''; });
        if (keep && value !== state.design.caption) editCode(setKey(state.code, 'caption', value.trim() ? value : ''));
    };
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); stopRenameEdit(true); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopRenameEdit(false); }
    });
    input.addEventListener('blur', () => stopRenameEdit(true));
}
