/* What AIs see of the editor and what they may do in it: the AI Assistant
   (prompt and links, ai.js) and the WebMCP tools for browser agents (mcp.js).
   Both get the same view of the open document (getAiState) and report their
   deliveries to the AI status at the AI button (shared aistatus.js). */

import { state, ui, areas } from './state.js?v=2';
import { showToast } from './toast.js?v=2';
import { store } from './files.js?v=7';
import { TEMPLATES } from './samples.js?v=3';
import { createAi } from './ai.js?v=7';
import { createWebMcp } from './mcp.js?v=3';
import { setKey, setContent, KEYS } from './qrdoc.js?v=4';
import { TYPE_NAMES } from './payload.js?v=5';
import { editCode, undo } from './history.js?v=5';
import { openDocument, createDocument } from './documents.js?v=5';
import { receiveDocument } from './incoming.js?v=5';

/** Documents longer than this are sent to an AI with their pictures shortened. */
const MAX_FULL_DOCUMENT = 60000;

/** A picture in a document, as long as it is worth shortening. */
const LONG_PICTURE = /data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]{200,}/g;

/** How much of a shortened picture is kept. */
const SHORTENED_PICTURE_LENGTH = 60;

/** The name of a document an agent creates without one. */
const AGENT_DOCUMENT_NAME = 'AI QR code';

/** How long a tool waits for the scan check, and how often it looks, in milliseconds. */
const SCAN_WAIT_MS = 5000;
const SCAN_POLL_MS = 80;

/** At most this many problems are listed after a scan check of an agent. */
const MAX_AGENT_PROBLEMS = 10;

/**
 * What an AI is told about the open document.
 * @typedef {Object} AiState
 * @property {string} code - the document (pictures shortened in long ones).
 * @property {string} name - its name.
 * @property {string[]} files - the names of the user's documents, newest first.
 * @property {string} about - the summary of the code (getCodeSummary).
 * @property {string} sel - the text selected in the code.
 * @property {string[]} problems - the problems with their 1-based lines.
 * @property {?Object} context - what the page around the editor says about the document.
 */

/**
 * Returns a summary of the open code for the AI prompt and the WebMCP tools.
 * @returns {string} content type, version, size, error correction, fill and the scan check.
 */
export function getCodeSummary() {
    const encoding = state.enc;
    const code = encoding && !encoding.error ? `version ${encoding.version} (${encoding.size} x ${encoding.size} modules), error correction ${encoding.ecc}, ${encoding.bytes} of ${encoding.capacity} bytes` : 'no code (see the problems)';
    return `Content type: ${TYPE_NAMES[state.type]}; ${code}; scan check: ${getScanSummary()}.`;
}

/**
 * Returns the result of the scan check in words.
 * @returns {string} for example "scans reliably".
 */
function getScanSummary() {
    if (!state.scan) return 'not checked yet';
    if (state.scan.level === 'good') return 'scans reliably';
    return state.scan.level === 'fair' ? 'scans only in good conditions' : 'does not scan';
}

/**
 * Returns what the AI prompt and the WebMCP tools see of the open document.
 * @returns {AiState} the document, its name, the other documents, the summary and the problems.
 */
function getAiState() {
    return {
        code: state.code.length > MAX_FULL_DOCUMENT ? state.code.replace(LONG_PICTURE, picture => picture.slice(0, SHORTENED_PICTURE_LENGTH) + '…(picture shortened)') : state.code,
        name: state.name, files: store.getSorted().map(file => file.name), about: getCodeSummary(),
        sel: state.code.slice(ui.codeArea.selectionStart, ui.codeArea.selectionEnd),
        problems: state.problems.map(problem => `line ${problem.line + 1}: ${problem.msg}`),
        context: areas.sync?.getContext() || null,
    };
}

/**
 * Waits until the scan check of the open code has a result (at most a few seconds).
 * @returns {Promise<void>} settles with the result, without a code, or after the wait.
 */
function waitForScan() {
    const start = Date.now();
    return new Promise(resolve => waitUntilScanned(resolve, start));
}

/**
 * Settles when the scan check is done or the time is up, else looks again a little later.
 * @param {function(): void} resolve - settles the wait.
 * @param {number} start - when the wait started, in milliseconds since 1970.
 * @returns {void}
 */
function waitUntilScanned(resolve, start) {
    if (state.scan || !state.layout || Date.now() - start > SCAN_WAIT_MS) resolve();
    else setTimeout(() => waitUntilScanned(resolve, start), SCAN_POLL_MS);
}

/**
 * Sets up the AI Assistant: its dialog, the prompt and the documents arriving as links.
 * @returns {Object} the AI API (updateRemote).
 */
export function createAiAssistant() {
    return createAi({
        getState: getAiState,
        receiveDocument: receiveLinkDocument,
        openDocument: openStoredDocument,
        showToast,
        getRemoteSettings: () => areas.sync?.getAiSettings() || null,
        fetchKey: () => (areas.sync ? areas.sync.fetchKey() : Promise.resolve(null)),
        hasValidKey: () => !!areas.sync?.hasValidKey(),
        handleAiClick: openEditorDialog => (areas.sync ? areas.sync.handleAiClick(openEditorDialog) : openEditorDialog()),
        getKeyDecline: () => areas.sync?.getKeyDecline() || '',
    });
}

/**
 * Takes a document from an AI link and reports the delivery to the AI status. A command that
 * returns the id of the document, which ai.js hands to another tab for "Open it here".
 * @param {string} text - the QR document.
 * @param {string} mode - how the link wants it.
 * @param {import('./incoming.js').DocumentTarget} target - where it goes.
 * @returns {Promise<string>} the id of the document it is in.
 */
async function receiveLinkDocument(text, mode, target) {
    setTimeout(() => areas.aiStatus.addDelivery('link'));
    await receiveDocument(text, mode, target);
    return state.fileId;
}

/**
 * Opens a stored document for "Open it here" of an AI link taken over by another tab.
 * A command that returns whether the document was there, so the caller can take the link again.
 * @param {string} id - the id of the document.
 * @returns {boolean} false when there is no such document.
 */
function openStoredDocument(id) {
    if (!store.getMeta(id)) return false;
    openDocument(id);
    return true;
}

/**
 * Registers the WebMCP tools for browser agents.
 * @returns {?Object} the agent status (last), null in a browser without WebMCP.
 */
export function createAgentTools() {
    return createWebMcp({
        onUse: () => areas.aiStatus.addDelivery('agent'),
        getState: getAiState,
        getProblems: () => state.problems.map(problem => ({ ...problem, line: problem.line + 1 })),
        setContent: setAgentContent,
        setDesign: setAgentDesign,
        checkScan: waitForAgentScan,
        getFiles: () => store.getSorted().map(file => ({ name: file.name, updated: file.updated, open: file.id === state.fileId })),
        openFile: openNamedDocument,
        createFile: createAgentDocument,
        receiveDocument,
        undo,
    });
}

/**
 * Sets the content of the open document for an agent (one undo step) and waits for the scan check.
 * @param {string} content - the new content.
 * @returns {Promise<string>} what the agent is told: the type and the summary of the code.
 */
async function setAgentContent(content) {
    areas.panel.resetForm();
    editCode(setContent(state.code, content));
    await waitForScan();
    return `The content is set (${TYPE_NAMES[state.type]}). ${getCodeSummary()}`;
}

/**
 * Sets one design key for an agent (one undo step) and waits for the scan check.
 * @param {string} key - the design key.
 * @param {string} value - its value, "" removes the line.
 * @returns {Promise<string>} what the agent is told: the problem with the value, or the summary.
 * @throws {Error} when the key is unknown.
 */
async function setAgentDesign(key, value) {
    if (!KEYS[key]) throw new Error(`Unknown design key "${key}". Keys: ${Object.keys(KEYS).join(', ')}.`);
    editCode(setKey(state.code, key, value));
    const doc = state.doc;
    const problem = doc.problems.find(entry => entry.line === doc.set[key] || (value && !doc.set[key] && doc.lines.some(line => line.key === key)));
    await waitForScan();
    return problem ? `Written, but: ${problem.msg}` : `${key} is ${value || 'the default'}. ${getCodeSummary()}`;
}

/**
 * Waits for the scan check and reports it to an agent.
 * @returns {Promise<string>} the summary of the code and the first problems.
 */
async function waitForAgentScan() {
    await waitForScan();
    return getCodeSummary() + (state.problems.length ? '\n' + state.problems.slice(0, MAX_AGENT_PROBLEMS).map(problem => `line ${problem.line + 1}: ${problem.msg}`).join('\n') : '');
}

/**
 * Opens a document by name for an agent. A command that returns whether the document exists,
 * which the tool reports.
 * @param {string} name - the name of the document.
 * @returns {boolean} false when there is no document of that name.
 */
function openNamedDocument(name) {
    const file = store.findByName(name);
    if (file && file.id !== state.fileId) openDocument(file.id);
    return !!file;
}

/**
 * Creates and opens a document for an agent. A command that returns the name it got, which the tool reports.
 * @param {string} [name] - the wished name.
 * @param {string} [code] - the document, or only the content; a link template without it.
 * @returns {string|null} the name of the new document, null when the storage is full.
 */
function createAgentDocument(name, code) {
    return createDocument(name || AGENT_DOCUMENT_NAME, code || TEMPLATES.link.code) && state.name;
}
