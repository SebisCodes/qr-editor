/**
 * AI Assistant without any server: any AI sends a document as a link.
 * "Copy prompt" puts instructions and the current document on the clipboard
 * (ai-prompt.js); the AI answers with a link that carries the QR document after
 * the # (ai-links.js). A tab opened with such a link hands the document to the
 * editor tab that is already open (ai-tabs.js) and shows that the other tab took
 * it (the document can be opened here too); without an open editor it loads the
 * document itself. Terminals break long links over several lines, so the AI's
 * whole answer can also be pasted into the editor: the links are found and joined.
 *
 * createAi() runs these steps:
 *   1. open this tab's channel to the other editor tabs;
 *   2. connect the AI button, the copy button and the pasting of answers (Ctrl+V anywhere, or the field in the dialog);
 *   3. take the document of a link in the address, at start and whenever the # changes.
 */

import { openDialog } from './dialogs.js?v=5';
import { readLink, parseLink, getLinksInText } from './ai-links.js?v=3';
import { isKeyInPrompt, isAnswerFromPage, getPageTexts } from './prompt-parts.js?v=1';
import { getPrompt } from './ai-prompt.js?v=4';
import { createTabChannel, createRandomId, findEditorTab, sendDocumentToTab } from './ai-tabs.js?v=3';

export { getLinksInText } from './ai-links.js?v=3';
export { getPrompt, PROMPT_BASE, PROMPT_SAVING, PROMPT_HEAD } from './ai-prompt.js?v=4';

const TARGET_NEW = 'new';
const EDITABLE_SELECTOR = 'textarea, input, select, [contenteditable]';
const HIDDEN_COPY_STYLE = 'position:fixed;left:-9999px;top:0;opacity:0';
const FRAMED_STEP_HTML = 'The AI answers with a link: <b>paste its whole answer below</b> (a clicked link opens a separate editor). <b>Undo</b> takes it back.';
const BROKEN_LINK_TEXT = 'The document in this link is incomplete or damaged. If the AI\'s link was split over several lines (as in a terminal), copy the whole answer and paste it into the editor with Ctrl+V - the editor joins the lines.';

/**
 * What the editor hands to createAi().
 * @typedef {Object} AiOptions
 * @property {function(): import('./ai-prompt.js').PromptState} getState - the open document and what the editor knows about it.
 * @property {function(string, string, Object): Promise<string>} receiveDocument - loads a document (text, mode, target); resolves with the id of the document it is in.
 * @property {function(string): void} showToast - shows a short message.
 * @property {function(): (import('./ai-prompt.js').RemoteSettings|null)} [getRemoteSettings] - the page's AI settings, or null (from sync.js).
 * @property {function(): Promise<*>} [fetchKey] - asks the page for the session's key while there is none.
 * @property {function(): boolean} [hasValidKey] - whether the session has its key.
 * @property {function(string): boolean} [openDocument] - opens a stored document in this tab; false when there is none.
 * @property {function(function(): void): void} [handleAiClick] - a press on the AI button: the page's own dialog when it shows one, else the function given (the editor's dialog).
 * @property {function(): string} [getKeyDecline] - the page's text for a declined key request, "" without.
 */

/**
 * What createAi() gives back to the editor.
 * @typedef {Object} AiDialog
 * @property {function(): void} updateRemote - shows the page's AI settings again in the dialog.
 */

/**
 * Sets up the AI dialog, the hand-over between tabs and the taking of AI links. Like every
 * initializeX, it sets up an area and returns its API.
 * @param {AiOptions} options - the editor's functions the AI dialog uses.
 * @returns {AiDialog} updateRemote.
 */
export function createAi({ getState, receiveDocument, showToast, getRemoteSettings = () => null, fetchKey = () => Promise.resolve(null), hasValidKey = () => false, openDocument = () => false, handleAiClick = openEditorDialog => openEditorDialog(), getKeyDecline = () => '' }) {
    const dialog = document.getElementById('ai');
    const notice = document.getElementById('ai-receive');
    const stepLink = document.getElementById('ai-step-link');
    const handCopy = document.getElementById('ai-prompt-text');
    const remoteBox = document.getElementById('ai-remote');
    const privacy = document.getElementById('ai-privacy');
    const keyNote = document.getElementById('ai-key-exp');
    const pasteField = document.getElementById('ai-paste');
    const channel = createTabChannel(receiveDocument);

    document.getElementById('btn-ai').addEventListener('click', () => handleAiClick(openAiDialog));
    // Inside another website a clicked link opens a separate editor, so the dialog asks to paste the answer.
    const isFramed = window.parent !== window;
    if (isFramed) stepLink.innerHTML = FRAMED_STEP_HTML;
    const stepHtml = stepLink.innerHTML;
    const privacyText = privacy.textContent;
    document.getElementById('ai-copy').addEventListener('click', copyPrompt);
    const linksInFlight = new Set();   // links being taken: one paste can fire several input events, each with the whole answer
    addEventListener('paste', receivePastedAnswer);
    pasteField.addEventListener('input', receiveFieldAnswer);
    addEventListener('hashchange', importAddressLink);
    importAddressLink();
    return { updateRemote: showRemote };

    /**
     * Opens the AI dialog with the name of the open document and the page's AI settings.
     * @returns {void}
     */
    function openAiDialog() {
        document.getElementById('ai-cur').textContent = getState().name;
        showRemote();
        openDialog(dialog);
    }

    /**
     * Shows the notice about a link: a title, a text and, with openHere, the button "Open it here".
     * @param {string} title - the title.
     * @param {string} text - the text.
     * @param {function(): void|null} [openHere] - what the button does; no button without it.
     * @param {boolean} [isLoading] - true while the link is read: the notice is the loading screen (no buttons).
     * @returns {void}
     */
    function showNotice(title, text, openHere = null, isLoading = false) {
        notice.classList.toggle('loading', isLoading);
        notice.querySelector('h2').textContent = title;
        notice.querySelector('p').textContent = text;
        const hereButton = notice.querySelector('[data-here]');
        hereButton.hidden = !openHere;
        /**
         * Hides the notice and opens the document here (the button's click handler).
         * @returns {void}
         */
        hereButton.onclick = () => { notice.hidden = true; openHere(); };
        notice.hidden = false;
    }

    /**
     * Takes the document of an AI link in the address: removes the # from the address, reads the
     * link and hands the document over, or says which parts are missing or that it is damaged.
     * @returns {Promise<void>}
     */
    async function importAddressLink() {
        if (!parseLink(location.hash)) return;
        const hash = location.hash;
        history.replaceState(null, '', location.pathname + location.search);
        showNotice('Loading…', '', null, true);
        const result = await readLink(hash);
        if (result.missing) {
            showNotice(`Part ${result.part} of ${result.of} received`, `Open the other ${result.missing.length === 1 ? 'link' : 'links'} from the AI too (still missing: part ${result.missing.join(', ')}).`);
            return;
        }
        if (result.error) { showNotice('The link could not be read', BROKEN_LINK_TEXT); return; }
        await sendToEditorTab(result);
    }

    /**
     * Gives a document from a link to the editor tab used last, or loads it here when there is none.
     * @param {import('./ai-tabs.js').LinkDocument} linkDocument - the document of the link.
     * @returns {Promise<void>}
     */
    async function sendToEditorTab({ text, mode, target }) {
        const ask = createRandomId();
        const tab = await findEditorTab(channel, ask);
        const sent = tab && await sendDocumentToTab(channel, tab, { text, mode, target }, ask);
        if (sent) {
            // "Open it here" opens the document the other tab saved; one that is not stored there (kept in memory) comes from the link again.
            showNotice('Taken over by your editor', 'The document is now in the QR Editor tab you already had open. Switch to that tab, or open it here.', () => { if (!sent.id || !openDocument(sent.id)) receiveDocument(text, mode, target); });
            return;
        }
        notice.hidden = true;
        receiveDocument(text, mode, target);
    }

    /**
     * Shows the page's AI settings in the dialog when the page around the editor takes the AI's
     * result on its own server (see sync.js): the page, its instructions, the step about the
     * result and the state of the key; the normal texts otherwise.
     * @returns {void}
     */
    function showRemote() {
        const remote = getRemoteSettings();
        remoteBox.hidden = !remote;
        privacy.textContent = !remote ? privacyText : isAnswerFromPage(remote)
            ? `${remote.label} gives the AI its instructions for answering. What you paste into your AI is handled by its provider.`
            : `The AI sends the document to ${remote.label} with a key that only works for this session. What you paste into your AI is handled by its provider.`;
        if (!remote) { stepLink.innerHTML = stepHtml; return; }
        document.getElementById('ai-remote-host').textContent = remote.site && remote.site !== remote.label ? `${remote.label} (${remote.site})` : remote.label;
        const details = document.getElementById('ai-remote-details');
        const pageTexts = getPageTexts(remote);
        details.hidden = !pageTexts;
        details.querySelector('span').textContent = remote.site || remote.label;
        document.getElementById('ai-remote-prompt').textContent = pageTexts;
        stepLink.textContent = isAnswerFromPage(remote)
            ? `The AI answers as ${remote.label} describes in the prompt. If it answers with a link, paste its answer below.`
            : `The AI sends its result to ${remote.label} by itself, and it opens here. If it answers with a link, paste its answer below.`;
        keyNote.textContent = !isKeyInPrompt(remote) ? '' : !remote.key ? '(no key yet)' : '(key valid while the editor is open)';
    }

    /**
     * Copies the prompt for the chosen target (the open document or a new one). With the page's
     * server in the prompt and no key yet, it asks the page for the key first; without one the
     * prompt asks for a link. A page that declines the key gives the message shown after copying.
     * @returns {Promise<void>} resolves when the prompt is copied or shown.
     */
    async function copyPrompt() {
        let remote = getRemoteSettings(), declined = '';
        if (isKeyInPrompt(remote) && !hasValidKey()) {
            await fetchKey();
            remote = getRemoteSettings();
            showRemote();
            if (remote && !hasValidKey()) { declined = getKeyDecline(); showToast(declined || `No key from ${remote.label} - the prompt asks the AI for a link instead`); }
        }
        const makeNew = dialog.querySelector('[name=ai-target]:checked').value === TARGET_NEW;
        const text = getPrompt({ ...getState(), framed: isFramed, remote: remote && remote.endpoint && !hasValidKey() ? { ...remote, key: '' } : remote }, makeNew);
        copyText(text, () => {
            showToast(declined || (remote && hasValidKey() && !isAnswerFromPage(remote) ? `Prompt copied - the AI sends its result to ${remote.label}` : 'Prompt copied - paste it into your AI and say what it should write'));
            dialog.close();
        });
    }

    /**
     * Copies text: to the clipboard, else with the copy command, else selected in a field to copy by
     * hand. Inside another website the editor may not use the clipboard API (the page has to allow
     * it with allow="clipboard-write").
     * @param {string} text - the text to copy.
     * @param {function(): void} onCopied - called once the text is copied.
     * @returns {Promise<void>}
     */
    async function copyText(text, onCopied) {
        try { await navigator.clipboard.writeText(text); showCopyDone(onCopied); return; } catch (error) { /* not allowed here */ }
        if (copyWithCommand(text)) { showCopyDone(onCopied); return; }
        handCopy.value = text;
        handCopy.hidden = false;
        handCopy.focus();
        handCopy.select();
        showToast('Copying is not allowed here - it is selected below: press Ctrl+C (⌘C)');
    }

    /**
     * Hides the field to copy by hand and runs what follows the copy.
     * @param {function(): void} onCopied - called once the text is copied.
     * @returns {void}
     */
    function showCopyDone(onCopied) {
        handCopy.hidden = true;
        onCopied();
    }

    /**
     * Copies text with the copy command, through a hidden field inside the open dialog (the only
     * place that can take the focus). Returns whether it took place.
     * @param {string} text - the text to copy.
     * @returns {boolean} true when the copy command copied the text.
     */
    function copyWithCommand(text) {
        const field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.cssText = HIDDEN_COPY_STYLE;
        dialog.append(field);
        field.select();
        let isCopied = false;
        try { isCopied = document.execCommand('copy'); } catch (error) { /* not allowed */ }
        field.remove();
        return isCopied;
    }

    /**
     * Takes the AI's answer pasted anywhere outside an input field.
     * @param {ClipboardEvent} event - the paste.
     * @returns {void}
     */
    function receivePastedAnswer(event) {
        const active = document.activeElement;
        if (active && active !== pasteField && active.matches(EDITABLE_SELECTOR)) return;
        const text = event.clipboardData.getData('text');
        if (!getLinksInText(text).length) return;
        event.preventDefault();
        pasteField.value = '';
        receiveAnswer(text);
    }

    /**
     * Takes the AI's answer typed or pasted into the field of the dialog, and empties the field.
     * @returns {void}
     */
    function receiveFieldAnswer() {
        if (getLinksInText(pasteField.value).length) receiveAnswer(pasteField.value).then(() => { pasteField.value = ''; });
    }

    /**
     * Takes every complete document in a pasted answer, in order (not only the last one); says
     * which parts are missing or that a link is damaged when none is complete. The same link
     * twice counts once, and a link already being taken is skipped.
     * @param {string} text - the pasted answer.
     * @returns {Promise<void>}
     */
    async function receiveAnswer(text) {
        const links = getLinksInText(text);
        if (!links.length) return;
        let last = null;
        const documents = [], ownLinks = [];
        try {
            for (const link of new Set(links)) {
                if (linksInFlight.has(link)) { last = last || { busy: true }; continue; }
                linksInFlight.add(link);
                ownLinks.push(link);
                const result = await readLink('#' + link);
                if (!result) continue;
                last = result;
                if (!result.missing && !result.error) documents.push(result);
            }
            if (!last) return;
            if (documents.length) {
                for (const linkDocument of documents) await receiveDocument(linkDocument.text, linkDocument.mode, linkDocument.target);
                dialog.close();
                return;
            }
            showAnswerProblem(last);
        } finally { for (const link of ownLinks) linksInFlight.delete(link); }
    }

    /**
     * Says why a pasted answer gave no document: the parts still missing, or a damaged link.
     * Nothing while its links are still being taken.
     * @param {Object} last - the LinkResult of the last link, or { busy: true } while its links are being taken elsewhere.
     * @returns {void}
     */
    function showAnswerProblem(last) {
        if (last.busy) return;
        if (last.missing) showToast(`Part ${last.part} of ${last.of} received - paste the other ${last.missing.length === 1 ? 'link' : 'links'} too (missing: ${last.missing.join(', ')})`);
        else if (last.error) showToast('This link is incomplete or damaged - please ask the AI to send it again');
    }
}
