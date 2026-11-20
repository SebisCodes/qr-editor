/**
 * The AI prompt: instructions and the current document that "Copy prompt" puts
 * on the clipboard. The texts are what the AI reads; the AI answers with a link
 * (ai-links.js) or, through the page around the editor, with an HTTP request.
 *
 * getPrompt() puts the prompt together in these steps:
 *   1. the head: the editor's instructions (PROMPT_HEAD), or PROMPT_BASE with the page
 *      that holds the document, or the instructions for the page's own server;
 *   2. inside another website: the note that a clicked link does not reach the editor;
 *   3. without the page's server: the list of documents and what to change;
 *   4. the document with what the editor reports about it, then "My request: ".
 */

import { EDITOR_PREFIX, LINK_KIND } from './ai-links.js?v=3';

const SITE = 'https://qr.giit.ch/';
const DOCUMENT_SECTION = 'THE QR DOCUMENT';
const MAX_LISTED_FILES = 40;
const MAX_LISTED_PROBLEMS = 12;
const MAX_SELECTION_LENGTH = 300;
const SECTION_HEADING = /\n\n[A-Z][A-Z ]+\n/;
const FENCE = /`{3,}/g;                            // a code fence inside site text would end the fence around it

/**
 * The page that holds the document, from the page around the editor (plain text from that page).
 * @typedef {Object} PageContext
 * @property {string} [host] - the host of the page.
 * @property {string} [site] - the real origin of the page.
 * @property {string} [title] - the page's title for the document.
 * @property {string} [rules] - the page's rules for the document.
 */

/**
 * The AI settings of the page around the editor when it takes the AI's result on its own server (see sync.js).
 * @typedef {Object} RemoteSettings
 * @property {string} label - the name of the page's AI.
 * @property {string} [site] - the real origin of the page.
 * @property {string} [prompt] - the page's instructions for the AI.
 * @property {string} [endpoint] - the address the AI sends its result to.
 * @property {string} [key] - the session's key, empty while there is none.
 * @property {boolean} [base] - whether the prompt starts with the editor's own short instructions.
 */

/**
 * What the prompt is made from.
 * @typedef {Object} PromptState
 * @property {string} name - the name of the open document.
 * @property {string} code - the open QR document.
 * @property {Array<string>} files - the names of all documents.
 * @property {string} [about] - what the editor knows about the code (type, version, scan check).
 * @property {Array<string>} [problems] - the problems the editor reports.
 * @property {string} [sel] - the selected text.
 * @property {PageContext|null} [context] - the page that holds the document.
 * @property {RemoteSettings|null} [remote] - the page's AI settings.
 * @property {boolean} [framed] - whether the editor is inside another website.
 */

/**
 * The editor's instructions for the AI: the QR document, how to answer, what the editor shows.
 * @type {string}
 */
export const PROMPT_BASE = `You make QR codes in my editor ${SITE}. It runs in my browser, draws the code from a small text document, checks that it scans and exports it as SVG, PNG, PDF or EPS.

THE QR DOCUMENT
Optional design lines "key: value", then a line "---", then the content exactly as it goes into the code (everything after the --- line; one final line break is ignored). Text without design lines and without "---" is all content. Lines starting with # in the design part are comments.
Design keys (all optional): ecc L|M|Q|H (error correction, default M; use Q or H with a logo), margin 0-20 (quiet zone in modules, keep 4), color #rrggbb (dark color), color2 #rrggbb with gradient linear|radial and angle 0-360, background #rrggbb or transparent, modules square|rounded|dots|soft|diamond|bars-v|bars-h, eye-frame square|rounded|circle|leaf, eye-ball square|rounded|circle|diamond|leaf, eye-color #rrggbb, logo none|wifi|web|mail|phone|chat|pin|calendar|user|pay|star|heart (or a picture as data:image/png;base64,...), logo-size 5-30 (percent of the width), logo-clear yes|no, caption <one line of text>, caption-position below|above, frame none|line|filled, frame-color #rrggbb, version auto|1-40, mask auto|0-7, boost yes|no.
Keep the dark color dark and the background light (contrast 4.5:1 or more), so the code scans.
Content formats (write them exactly like this, phones read these):
- Link: https://example.com
- WiFi: WIFI:T:WPA;S:<network>;P:<password>;; (T:WPA also for WPA2/WPA3, T:WEP, T:nopass for open networks; H:true; for hidden; escape \ ; , : " with a backslash)
- Contact: vCard 3.0 (BEGIN:VCARD, VERSION:3.0, N:Last;First;;;, FN:, ORG:, TITLE:, TEL;TYPE=CELL:, EMAIL:, URL:, ADR;TYPE=WORK:;;street;city;region;zip;country, NOTE:, END:VCARD, one property per line) or MECARD:N:Last,First;TEL:...;EMAIL:...;;
- Email: mailto:<address>?subject=<percent-encoded>&body=<percent-encoded>
- SMS: SMSTO:<number>:<text>   Phone: tel:<+41...>   Location: geo:<lat>,<lon>
- Event: BEGIN:VEVENT, SUMMARY:, DTSTART:YYYYMMDDTHHMMSS, DTEND:..., LOCATION:, DESCRIPTION:, END:VEVENT (all day: DTSTART;VALUE=DATE:YYYYMMDD)
- Crypto: bitcoin:<address>?amount=<BTC>&label=...&message=...   ethereum:<address>?value=<wei>
- SEPA payment (EPC, ecc M): lines BCD, 002, 1, SCT, <BIC or empty>, <name max 70>, <IBAN>, EUR<amount with point>, <purpose or empty>, <RF reference or empty>, <text if no reference>; at most 331 bytes, no line break after the last line.
- Swiss QR bill: the Swiss Payments Code (SPC, 0200, 1, IBAN, S, name, street, number, postal code, town, country, 7 empty lines, amount, CHF|EUR, debtor S + 6 lines or 7 empty lines, QRR|SCOR|NON, reference, message, EPD); QR-IBAN only with QRR and CHF. The editor draws it as the standard requires and ignores design lines.
Placeholders {{column}} in the content are filled from a table when the user makes many codes at once.

HOW TO ANSWER
Write the complete QR document. Keep my content and design unless I ask otherwise.
Send it as a link: ${SITE}#b64=<base64url of the UTF-8 text> (shorter: zlib-compress first and use #z=; without code: #qr=<URL-encoded text>). Open the link yourself if you can; otherwise give it to me - I click it or paste your whole answer into the editor.
- New document: add &file=new&name=<short name>. Change one of my documents: add &file=<its exact name>.
- Longer than about 8000 characters (a picture logo): one link per part with &part=N&of=M&id=<short name>.

WHAT THE EDITOR SHOWS
The code drawn with its design, whether it scans (it reads its own drawing back: normal, small, blurred), the content type with a form, and problems with their line: contrast, quiet zone, a logo larger than the error correction can repair, content too long, invalid IBAN or references, link shorteners that stop working when their service ends.`;

/**
 * The part about the user's own server; left out when a page that holds the document opened the
 * editor (it saves there by itself).
 * @type {string}
 */
export const PROMPT_SAVING = `MY OWN SERVER (only if I ask about it)
The editor can POST every saved version as JSON {editor, event:"save", id, name, content, updated} to my server (webhook, optional Bearer token, CORS from ${SITE.replace(/\/$/, '')}); content is the document as a string. It can be embedded with <iframe src="${SITE}?embed=1"> or opened with window.open("${SITE}?embed=window") and then talks with postMessage (${EDITOR_PREFIX}:ready, load, loaded, change, save, get, ai, key-request). If I ask you to build that, follow ${SITE}llms.txt exactly.`;

/**
 * The head of the prompt in the editor's own site: PROMPT_BASE and PROMPT_SAVING.
 * @type {string}
 */
export const PROMPT_HEAD = `${PROMPT_BASE}\n\n${PROMPT_SAVING}`;

/**
 * Returns the whole prompt: instructions, the user's documents, the open document and "My request: ".
 * @param {PromptState} promptState - the open document and what the editor knows about it.
 * @param {boolean} makeNew - true when the AI makes a new document, false when it changes the open one.
 * @returns {string} the prompt.
 */
export function getPrompt(promptState, makeNew) {
    const head = getPromptHead(promptState, makeNew);
    const request = promptState.remote ? '' : `${getDocumentList(promptState)}\n${getGoal(promptState, makeNew)}\n\n`;
    return `${head}\n\n${request}${getDocumentPart(promptState, makeNew)}`;
}

/**
 * Returns the head of the prompt: the instructions for the page's server, PROMPT_BASE with the
 * page that holds the document, or PROMPT_HEAD; inside another website with the note about links.
 * @param {PromptState} promptState - the open document and what the editor knows about it.
 * @param {boolean} makeNew - whether the AI makes a new document.
 * @returns {string} the head.
 */
function getPromptHead(promptState, makeNew) {
    const head = promptState.remote ? getRemotePrompt(promptState, promptState.remote, makeNew)
        : promptState.context ? `${PROMPT_BASE}\n\n${getContextPart(promptState.context)}` : PROMPT_HEAD;
    if (!promptState.framed || promptState.remote) return head;
    return head + `\n\nMy editor is inside another website, so a clicked link does not reach it: do not open the link yourself - give it to me and I paste your answer.`;
}

/**
 * Returns the line with the open document and up to 40 others.
 * @param {PromptState} promptState - the open document and the names of all documents.
 * @returns {string} the line.
 */
function getDocumentList(promptState) {
    const others = promptState.files.filter(name => name !== promptState.name);
    const otherList = others.length ? `. Others: ${others.slice(0, MAX_LISTED_FILES).map(name => `"${name}"`).join(', ')}${others.length > MAX_LISTED_FILES ? ' …' : ''}` : '';
    return `Open now: "${promptState.name}"${otherList}.`;
}

/**
 * Returns the line that says which document the AI writes.
 * @param {PromptState} promptState - the open document.
 * @param {boolean} makeNew - whether the AI makes a new document.
 * @returns {string} the line.
 */
function getGoal(promptState, makeNew) {
    return makeNew
        ? 'Unless I say otherwise in my request, make a NEW document (&file=new&name=<short name>) and leave my documents as they are.'
        : `Unless I say otherwise in my request, change "${promptState.name}" (&file=${encodeURIComponent(promptState.name)}).`;
}

/**
 * Returns the open document under its heading, with the selection, what the editor knows and its
 * problems, fenced as a QR document, and then "My request: ".
 * @param {PromptState} promptState - the open document and what the editor knows about it.
 * @param {boolean} makeNew - whether the AI makes a new document.
 * @returns {string} the document part.
 */
function getDocumentPart(promptState, makeNew) {
    const heading = getDocumentHeading(promptState, makeNew);
    const selection = promptState.sel ? ` (I have selected: "${promptState.sel.slice(0, MAX_SELECTION_LENGTH)}")` : '';
    const about = promptState.about ? `\n${promptState.about}` : '';
    const problems = promptState.problems && promptState.problems.length ? `\nThe editor reports: ${promptState.problems.slice(0, MAX_LISTED_PROBLEMS).join('; ')}` : '';
    return `${heading}${selection}${about}${problems}\n\`\`\`${LINK_KIND}\n${promptState.code.trim()}\n\`\`\`\n\nMy request: `;
}

/**
 * Returns the heading of the open document in the prompt.
 * @param {PromptState} promptState - the open document.
 * @param {boolean} makeNew - whether the AI makes a new document.
 * @returns {string} the heading.
 */
function getDocumentHeading(promptState, makeNew) {
    if (promptState.remote) return `MY ${makeNew ? 'CURRENT' : ''} DOCUMENT "${promptState.name}"`.replace('  ', ' ');
    return makeNew ? `MY OPEN DOCUMENT "${promptState.name}" (for reference only - do not change it)` : `MY CURRENT DOCUMENT "${promptState.name}"`;
}

/**
 * Returns the part about the page that holds the document: it gets every saved version back by itself.
 * @param {PageContext} context - the page that holds the document.
 * @returns {string} the part.
 */
function getContextPart(context) {
    return `THIS DOCUMENT BELONGS TO ${context.host ? `"${context.host}"` : 'a website'}${context.title ? ` ("${context.title}")` : ''}
That page opened the editor and gets every saved version back by itself when I click Save (or press Ctrl+S) - nothing to set up and no server to build. Keep the document working with that page.${context.rules ? `\n\n${formatSiteText('RULES', context.site, context.host, context.rules)}` : ''}`;
}

/**
 * Returns text from a website, marked as such: where it comes from (the real origin) and fenced,
 * so the AI can tell it apart from what the user writes.
 * @param {string} head - the heading, such as "RULES" or "INSTRUCTIONS".
 * @param {string} [site] - the real origin of the page.
 * @param {string} [label] - the name the page gives itself.
 * @param {string} text - the page's text.
 * @returns {string} the marked and fenced text.
 */
function formatSiteText(head, site, label, text) {
    return `${head} ${site ? `FROM THE WEBSITE ${site}` : 'FROM THE WEBSITE'}${label && label !== site ? ` ("${label}")` : ''}\n\`\`\`text\n${text.replace(FENCE, "'''")}\n\`\`\``;
}

/**
 * Returns one section of PROMPT_BASE, from its heading to the next one.
 * @param {string} heading - the heading of the section.
 * @returns {string} the section, or "" when there is none.
 */
function getPromptSection(heading) {
    const start = PROMPT_BASE.indexOf('\n' + heading + '\n');
    if (start < 0) return '';
    const rest = PROMPT_BASE.slice(start + 1), end = rest.search(SECTION_HEADING);
    return end < 0 ? rest : rest.slice(0, end);
}

/**
 * Returns the head of the prompt when the page around the editor takes the AI's result on its
 * own server: the AI sends the result there itself, and the page then opens it here.
 * @param {PromptState} promptState - the open document and the page that holds it.
 * @param {RemoteSettings} remote - the page's AI settings.
 * @param {boolean} makeNew - whether the AI makes a new document.
 * @returns {string} the head.
 */
function getRemotePrompt(promptState, remote, makeNew) {
    const parts = [];
    if (remote.base) parts.push(getRemoteBase(remote));
    if (remote.prompt) parts.push(formatSiteText('INSTRUCTIONS', remote.site, remote.label, remote.prompt));
    if (promptState.context && promptState.context.rules) parts.push(formatSiteText('RULES', remote.site, remote.label, promptState.context.rules));
    parts.push(getRemoteAnswer(promptState, remote, makeNew));
    return parts.join('\n\n');
}

/**
 * Returns the editor's own short instructions for the page's AI, with the section about the QR document.
 * @param {RemoteSettings} remote - the page's AI settings.
 * @returns {string} the instructions.
 */
function getRemoteBase(remote) {
    const documentSection = getPromptSection(DOCUMENT_SECTION);
    return `You make a QR code in my QR editor ${SITE}, inside the website "${remote.label}".\nWrite the complete QR document. Keep my content and design unless I ask otherwise.${documentSection ? '\n\n' + documentSection : ''}`;
}

/**
 * Returns HOW TO ANSWER for the page's AI: one HTTP request to the page's server while there is a
 * key, a link to paste otherwise.
 * @param {PromptState} promptState - the open document.
 * @param {RemoteSettings} remote - the page's AI settings.
 * @param {boolean} makeNew - whether the AI makes a new document.
 * @returns {string} the section.
 */
function getRemoteAnswer(promptState, remote, makeNew) {
    const target = makeNew ? 'new' : 'current';
    const what = makeNew ? `Make a NEW document; leave "${promptState.name}" as it is.` : `Change my document "${promptState.name}".`;
    const link = `${SITE}#b64=<base64url of the UTF-8 QR document>${makeNew ? '&file=new&name=<short name>' : ''}`;
    if (!remote.endpoint || !remote.key) return `HOW TO ANSWER\n${what} Give me the link ${link}; I paste your answer into the editor (a clicked link does not reach it).`;
    return `HOW TO ANSWER
${what} Send the result with one HTTP request (run it, do not only show it):
  POST ${remote.endpoint}
  Authorization: Bearer ${remote.key}
  Content-Type: application/json
  {"editor":"${LINK_KIND}","target":"${target}","name":"<short name>","content":"<the complete QR document as one string>"}
Build the JSON of the request with a JSON library. The result then opens in my editor; tell me briefly what you did, or the server's error message.
If you cannot send HTTP requests, give me the link ${link} and I paste your answer into the editor.`;
}
