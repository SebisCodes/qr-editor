/* The documents of "My documents" in the editor: storing the open document and
   the settings, opening and creating documents, and another tab that changes
   the open document (files.js keeps the documents themselves).

   Storing (saveEditorState):
     1. the settings go to qreditor.v1 (settings.js);
     2. the open document goes to its file, unless another tab changed that file since this
        tab read or stored it: then this tab's version becomes a document of its own. */

import { state, ui, areas, DEFAULT_NAME, getElement } from './state.js?v=2';
import { saveSettings } from './settings.js?v=2';
import { translate } from './translate.js?v=2';
import { showToast } from './toast.js?v=2';
import { store, createFiles } from './files.js?v=7';
import { START, TEMPLATES } from './samples.js?v=3';
import { renderSvg } from './draw.js?v=3';
import { drawDocument } from './drawing.js?v=3';
import { renderPreview } from './preview.js?v=3';
import { setCode, addHistoryStep, updateHistoryUi } from './history.js?v=5';
import { openFileChoice } from './pictures.js?v=5';

/** The pause after typing before the document is stored, in milliseconds. */
const SAVE_DELAY_MS = 400;

/** The message when the browser storage is full while the open document is stored. */
const STORAGE_FULL = 'The browser storage is full - download and delete documents under "My documents"';

/** The text of the open document as it was last read from or written to its file. */
let savedCode = null;

/** The timer of the next store after typing; it keeps its id after it ran. */
let saveTimer = 0;

/** Whether the message about full storage was shown already. */
let storageWarned = false;

/** The undo history of every document opened in this tab, by id. */
const historyByFile = new Map();

/**
 * Stores the settings and the open document.
 * @returns {void}
 */
export function saveEditorState() {
    saveSettings();
    if (!state.fileId || state.code === savedCode) return;
    try {
        // Another tab changed this document since this tab read or saved it: both versions are kept.
        const stored = store.code(state.fileId);
        if (stored != null && stored !== savedCode && stored !== state.code) { saveAsSeparateDocument(); return; }
        store.write(state.fileId, { code: state.code });
        savedCode = state.code;
    } catch (error) {
        if (!storageWarned) showToast(STORAGE_FULL);
        storageWarned = true;
    }
}

/**
 * Stores the editor state after a short pause; a newer call starts the pause again.
 * @returns {void}
 */
export function startSaveTimer() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveEditorState, SAVE_DELAY_MS);
}

/**
 * Keeps this tab's version of a document that another tab changed meanwhile: it becomes a
 * document of its own (with a free name), the other tab's version stays as it is.
 * @returns {void}
 */
function saveAsSeparateDocument() {
    const previousName = state.name;
    let id;
    try { id = store.create(previousName, state.code); } catch (error) { showToast(STORAGE_FULL); return; }
    state.fileId = id;
    state.name = store.getMeta(id)?.name || previousName;
    savedCode = state.code;
    showFileName();
    areas.files.render();
    areas.sync?.updateUi();
    saveEditorState();
    showToast(`"${previousName}" was changed in another tab - your version here is kept as "${state.name}"`);
}

/**
 * Follows changes of the open document made in another tab.
 * @returns {void}
 */
export function watchOtherTabs() {
    addEventListener('storage', showOtherTabVersion);
}

/**
 * Shows the version another tab stored of the open document - only in a tab that is not on
 * screen and has no edits of its own: what the user is looking at never changes by itself.
 * @param {StorageEvent} event - the change of the browser storage.
 * @returns {void}
 */
function showOtherTabVersion(event) {
    if (!state.fileId || !event.key || !event.key.endsWith(state.fileId) || event.newValue == null || store.isTemp(state.fileId)) return;
    const stored = store.code(state.fileId);
    if (stored == null || stored === state.code || state.code !== savedCode || document.visibilityState !== 'hidden') return;
    savedCode = stored;
    setCode(stored);
}

/**
 * Opens the document of the settings (else the newest, else the welcome example) when the editor starts.
 * Without storage the welcome example is open without being stored.
 * @param {?import('./settings.js').StoredSettings} settings - the stored settings.
 * @returns {void}
 */
export function openStartDocument(settings) {
    let startCode = null;
    try {
        if (!store.list().length) store.create(START.name, START.code);
        const file = store.getMeta(settings?.file) || store.getSorted()[0];
        startCode = store.code(file.id);
        if (startCode != null) { state.fileId = file.id; state.name = file.name; savedCode = startCode; }
    } catch (error) { /* storage blocked: one document without saving */ }
    if (startCode == null) { startCode = START.code; state.name = START.name; }
    state.code = startCode;
    ui.codeArea.value = startCode;
    showFileName();
}

/**
 * Shows the name of the open document in the bar.
 * @returns {void}
 */
export function showFileName() {
    getElement('#file-name').textContent = state.name;
    getElement('#btn-files').title = `"${state.name}" ${translate('is open. My documents: open, rename, duplicate or delete your documents (Ctrl+O)')}`;
}

/**
 * Opens a document: the open one is stored with its waiting edits and keeps its undo history
 * for this tab, the other one is shown with its own.
 * @param {string} id - the id of the document.
 * @param {string} [code] - its text, when known; else it is read from the store.
 * @returns {void}
 */
export function openDocument(id, code) {
    clearTimeout(state.histTimer);
    // The document that is closed keeps the edits still waiting for the autosave.
    if (saveTimer) { clearTimeout(saveTimer); saveEditorState(); }
    if (state.fileId) { addHistoryStep(); historyByFile.set(state.fileId, { history: state.history, future: state.future }); }
    code ??= store.code(id) ?? '';
    state.fileId = id;
    state.name = store.getMeta(id)?.name || DEFAULT_NAME;
    savedCode = code;
    const kept = historyByFile.get(id);
    state.history = kept ? kept.history : [];
    state.future = kept ? kept.future : [];
    areas.panel.resetForm();
    setCode(code, { history: false });
    ui.codeArea.scrollTop = 0;
    ui.codeArea.setSelectionRange(0, 0);
    addHistoryStep();
    updateHistoryUi();
    showFileName();
    areas.files.render();
    areas.sync?.updateUi();
}

/**
 * Creates a document in "My documents" and opens it. A command that returns the new id,
 * because the callers go on with it (null tells them the storage is full).
 * @param {string} name - the wished name (made unique).
 * @param {string} code - the document text.
 * @param {boolean} [inMemory] - keep it in memory only (a page's document), never stored.
 * @returns {?string} the id of the new document, null when the storage is full.
 */
export function createDocument(name, code, inMemory = false) {
    let id;
    try { id = store.create(name, code, inMemory); } catch (error) {
        showToast(translate('The browser storage is full - delete or download documents under "My documents" first'));
        return null;
    }
    openDocument(id, code);
    return id;
}

/**
 * Creates a document from a template of "New" (or the welcome example) and opens it.
 * @param {string} kind - "example" or a key of TEMPLATES; an unknown one makes a link.
 * @returns {void}
 */
export function createFromTemplate(kind) {
    const template = kind === 'example' ? START : TEMPLATES[kind] || TEMPLATES.link;
    if (createDocument(translate(template.name), template.code)) showToast(`${translate('New document')} "${state.name}" - ${translate('your other documents are under "My documents"')}`);
}

/**
 * Returns the picture of a document's code for its card in "My documents".
 * @param {string} code - the document text.
 * @returns {string} the SVG, empty when the document makes no code.
 */
function renderThumbnail(code) {
    try {
        const drawn = drawDocument(code);
        return drawn.layout ? renderSvg(drawn.layout, { width: '100%', height: '100%' }) : '';
    } catch (error) { return ''; }
}

/**
 * Sets up the "My documents" dialog.
 * @returns {Object} the files API (open, render).
 */
export function startDocuments() {
    return createFiles({
        getCurrent: () => ({ id: state.fileId, name: state.name, code: state.code }),
        open: openFromFiles,
        create: kind => createFromTemplate(kind === 'blank' ? 'link' : kind),
        rename: renameDocument,
        onRemove: closeRemovedDocument,
        importFile: openFileChoice,
        showToast,
        renderThumbnail,
    });
}

/**
 * Opens a document chosen in "My documents" and says so.
 * @param {string} id - the id of the document.
 * @returns {void}
 */
function openFromFiles(id) {
    openDocument(id);
    showToast(`"${state.name}" ${translate('opened')}`);
}

/**
 * Renames a document; the open one shows its new name at once.
 * @param {string} id - the id of the document.
 * @param {string} name - the new (unique) name.
 * @returns {void}
 */
function renameDocument(id, name) {
    try { store.write(id, { name }); } catch (error) { showToast(translate('The browser storage is full')); return; }
    if (id !== state.fileId) return;
    state.name = name;
    showFileName();
    areas.sync?.handleChange();
    renderPreview();
}

/**
 * Forgets a deleted document; when it was open, the newest other one opens (or a new welcome example).
 * @param {string} id - the id of the deleted document.
 * @returns {void}
 */
function closeRemovedDocument(id) {
    historyByFile.delete(id);
    if (id !== state.fileId) return;
    state.fileId = '';
    const next = store.getSorted()[0];
    if (next) openDocument(next.id);
    else createDocument(START.name, START.code);
}
