/* ==========================================================================
   QR editor: the QR document on the left, the code drawn in the middle,
   content, design and checks on the right.

   The document is the single source of truth: design lines "key: value",
   a line "---", the content (qrdoc.js). The code is drawn from it
   (drawing.js, render.js), read back for the scan check (analysis.js,
   check.js), and every change in the panel is written back into the
   document as a small edit (one undo step, history.js).

   This file starts the editor and wires its areas together:
     1. translate the interface and set up the code view;
     2. set up the areas of the page in the order their listeners are needed
        (documents, stage, bar, pictures, keyboard, panes, side panel, Export, camera);
     3. open the start document and draw it;
     4. set up the AI Assistant, the WebMCP tools, the AI status and the
        connection to a page that embeds the editor;
     5. offer the test hook window.qrEditor.
   ========================================================================== */

import { createI18n } from './i18n.js?v=24';
import { setTranslation, translate, getTranslationReady } from './translate.js?v=2';
import { createPanel } from './panel.js?v=6';
import { startExport } from './exportui.js?v=7';
import { createScanner } from './scan.js?v=6';
import { createAiStatus } from './aistatus.js?v=9';
import { store } from './files.js?v=7';
import { createSync } from './sync.js?v=25';
import './export-menu.js?v=6';
import { state, ui, areas } from './state.js?v=2';
import { showToast } from './toast.js?v=2';
import { drawDocument, getCaptionWidth } from './drawing.js?v=3';
import { updateDocument } from './analysis.js?v=5';
import { renderBadge, startPreview } from './preview.js?v=3';
import { startLineWrap, startCodeView, renderCode, syncScroll, showInCode } from './codeview.js?v=5';
import { renderProblems, startProblems } from './problems.js?v=5';
import { startTyping, setCode, addHistoryStep, editCode, undo, redo } from './history.js?v=5';
import { watchOtherTabs, openStartDocument, showFileName, startDocuments } from './documents.js?v=5';
import { readSettings, updateStoredSettings } from './settings.js?v=2';
import { receiveDocument, importExternalDocument } from './incoming.js?v=5';
import { startStage } from './stage.js?v=5';
import { startNewMenu, startHistoryButtons, startBarButtons } from './toolbar.js?v=5';
import { startPictures, openFileChoice, readPictureCode, receiveScannedText } from './pictures.js?v=5';
import { startLogoPicker } from './logo.js?v=5';
import { startKeyboard } from './keyboard.js?v=5';
import { startPanes, updateSplit } from './panes.js?v=5';
import { getPanelActions } from './panel-actions.js?v=5';
import { createAiAssistant, createAgentTools } from './assistants.js?v=5';

startEditor();

/**
 * Starts the editor: the steps of the file header, in order.
 * @returns {void}
 */
function startEditor() {
    // The language page builder reads this call as it is written here (prefix and roots as plain texts).
    setTranslation(createI18n({ prefix: 'qreditor', roots: '.header, .views, #work, #ai-receive, #toast, .storage-hint, dialog', skip: '' }));
    startLineWrap();
    startAreas();
    openFirstDocument();
    connectAssistants();
    window.qrEditor = createTestHook();
}

/**
 * Sets up the areas of the page; the order keeps the order of their listeners on window and document.
 * @returns {void}
 */
function startAreas() {
    watchOtherTabs();
    startPreview();
    startCodeView();
    startTyping();
    startProblems();
    startStage();
    areas.files = startDocuments();
    startNewMenu();
    startHistoryButtons();
    startPictures();
    startLogoPicker();
    startKeyboard();
    startPanes();
    startBarButtons();
    areas.panel = createPanel(getPanelActions());
    areas.exporter = startExport({ getState: () => state, drawDocument, getCaptionWidth, showToast, translate });
    startScannerButtons();
}

/**
 * Sets up reading codes with the camera and the Export button.
 * @returns {void}
 */
function startScannerButtons() {
    const scanner = createScanner({ showToast, translate, receiveText: text => receiveScannedText(text, translate('the camera')), pickPicture: openFileChoice });
    document.getElementById('btn-scan').addEventListener('click', () => scanner.open());
    document.getElementById('btn-export').addEventListener('click', () => areas.exporter.open());
}

/**
 * Applies the stored settings, opens the start document, draws it and makes it the first undo step;
 * the texts are drawn again once the language pack is loaded.
 * @returns {void}
 */
function openFirstDocument() {
    updateStoredSettings();
    const settings = readSettings();
    if (settings) {
        if (settings.split) state.split = settings.split;
        if (settings.print) state.print = { ...state.print, ...settings.print };
    }
    updateSplit();
    openStartDocument(settings);
    updateDocument();
    renderCode();
    syncScroll();
    addHistoryStep();
    if (settings?.itab) areas.panel.showTab(settings.itab);
    getTranslationReady().then(renderTranslatedTexts);
}

/**
 * Draws the texts made by scripts again in the language of the page.
 * @returns {void}
 */
function renderTranslatedTexts() {
    areas.panel.render(true);
    renderBadge();
    renderProblems();
    renderCode();
    showFileName();
}

/**
 * Sets up the AI Assistant, the WebMCP tools, the AI status at the AI button and the connection
 * to a page that embeds the editor (shared sync.js).
 * @returns {void}
 */
function connectAssistants() {
    areas.ai = createAiAssistant();
    const agent = createAgentTools();
    areas.aiStatus = createAiStatus({
        prefix: 'qreditor', btn: document.getElementById('btn-ai'), box: document.getElementById('ai-status'),
        remote: () => areas.sync?.getAiSettings() || null, agent: () => agent,
    });
    areas.sync = createSync({
        onAiResult: () => areas.aiStatus.addDelivery('page'),
        onAiEnd: () => areas.aiStatus.resetDelivery(),
        prefix: 'qreditor', editor: 'qr', word: 'document',
        current: () => ({ id: state.fileId, name: state.name, content: state.code, assets: {} }),
        load: importExternalDocument,
        toast: showToast,
        hookFor: id => store.getMeta(id)?.hook || null,
        setHookFor: saveDocumentHook,
        onAi: () => areas.ai?.updateRemote(),
    });
}

/**
 * Stores the webhook of one document (sync.js).
 * @param {string} id - the id of the document.
 * @param {?Object} hook - the webhook, null removes it.
 * @returns {void}
 */
function saveDocumentHook(id, hook) {
    try { store.setMeta(id, { hook }); } catch (error) { showToast(translate('The browser storage is full')); }
}

/**
 * Returns the interface the automated browser tests use (window.qrEditor); its member names are
 * what the tests call.
 * @returns {Object} the state, the store and the functions the tests drive the editor with.
 */
function createTestHook() {
    return {
        state, store, setCode, change: editCode, undo, redo, receive: receiveDocument, revealInCode: showInCode,
        sync: () => areas.sync, panel: areas.panel, drawDoc: drawDocument, readPicture: readPictureCode, exp: areas.exporter,
    };
}
