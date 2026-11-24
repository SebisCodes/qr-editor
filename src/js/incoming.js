/* Documents that arrive: from AI links and WebMCP agents (ai.js, mcp.js), and
   from the page around the editor or ?src= (shared sync.js). */

import { state, ui, areas } from './state.js?v=2';
import { translate } from './translate.js?v=2';
import { showToast } from './toast.js?v=2';
import { store } from './files.js?v=7';
import { VIEWER } from './sync.js?v=25';
import { editCode } from './history.js?v=5';
import { openDocument, createDocument } from './documents.js?v=5';

/** The name of a document from an AI that names none. */
const AI_DOCUMENT_NAME = 'AI QR code';

/**
 * Where a document from an AI goes.
 * @typedef {Object} DocumentTarget
 * @property {string} [file] - "new" for a new document, a name for that document (made when missing), empty for the open one.
 * @property {string} [name] - the name of a new document.
 */

/**
 * A document from the page around the editor or from ?src= (see sync.js).
 * @typedef {Object} ExternalDocument
 * @property {string} name - its name.
 * @property {string} content - its text.
 * @property {string} [into] - the id of the document it replaces.
 * @property {boolean} [asNew] - always a new document.
 * @property {string} [page] - the origin of the page it comes from.
 * @property {boolean} [temp] - kept in memory only.
 */

/**
 * Takes a document from an AI: it becomes a new document, or changes the named one or the open one
 * (one undo step), with a message (not in the viewer).
 * @param {string} text - the QR document.
 * @param {string} mode - how the link wants it ("set" or "add"; a code has one content, so both set it).
 * @param {DocumentTarget} [target={}] - where it goes.
 * @returns {Promise<void>} settles when the document is in the editor.
 */
export async function receiveDocument(text, mode, target = {}) {
    const code = String(text).replace(/\r\n/g, '\n');
    const wanted = String(target.file || '').trim();
    const isNew = wanted.toLowerCase() === 'new';
    const file = isNew ? null : wanted ? store.findByName(wanted) : store.getMeta(state.fileId);
    if (!file) {
        if (createDocument(isNew ? target.name || AI_DOCUMENT_NAME : wanted || AI_DOCUMENT_NAME, code)) VIEWER || showToast(`${translate('New document')} "${state.name}" ${translate('from the AI - your other documents are unchanged')}`);
        return;
    }
    if (file.id !== state.fileId) openDocument(file.id);
    areas.panel.resetForm();
    editCode(code);
    VIEWER || showToast(getReceivedMessage());
}

/**
 * Returns the message after a document from an AI changed a document.
 * @returns {string} the number of errors found, or how to take the change back.
 */
function getReceivedMessage() {
    const errors = state.problems.filter(problem => problem.kind === 'error').length;
    if (errors) return `${translate('QR code received - the editor found')} ${errors} ${errors === 1 ? translate('problem') : translate('problems')}`;
    return `"${state.name}" ${translate('changed by the AI - "Undo" takes it back')}`;
}

/**
 * Takes a document from the page around the editor or from ?src=: it replaces the document of that
 * name from the same page, or becomes a new one (kept in memory when temp).
 * @param {ExternalDocument} external - the document and where it comes from.
 * @returns {Promise<void>} settles when the document is open.
 */
export async function importExternalDocument({ name, content, into, asNew, page, temp }) {
    const code = String(content).replace(/\r\n/g, '\n');
    const file = asNew ? null : (into && store.getMeta(into)) || store.list().find(entry => entry.name === name && entry.page && entry.page === page && !!entry.temp === !!temp);
    if (file) {
        if (file.id !== state.fileId) openDocument(file.id);
        areas.panel.resetForm();
        if (code !== state.code) editCode(code);
    } else createExternalDocument(name, code, page, temp);
    ui.codeArea.setSelectionRange(0, 0);
    ui.codeArea.scrollTop = 0;
}

/**
 * Creates the document of a page (in memory when temp) and marks the page it comes from.
 * @param {string} name - its name.
 * @param {string} code - its text.
 * @param {string} [page] - the origin of the page.
 * @param {boolean} [temp] - kept in memory only.
 * @returns {void}
 */
function createExternalDocument(name, code, page, temp) {
    const id = createDocument(name, code, !!temp);
    if (id && page) try { store.setMeta(id, { page }); } catch (error) { /* storage full: it just is not recognized next time */ }
}
