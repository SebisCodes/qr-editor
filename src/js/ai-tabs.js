/**
 * The hand-over between editor tabs: a tab opened with an AI link gives its
 * document to the editor tab used last (BroadcastChannel "qreditor").
 * The viewer shows its own document: it neither hands a link to an open editor
 * tab nor takes one, so it has no channel.
 *
 * Messages on the channel:
 *   { type: "ping", ask }                               a link tab asks which editor tabs are open;
 *   { type: "pong", ask, tab, focus }                   an editor tab answers with its id and when it last had the focus;
 *   { type: "document", to, text, mode, target, ask }   the link tab sends the document to one editor tab;
 *   { type: "got", ask, id }                            that tab took it; id is the document it is in.
 *
 * On import the tab gets its id and starts noting when it has the focus.
 */

import { EDITOR_PREFIX } from './ai-links.js?v=3';

const MESSAGE = { ping: 'ping', pong: 'pong', document: 'document', got: 'got' };
const VIEWER_PARAMETER = 'viewer';
const VIEWER_ON = '1';
const ANSWER_WAIT_MS = 350;              // how long a link tab waits for the editor tabs to answer
const TAKE_OVER_WAIT_MS = 4000;          // how long it waits for the chosen tab to take the document
const ID_RADIX = 36;
const ID_RANDOM_START = 2;               // skips the "0." of the random number

/**
 * The answer of an editor tab to a ping.
 * @typedef {Object} TabAnswer
 * @property {string} type - "pong".
 * @property {string} ask - the id of the question it answers.
 * @property {string} tab - the id of the editor tab.
 * @property {number} focus - when that tab last had the focus (ms since the epoch), 0 for never.
 */

/**
 * A document from an AI link as it is handed over.
 * @typedef {Object} LinkDocument
 * @property {string} text - the QR document.
 * @property {string} mode - "add" or "set".
 * @property {import('./ai-links.js').LinkTarget} target - where the document goes.
 */

const tabId = createRandomId();
let lastFocus = document.hasFocus() ? Date.now() : 0;
addEventListener('focus', () => { lastFocus = Date.now(); });

/**
 * Returns a new random id for a tab or a question.
 * @returns {string} the id, letters and digits.
 */
export function createRandomId() {
    return Math.random().toString(ID_RADIX).slice(ID_RANDOM_START);
}

/**
 * Creates this tab's channel to the other editor tabs: it answers their pings and takes the
 * documents sent to it. Outside the viewer and where the browser has BroadcastChannel only.
 * @param {function(string, string, Object): (Promise<string>|string)} receiveDocument - loads a document (text, mode, target); returns the id of the document it is in.
 * @returns {BroadcastChannel|null} the channel, or null without one.
 */
export function createTabChannel(receiveDocument) {
    const channel = new URLSearchParams(location.search).get(VIEWER_PARAMETER) !== VIEWER_ON && 'BroadcastChannel' in window ? new BroadcastChannel(EDITOR_PREFIX) : null;
    if (channel) channel.onmessage = event => receiveTabMessage(channel, event.data || {}, receiveDocument);
    return channel;
}

/**
 * Answers a message of another tab: a ping with this tab's id and focus time, a document meant
 * for this tab by loading it and saying where it is.
 * @param {BroadcastChannel} channel - the channel to the editor tabs.
 * @param {Object} message - the message.
 * @param {function(string, string, Object): (Promise<string>|string)} receiveDocument - loads a document; returns the id of the document it is in.
 * @returns {void}
 */
function receiveTabMessage(channel, message, receiveDocument) {
    if (message.type === MESSAGE.ping) channel.postMessage({ type: MESSAGE.pong, ask: message.ask, tab: tabId, focus: lastFocus });
    if (message.type === MESSAGE.document && message.to === tabId) {
        // got carries the id of the document it is in, for "Open it here" in the other tab
        Promise.resolve(receiveDocument(message.text, message.mode, message.target)).catch(() => null).then(id => channel.postMessage({ type: MESSAGE.got, ask: message.ask, id }));
    }
}

/**
 * Asks the open editor tabs to answer and returns the one used last. A request that returns a
 * Promise of the answer.
 * @param {BroadcastChannel|null} channel - the channel to the editor tabs, or null without one.
 * @param {string} ask - the id of this question.
 * @returns {Promise<TabAnswer|null>} the tab with the latest focus, or null when none answered.
 */
export function findEditorTab(channel, ask) {
    if (!channel) return Promise.resolve(null);
    return new Promise(resolve => collectTabAnswers(channel, ask, resolve));
}

/**
 * Pings the editor tabs, collects their answers for a moment and hands on the tab used last.
 * @param {BroadcastChannel} channel - the channel to the editor tabs.
 * @param {string} ask - the id of this question.
 * @param {function(TabAnswer|null): void} resolve - takes the tab with the latest focus, null when none answered.
 * @returns {void}
 */
function collectTabAnswers(channel, ask, resolve) {
    const answers = [];
    /**
     * Notes the answer of an editor tab to this question.
     * @param {MessageEvent} event - a message on the channel.
     * @returns {void}
     */
    const addTabAnswer = event => { if (event.data && event.data.type === MESSAGE.pong && event.data.ask === ask) answers.push(event.data); };
    channel.addEventListener('message', addTabAnswer);
    channel.postMessage({ type: MESSAGE.ping, ask });
    setTimeout(() => {
        channel.removeEventListener('message', addTabAnswer);
        answers.sort((a, b) => b.focus - a.focus);
        resolve(answers[0] || null);
    }, ANSWER_WAIT_MS);
}

/**
 * Sends a document to an editor tab and waits until it took it. A command that returns a
 * Promise of the answer.
 * @param {BroadcastChannel} channel - the channel to the editor tabs.
 * @param {TabAnswer} tab - the editor tab to send to.
 * @param {LinkDocument} linkDocument - the document.
 * @param {string} ask - the id of this hand-over.
 * @returns {Promise<{id: string}|null>} the id of the document in that tab, or null when it did not answer in time.
 */
export function sendDocumentToTab(channel, tab, linkDocument, ask) {
    const message = { type: MESSAGE.document, to: tab.tab, text: linkDocument.text, mode: linkDocument.mode, target: linkDocument.target, ask };
    return new Promise(resolve => sendHandover(channel, message, resolve));
}

/**
 * Sends a document to an editor tab and hands on the id of the document it took there.
 * @param {BroadcastChannel} channel - the channel to the editor tabs.
 * @param {Object} message - the document message for the tab, with the id of this hand-over in `ask`.
 * @param {function(?Object): void} resolve - takes {id} of the document there, null when the tab did not answer in time.
 * @returns {void}
 */
function sendHandover(channel, message, resolve) {
    /**
     * Resolves with the id once the tab says it took the document.
     * @param {MessageEvent} event - a message on the channel.
     * @returns {void}
     */
    const handleTakenMessage = event => {
        if (event.data && event.data.type === MESSAGE.got && event.data.ask === message.ask) { channel.removeEventListener('message', handleTakenMessage); resolve({ id: event.data.id }); }
    };
    channel.addEventListener('message', handleTakenMessage);
    channel.postMessage(message);
    setTimeout(() => { channel.removeEventListener('message', handleTakenMessage); resolve(null); }, TAKE_OVER_WAIT_MS);
}
