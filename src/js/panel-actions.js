/* What the side panel may do to the document (panel.js): set design keys and
   the content (each one undo step; a continuous change while dragging or typing
   becomes one step when the user pauses), reset the design, pick a logo picture,
   and write a payment reference with its check digits. */

import { state, areas } from './state.js?v=2';
import { translate } from './translate.js?v=2';
import { showToast } from './toast.js?v=2';
import { setKey, setKeys, setContent, resetDesign, KEYS } from './qrdoc.js?v=4';
import { parseContent, buildContent } from './payload.js?v=5';
import { buildQrReference, buildCreditorReference } from './payload-bank.js?v=2';
import { editCode } from './history.js?v=6';
import { showLine } from './codeview.js?v=6';
import { saveEditorState } from './documents.js?v=6';
import { openLogoChoice } from './logo.js?v=6';

/** The prefix of a creditor reference: RF and its two check digits. */
const CREDITOR_PREFIX = /^RF\d\d/i;

/** The number a creditor reference is made from when the field holds none. */
const DEFAULT_REFERENCE_BASE = '1';

/** Design keys that stay written when they hold their default value. */
const KEYS_KEPT_AT_DEFAULT = ['ecc'];

/**
 * Returns the functions the side panel calls.
 * @returns {Object} getState, setKey, setKeys, setContent, resetDesign, openLogoChoice, showLine, savePrint, writeReference, isEditing.
 */
export function getPanelActions() {
    return {
        getState: () => state,
        setKey: setPanelKey,
        setKeys: pairs => editCode(setKeys(state.code, pairs)),
        setContent: setPanelContent,
        resetDesign: () => editCode(resetDesign(state.code), { msg: translate('Design reset - "Undo" brings it back') }),
        openLogoChoice,
        showLine,
        savePrint: saveEditorState,
        writeReference,
        isEditing: () => !!state.panelEdit,
    };
}

/**
 * Sets a design key from the panel; its default value removes the line (except for ecc).
 * @param {string} key - the design key.
 * @param {string} value - the value.
 * @param {boolean} [merge=false] - part of a continuous change (dragging, typing).
 * @returns {void}
 */
function setPanelKey(key, value, merge = false) {
    const written = value === KEYS[key]?.def && !KEYS_KEPT_AT_DEFAULT.includes(key) ? '' : value;
    if (merge) state.panelEdit = true;
    editCode(setKey(state.code, key, written), { merge });
    state.panelEdit = false;
}

/**
 * Sets the content from a form of the panel.
 * @param {string} content - the content.
 * @param {boolean} [merge=false] - part of a continuous change (typing).
 * @param {string} [msg=''] - a message to show.
 * @returns {void}
 */
function setPanelContent(content, merge = false, msg = '') {
    if (merge) state.panelEdit = true;
    editCode(setContent(state.code, content), { merge, msg });
    state.panelEdit = false;
}

/**
 * Writes a QR reference or a creditor reference (RF) with its check digits from the number in the
 * reference field of a payment.
 * @param {string} kind - "qrr" for a QR reference, "scor" for a creditor reference.
 * @returns {void}
 */
function writeReference(kind) {
    const fields = parseContent(state.type, state.content);
    const base = String(fields.reference || '').replace(CREDITOR_PREFIX, '');
    if (!base.replace(/\D/g, '') && kind === 'qrr') { showToast(translate('Type a number into the reference field first')); return; }
    if (kind === 'qrr') { fields.reftype = 'QRR'; fields.reference = buildQrReference(base); } else { if (state.type === 'swiss') fields.reftype = 'SCOR'; fields.reference = buildCreditorReference(base || fields.reference || DEFAULT_REFERENCE_BASE); }
    areas.panel.resetForm();
    editCode(setContent(state.code, buildContent(state.type, fields)), { msg: translate('Reference with check digits written') });
}
