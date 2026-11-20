/* The Design tab of the side panel: colors and gradient, module and eye shapes,
   the logo, caption and frame, error correction and size. Every control writes
   its design line through the panel's functions; the tab is drawn again from the
   document after each change, keeping the focus on the control in use. */

import { KEYS, ICONS } from './qrdoc.js?v=4';
import { RECOVERY, MAX_VERSION } from './render.js?v=4';
import { escapeAttribute, renderSymbolPicture, MODULE_PICTURES, FRAME_PICTURES, BALL_PICTURES, PICKER_LABELS, CHOICE_NAMES } from './panel-html.js?v=2';

/** The second color a gradient starts with. */
const DEFAULT_SECOND_COLOR = '#2c55c9';

/** A color typed into a text field: #rgb or #rrggbb. */
const TYPED_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The largest quiet zone, in modules. */
const MAX_MARGIN = 20;

/** The side of a version's code in modules is SIZE_BASE + SIZE_STEP × version (ISO/IEC 18004). */
const SIZE_BASE = 17;
const SIZE_STEP = 4;

/** The number of QR mask patterns, numbered from 0. */
const MASK_COUNT = 8;

/** A whole in percent. */
const PERCENT = 100;

/** The Design tab's body, set by startDesignTab. */
let body = null;

/** The panel's functions (see panel.js). */
let actions = null;

/**
 * Sets up the Design tab.
 * @param {HTMLElement} tabBody - the body of the tab.
 * @param {Object} panelActions - the panel's functions (getState, setKey, setKeys, resetDesign, openLogoChoice).
 * @returns {void}
 */
export function startDesignTab(tabBody, panelActions) {
    body = tabBody;
    actions = panelActions;
    body.addEventListener('click', handleDesignClick);
    body.addEventListener('input', handleDesignInput);
    body.addEventListener('change', handleDesignChange);
}

/**
 * Draws the Design tab from the document; the control that has the focus keeps it.
 * @param {import('./state.js').EditorState} state - the editor state.
 * @returns {void}
 */
export function renderDesignTab(state) {
    const design = state.design;
    const focusedId = document.activeElement && body.contains(document.activeElement) ? document.activeElement.id : null;
    body.innerHTML = renderColorSection(design, state.type === 'swiss') + renderShapeSection(design, !!state.doc.set['eye-color'])
        + renderLogoSection(design) + renderCaptionSection(design) + renderCodeSection(design);
    if (focusedId) body.querySelector('#' + CSS.escape(focusedId))?.focus();
}

/**
 * Returns a color field: a color picker and a text field for the same design key.
 * @param {string} key - the design key.
 * @param {string} label - the label.
 * @param {string} value - the color.
 * @param {string} [extra=''] - further attributes of both inputs (e.g. " disabled").
 * @returns {string} its HTML.
 */
function renderColorField(key, label, value, extra = '') {
    return `<label class="field color" for="d-${key}"><span>${label}</span><span class="color-row"><input type="color" id="dc-${key}" data-key="${key}" value="${escapeAttribute(value || '#000000')}" aria-label="${label}"${extra}><input type="text" id="d-${key}" data-key="${key}" class="mono" value="${escapeAttribute(value)}" maxlength="11" spellcheck="false"${extra} data-no-i18n></span></label>`;
}

/**
 * Returns a picker of shapes: one radio button with a small picture per value.
 * @param {string} key - the design key.
 * @param {string[]} values - the values to choose from.
 * @param {Object<string, string>} pictures - the SVG content of each value's picture.
 * @param {string} current - the value chosen.
 * @returns {string} its HTML.
 */
function renderShapePicker(key, values, pictures, current) {
    return `<div class="choice-grid" role="radiogroup" aria-label="${escapeAttribute(PICKER_LABELS[key])}">${values.map(value => `<button type="button" role="radio" class="choice" data-key="${key}" data-val="${value}" aria-checked="${value === current}" title="${escapeAttribute(CHOICE_NAMES[value] || value)}"><svg viewBox="0 0 22 22" aria-hidden="true" fill="currentColor">${pictures[value]}</svg><span>${escapeAttribute(CHOICE_NAMES[value] || value)}</span></button>`).join('')}</div>`;
}

/**
 * Returns the colors: dark color, background, transparency, gradient and its angle
 * (with the note that a Swiss QR bill ignores them).
 * @param {Object} design - the design of the document.
 * @param {boolean} isSwiss - the content is a Swiss QR bill.
 * @returns {string} its HTML.
 */
function renderColorSection(design, isSwiss) {
    const hasGradient = design.gradient !== 'none';
    const transparent = design.background === 'transparent';
    let html = '';
    if (isSwiss) html += '<p class="hint swiss-hint">A Swiss QR bill is always drawn as the standard requires: black squares on white, the Swiss cross, error correction M. These settings apply to the other codes.</p>';
    html += '<h3>Colors</h3>';
    html += `<div class="form-row">${renderColorField('color', 'Dark color', design.color)}${renderColorField('background', 'Background', transparent ? '#ffffff' : design.background, transparent ? ' disabled' : '')}</div>`;
    html += `<label class="box form-box"><input type="checkbox" id="d-transparent"${transparent ? ' checked' : ''}> <span>Transparent background</span></label>`;
    html += `<div class="form-row"><label class="field" for="d-gradient"><span>Gradient</span><select id="d-gradient" data-key="gradient"><option value="none"${!hasGradient ? ' selected' : ''}>None</option><option value="linear"${design.gradient === 'linear' ? ' selected' : ''}>Linear</option><option value="radial"${design.gradient === 'radial' ? ' selected' : ''}>Radial</option></select></label>${renderColorField('color2', 'Second color', design.color2 || DEFAULT_SECOND_COLOR, hasGradient ? '' : ' disabled')}</div>`;
    html += `<label class="field slider${hasGradient && design.gradient === 'linear' ? '' : ' off'}" for="d-angle"><span>Angle <output data-no-i18n>${escapeAttribute(design.angle)}°</output></span><input type="range" id="d-angle" data-key="angle" min="0" max="360" step="5" value="${escapeAttribute(design.angle)}"${hasGradient && design.gradient === 'linear' ? '' : ' disabled'}></label>`;
    return html;
}

/**
 * Returns the shapes: modules, eye frame and center, and the eye color.
 * @param {Object} design - the design of the document.
 * @param {boolean} ownEye - the document sets its own eye color.
 * @returns {string} its HTML.
 */
function renderShapeSection(design, ownEye) {
    let html = '';
    html += '<h3>Modules</h3>' + renderShapePicker('modules', KEYS.modules.values, MODULE_PICTURES, design.modules);
    html += '<h3>Eyes</h3><p class="muted subtitle">Frame</p>' + renderShapePicker('eye-frame', KEYS['eye-frame'].values, FRAME_PICTURES, design['eye-frame']);
    html += '<p class="muted subtitle">Center</p>' + renderShapePicker('eye-ball', KEYS['eye-ball'].values, BALL_PICTURES, design['eye-ball']);
    html += `<label class="box form-box"><input type="checkbox" id="d-own-eye"${ownEye ? ' checked' : ''}> <span>Own color for the eyes</span></label>`;
    html += `<div class="form-row one">${renderColorField('eye-color', 'Eye color', design['eye-color'] || design.color, ownEye ? '' : ' disabled')}</div>`;
    return html;
}

/**
 * Returns the logo: none, the built-in symbols, an own picture, its size and clearing.
 * @param {Object} design - the design of the document.
 * @returns {string} its HTML.
 */
function renderLogoSection(design) {
    const hasPicture = design.logo.startsWith('data:');
    let html = '';
    html += '<h3>Logo</h3><div class="choice-grid logos" role="radiogroup" aria-label="Logo">';
    html += `<button type="button" role="radio" class="choice" data-key="logo" data-val="none" aria-checked="${design.logo === 'none'}" title="No logo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>None</span></button>`;
    html += ICONS.map(k => `<button type="button" role="radio" class="choice" data-key="logo" data-val="${k}" aria-checked="${design.logo === k}" title="${escapeAttribute(CHOICE_NAMES[k])}">${renderSymbolPicture(k)}<span>${escapeAttribute(CHOICE_NAMES[k])}</span></button>`).join('');
    html += `<button type="button" role="radio" class="choice" id="d-logo-pic" aria-checked="${hasPicture}" title="Your own picture (PNG, JPEG, SVG, WebP) - it becomes part of the document">${hasPicture ? `<img src="${escapeAttribute(design.logo.replace(/\s+/g, ''))}" alt="">` : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m4 18 5-6 4 4 3-3 4 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'}<span>Picture…</span></button></div>`;
    const noLogo = design.logo === 'none';
    html += `<label class="field slider${noLogo ? ' off' : ''}" for="d-logo-size"><span>Logo size <output data-no-i18n>${escapeAttribute(design['logo-size'])} %</output></span><input type="range" id="d-logo-size" data-key="logo-size" min="5" max="30" step="1" value="${escapeAttribute(design['logo-size'])}"${noLogo ? ' disabled' : ''}></label>`;
    html += `<label class="box form-box${noLogo ? ' off' : ''}"><input type="checkbox" id="d-logo-clear"${design['logo-clear'] !== 'no' ? ' checked' : ''}${noLogo ? ' disabled' : ''}> <span>Remove the modules behind the logo</span></label>`;
    return html;
}

/**
 * Returns the caption and the frame.
 * @param {Object} design - the design of the document.
 * @returns {string} its HTML.
 */
function renderCaptionSection(design) {
    let html = '';
    html += '<h3>Caption and frame</h3>';
    html += `<label class="field" for="d-caption"><span>Caption</span><input type="text" id="d-caption" data-key="caption" value="${escapeAttribute(design.caption)}" maxlength="120" placeholder="Scan me" data-no-i18n></label>`;
    html += `<div class="form-row"><label class="field" for="d-caption-position"><span>Position</span><select id="d-caption-position" data-key="caption-position"><option value="below"${design['caption-position'] === 'below' ? ' selected' : ''}>Below the code</option><option value="above"${design['caption-position'] === 'above' ? ' selected' : ''}>Above the code</option></select></label>`;
    html += `<label class="field" for="d-frame"><span>Frame</span><select id="d-frame" data-key="frame"><option value="none"${design.frame === 'none' ? ' selected' : ''}>None</option><option value="line"${design.frame === 'line' ? ' selected' : ''}>Line</option><option value="filled"${design.frame === 'filled' ? ' selected' : ''}>Filled</option></select></label></div>`;
    html += `<div class="form-row one">${renderColorField('frame-color', 'Frame and caption color', design['frame-color'] || design.color)}</div>`;
    return html;
}

/**
 * Returns error correction, quiet zone, version, mask, boost and the reset button.
 * @param {Object} design - the design of the document.
 * @returns {string} its HTML.
 */
function renderCodeSection(design) {
    let html = '';
    html += '<h3>Error correction and size</h3>';
    html += `<div class="form-row"><label class="field" for="d-ecc"><span>Error correction</span><select id="d-ecc" data-key="ecc">${['L', 'M', 'Q', 'H'].map(k => `<option value="${k}"${design.ecc === k ? ' selected' : ''}>${k} - ${Math.round(RECOVERY[k] * PERCENT)} %</option>`).join('')}</select></label>`;
    html += `<label class="field" for="d-margin"><span>Quiet zone (modules)</span><input type="number" id="d-margin" data-key="margin" min="0" max="${MAX_MARGIN}" step="1" value="${escapeAttribute(design.margin)}" inputmode="numeric"></label></div>`;
    html += `<div class="form-row"><label class="field" for="d-version"><span>Smallest version</span><select id="d-version" data-key="version"><option value="auto">Automatic</option>${Array.from({ length: MAX_VERSION }, (_, i) => `<option value="${i + 1}"${design.version === String(i + 1) ? ' selected' : ''}>${i + 1} (${SIZE_BASE + SIZE_STEP * (i + 1)} × ${SIZE_BASE + SIZE_STEP * (i + 1)})</option>`).join('')}</select></label>`;
    html += `<label class="field" for="d-mask"><span>Mask</span><select id="d-mask" data-key="mask"><option value="auto">Automatic</option>${Array.from({ length: MASK_COUNT }, (_, i) => `<option value="${i}"${design.mask === String(i) ? ' selected' : ''}>${i}</option>`).join('')}</select></label></div>`;
    html += `<label class="box form-box"><input type="checkbox" id="d-boost"${design.boost !== 'no' ? ' checked' : ''}> <span>Use a higher error correction when it fits in the same size</span></label>`;
    html += '<div class="button-row one"><button type="button" class="button" id="d-reset" title="Removes all design lines - &quot;Undo&quot; brings them back">Reset the design</button></div>';
    return html;
}

/**
 * Takes a click on a shape or logo choice (a built-in logo raises the error correction),
 * on "Picture…" and on "Reset the design".
 * @param {MouseEvent} event - the click in the tab.
 * @returns {void}
 */
function handleDesignClick(event) {
    const choice = event.target.closest('.choice[data-key]');
    if (choice) { actions.setKey(choice.dataset.key, choice.dataset.val); if (choice.dataset.key === 'logo' && choice.dataset.val !== 'none') setLogoErrorCorrection(); return; }
    if (event.target.closest('#d-logo-pic')) { actions.openLogoChoice(); return; }
    if (event.target.closest('#d-reset')) actions.resetDesign();
}

/**
 * Sets error correction H for a logo unless the document chose Q or H.
 * @returns {void}
 */
function setLogoErrorCorrection() {
    const state = actions.getState();
    if (!state.doc.set.ecc || state.design.ecc === 'L' || state.design.ecc === 'M') actions.setKey('ecc', 'H');
}

/**
 * Writes what is being typed or dragged (colors, sliders, caption, quiet zone) as a continuous change.
 * @param {InputEvent} event - the input in the tab.
 * @returns {void}
 */
function handleDesignInput(event) {
    const input = event.target, key = input.dataset.key;
    if (!key) return;
    if (input.type === 'color') { const textField = body.querySelector(`#d-${CSS.escape(key)}`); if (textField) textField.value = input.value; actions.setKey(key, input.value, true); return; }
    if (input.type === 'range') { const output = input.closest('label').querySelector('output'); if (output) output.textContent = input.value + (key === 'angle' ? '°' : ' %'); actions.setKey(key, input.value, true); return; }
    if (input.type === 'text' && key === 'caption') { actions.setKey(key, input.value.replace(/[\r\n]+/g, ' '), true); return; }
    if (input.type === 'text' && TYPED_COLOR.test(input.value.trim())) writeTypedColor(input, key);
    if (input.type === 'number' && input.value !== '') actions.setKey(key, String(Math.max(0, Math.min(MAX_MARGIN, Math.round(+input.value)))), true);
}

/**
 * Writes a color typed into a text field and shows it in its color picker.
 * @param {HTMLInputElement} input - the text field.
 * @param {string} key - the design key.
 * @returns {void}
 */
function writeTypedColor(input, key) {
    const color = input.value.trim();
    actions.setKey(key, color.toLowerCase(), true);
    const picker = body.querySelector(`#dc-${CSS.escape(key)}`);
    if (picker) picker.value = color.length === 4 ? '#' + [...color.slice(1)].map(digit => digit + digit).join('') : color;
}

/**
 * Writes the checkboxes and selects of the tab (one undo step each); a gradient chosen without a
 * second color gets one.
 * @param {Event} event - the change in the tab.
 * @returns {void}
 */
function handleDesignChange(event) {
    const input = event.target;
    if (input.id === 'd-transparent') { actions.setKey('background', input.checked ? 'transparent' : '#ffffff'); return; }
    if (input.id === 'd-own-eye') { actions.setKey('eye-color', input.checked ? actions.getState().design.color : ''); return; }
    if (input.id === 'd-logo-clear') { actions.setKey('logo-clear', input.checked ? '' : 'no'); return; }
    if (input.id === 'd-boost') { actions.setKey('boost', input.checked ? '' : 'no'); return; }
    if (input.tagName !== 'SELECT' || !input.dataset.key) return;
    const key = input.dataset.key, value = input.value;
    if (key === 'gradient' && value !== 'none' && !actions.getState().doc.set.color2) actions.setKeys({ gradient: value, color2: DEFAULT_SECOND_COLOR });
    else actions.setKey(key, value === KEYS[key].def && key !== 'ecc' ? '' : value);
}
