/* The Content tab of the side panel: the kind of content and its form. The
   form is made from the content (payload.js parseContent) and writes the content
   in the canonical form of its type (buildContent) on every change. While the
   user types in it, it is not made anew, so the cursor stays where it is;
   fields that do not apply are disabled, not hidden, so nothing moves. */

import { TYPES, TYPE_NAMES, parseContent, buildContent } from './payload.js?v=5';
import { FIELDS } from './payload-fields.js?v=2';
import { STARTERS } from './samples.js?v=3';
import { escapeAttribute } from './panel-html.js?v=2';

/** What each kind of content does on a phone, shown below the kind. */
const TYPE_HINTS = {
    link: 'The code opens this address. A link shortener or redirect service makes the code depend on that service - the editor warns about it.',
    text: 'Any text; phones show it as it is.',
    wifi: 'Phones join the network when the code is scanned (Android, iPhone with iOS 11 and later).',
    contact: 'vCard is read by all phones; MeCard makes a smaller code with fewer fields.',
    email: 'Opens a new email with address, subject and text.',
    sms: 'Opens a text message to this number.',
    phone: 'Offers to call this number - with the country code it works everywhere.',
    location: 'Opens the place in the map app.',
    event: 'Adds the event to the calendar (times are local times).',
    crypto: 'A payment request for wallet apps.',
    epc: 'For banking apps in the euro area (SEPA credit transfer, EPC GiroCode). Error correction M as the standard requires.',
    swiss: 'The QR code of a Swiss QR bill (Implementation Guidelines 2.3 / 2.4). Drawn with the Swiss cross and error correction M; print it 46 × 46 mm.',
};

/** The Content tab's body, set by startContentTab. */
let body = null;

/** The panel's functions (see panel.js). */
let actions = null;

/** Draws the whole panel again (the tab shown). */
let renderPanel = null;

/** The content the form was made from or wrote last; null makes the form anew. */
let formContent = null;

/**
 * A field of a content form (payload-fields.js).
 * @typedef {Object} FormField
 * @property {string} k - the key of the field in the parsed content.
 * @property {string} label - its label.
 * @property {string} kind - "text", "area", "select", "check" or "datetime".
 * @property {Array<[string, string]>} [opts] - the options of a select: value and label.
 * @property {string} [ph] - the placeholder.
 * @property {string} [mode] - the input mode.
 * @property {number} [max] - the most characters.
 * @property {boolean} [mono] - shown in the code font.
 * @property {boolean} [half] - half the width, next to another half field.
 * @property {function(Object): boolean} [show] - whether the field applies to the form's values.
 */

/**
 * Sets up the Content tab.
 * @param {HTMLElement} tabBody - the body of the tab.
 * @param {Object} panelActions - the panel's functions (getState, setContent, writeReference).
 * @param {function(boolean=): void} render - draws the whole panel again.
 * @returns {void}
 */
export function startContentTab(tabBody, panelActions, render) {
    body = tabBody;
    actions = panelActions;
    renderPanel = render;
    body.addEventListener('change', handleFormChange);
    body.addEventListener('input', handleFormInput);
    body.addEventListener('click', writeReferenceOnClick);
}

/**
 * Lets the next drawing make the form anew from the content.
 * @returns {void}
 */
export function resetForm() {
    formContent = null;
}

/**
 * Draws the Content tab: the kind of content, its hint, the form and the size of the content.
 * The form is kept while it shows the current content, and while the user types in it.
 * @param {import('./state.js').EditorState} state - the editor state.
 * @param {boolean} force - make the form anew in any case.
 * @returns {void}
 */
export function renderContentTab(state, force) {
    const typing = body.contains(document.activeElement) && document.activeElement.matches('input, textarea');
    if (!force && formContent === state.content && body.dataset.type === state.type && body.firstChild) { updateEnabledFields(state.type); return; }
    if (!force && typing && body.dataset.type === state.type && formContent !== null) return;
    formContent = state.content;
    body.dataset.type = state.type;
    body.innerHTML = renderContentForm(state);
    updateEnabledFields(state.type);
}

/**
 * Returns the HTML of the Content tab.
 * @param {import('./state.js').EditorState} state - the editor state.
 * @returns {string} the kind, the hint, the form, the reference buttons of payments and the size.
 */
function renderContentForm(state) {
    const values = parseContent(state.type, state.content);
    const fields = FIELDS[state.type] || [];
    let html = `<label class="field type-choice"><span>Kind of content</span><select id="content-type">${TYPES.map(type => `<option value="${type}"${type === state.type ? ' selected' : ''}>${escapeAttribute(TYPE_NAMES[type])}</option>`).join('')}</select></label>`;
    html += `<p class="muted type-hint">${escapeAttribute(TYPE_HINTS[state.type] || '')}</p><div class="form">`;
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        if (field.half && fields[i + 1]?.half) { html += `<div class="form-row">${renderField(field, values)}${renderField(fields[i + 1], values)}</div>`; i++; }
        else html += `<div class="form-row one">${renderField(field, values)}</div>`;
    }
    html += '</div>';
    if (state.type === 'swiss' || state.type === 'epc') html += `<div class="button-row two ref-buttons"><button type="button" class="button small" data-ref="qrr"${state.type === 'epc' ? ' disabled' : ''}>Make a QR reference from a number</button><button type="button" class="button small" data-ref="scor">Make an RF reference from a number</button></div>`;
    html += `<p class="muted content-size">${escapeAttribute(getSizeText(state))}</p>`;
    return html;
}

/**
 * Returns one field of a form with its label.
 * @param {FormField} field - the field.
 * @param {Object} values - the parsed content.
 * @returns {string} its HTML.
 */
function renderField(field, values) {
    const value = values[field.k] ?? '';
    const id = 'f-' + field.k;
    const attributes = `id="${id}" data-k="${field.k}"${field.max ? ` maxlength="${field.max}"` : ''}${field.mode ? ` inputmode="${field.mode === 'url' ? 'url' : field.mode}"` : ''}${field.ph ? ` placeholder="${escapeAttribute(field.ph)}"` : ''} spellcheck="false" autocomplete="off"`;
    if (field.kind === 'check') return `<label class="box form-box"><input type="checkbox" ${attributes}${value ? ' checked' : ''}> <span>${escapeAttribute(field.label)}</span></label>`;
    return `<label class="field" for="${id}"><span>${escapeAttribute(field.label)}</span>${renderInput(field, value, values, attributes)}</label>`;
}

/**
 * Returns the input of a field: a text area, a select, a date or a text input.
 * @param {FormField} field - the field.
 * @param {*} value - its value.
 * @param {Object} values - the parsed content (all-day events show dates).
 * @param {string} attributes - the attributes every input of the field has.
 * @returns {string} its HTML.
 */
function renderInput(field, value, values, attributes) {
    if (field.kind === 'area') return `<textarea ${attributes} rows="3" data-no-i18n>${escapeAttribute(value)}</textarea>`;
    if (field.kind === 'select') return `<select ${attributes}>${field.opts.map(([optionValue, label]) => `<option value="${escapeAttribute(optionValue)}"${optionValue === value ? ' selected' : ''}>${escapeAttribute(label)}</option>`).join('')}</select>`;
    if (field.kind === 'datetime') return `<input type="${values.allday ? 'date' : 'datetime-local'}" ${attributes} value="${escapeAttribute(values.allday ? String(value).slice(0, 10) : value)}">`;
    return `<input type="text" ${attributes} class="${field.mono ? 'mono' : ''}" value="${escapeAttribute(value)}" data-no-i18n>`;
}

/**
 * Returns the values of the form on screen.
 * @param {string} type - the content type of the form.
 * @returns {Object} the value of each field (checkboxes as booleans).
 */
function readForm(type) {
    const values = {};
    for (const field of FIELDS[type] || []) {
        const input = body.querySelector(`[data-k="${field.k}"]`);
        if (!input) continue;
        values[field.k] = field.kind === 'check' ? input.checked : input.value;
    }
    return values;
}

/**
 * Disables the fields that do not apply to the form's values and shows the size of the content.
 * @param {string} type - the content type of the form.
 * @returns {void}
 */
function updateEnabledFields(type) {
    const values = readForm(type);
    for (const field of FIELDS[type] || []) {
        const input = body.querySelector(`[data-k="${field.k}"]`);
        if (!input) continue;
        const applies = !field.show || field.show(values);
        input.disabled = !applies;
        input.closest('label')?.classList.toggle('off', !applies);
    }
    const sizeLine = body.querySelector('.content-size');
    if (sizeLine) sizeLine.textContent = getSizeText(actions.getState());
}

/**
 * Returns the size of the content and of the code.
 * @param {import('./state.js').EditorState} state - the editor state.
 * @returns {string} bytes, and version and modules when there is a code.
 */
function getSizeText(state) {
    const bytes = new TextEncoder().encode(state.content).length;
    const byteText = `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
    return state.enc && !state.enc.error ? `${byteText} · version ${state.enc.version} (${state.enc.size} × ${state.enc.size} modules)` : byteText;
}

/**
 * Takes a change of the form: another kind starts with its example content (one undo step),
 * all-day redraws the form, selects, checkboxes and dates write the content.
 * @param {Event} event - the change in the tab.
 * @returns {void}
 */
function handleFormChange(event) {
    const state = actions.getState();
    if (event.target.id === 'content-type') {
        const type = event.target.value;
        if (type === state.type) return;
        actions.setContent(STARTERS[type] ?? '', false, `${TYPE_NAMES[type]} - "Undo" brings the previous content back`);
        renderPanel(true);
        return;
    }
    if (event.target.matches('[data-k="allday"]')) { writeForm(); renderPanel(true); return; }
    if (event.target.matches('select, input[type=checkbox], input[type=date], input[type=datetime-local]')) writeForm();
}

/**
 * Writes the content while the user types in a text field of the form (one undo step after a pause).
 * @param {InputEvent} event - the input in the tab.
 * @returns {void}
 */
function handleFormInput(event) {
    if (event.target.matches('input[type=text], textarea')) writeForm(true);
}

/**
 * Writes a payment reference with check digits when its button is clicked.
 * @param {MouseEvent} event - the click in the tab.
 * @returns {void}
 */
function writeReferenceOnClick(event) {
    const button = event.target.closest('[data-ref]');
    if (!button) return;
    actions.writeReference(button.dataset.ref);
}

/**
 * Writes the content of the form on screen into the document.
 * @param {boolean} [merge=false] - part of typing; one undo step when the user pauses.
 * @returns {void}
 */
function writeForm(merge = false) {
    const state = actions.getState();
    // The form on screen decides: typing can change the detected kind before the form is made anew.
    const type = body.dataset.type || state.type;
    const content = buildContent(type, readForm(type));
    formContent = content;
    updateEnabledFields(type);
    actions.setContent(content, merge);
}
