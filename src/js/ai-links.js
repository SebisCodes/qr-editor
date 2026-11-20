/**
 * AI links: an AI sends a QR document as a link that carries it after the #
 * (that part never reaches a server):
 *   #b64=<base64url of the UTF-8 text>   #qr=<URL-encoded text>   #z=<base64url of zlib-compressed text>
 * optional &mode=add, &file=new&name=NAME (a new document in "My documents") or
 * &file=NAME (that document), and, for long documents, &part=N&of=M&id=NAME on
 * each of M links; the parts are collected in localStorage until all have arrived.
 *
 * readLink() runs these steps:
 *   1. parse the parameters after the #;
 *   2. for a document in parts: store this part and go on only when all are there;
 *   3. decode the text (URL-encoded, base64 or compressed) within the size limit.
 *
 * Terminals break long links over several lines, so getLinksInText() finds the
 * links in a whole pasted answer and joins their lines.
 */

export const EDITOR_PREFIX = 'qreditor';          // storage keys, the tab channel and the page messages
export const LINK_KIND = 'qr';                     // #qr= and the code fence of the prompt
const BASE64_KIND = 'b64';
const COMPRESSED_KIND = 'z';
const LINK_KINDS = [BASE64_KIND, COMPRESSED_KIND, LINK_KIND];
const PARTS_KEY_PREFIX = EDITOR_PREFIX + '.parts.';
const MAX_TEXT = 5e6;                              // a link never carries more than this (also unpacked)
const MAX_LINK_LENGTH = MAX_TEXT * 1.4;            // the encoded form of MAX_TEXT, with room for base64
const MAX_PARTS = 200;
const PART_LIFETIME_MS = 30 * 60e3;                // parts belong together only within half an hour
const MAX_ID_LENGTH = 60;
const MAX_TARGET_LENGTH = 80;
const DEFAULT_PART_ID = 'document';
const MODE_ADD = 'add';
const MODE_SET = 'set';
const COMPRESSION_FORMATS = ['deflate', 'deflate-raw', 'gzip'];
/** The characters of one base64 group; a text without its = padding is filled up to whole groups. */
const BASE64_GROUP = 4;
const LINK_START_SOURCE = `#((?:b64|z|${LINK_KIND})=)`;
const NEXT_LINK_START = new RegExp(`#(?:b64|z|${LINK_KIND})=`);
const LINK_CHARACTERS = /^[A-Za-z0-9\-_=&%+/.~]+$/;
const CONTINUED_LINE = /^[ \t]*\r?\n[ \t]*([^\s]+)[ \t]*(?=\r?\n|$)/;
const WHITESPACE = /\s/;
const TRAILING_PUNCTUATION = /[)>\].,`*'"]+$/;
const REPLACEMENT_CHARACTER = /\uFFFD/;       // marks bytes of the link that are not valid UTF-8

/**
 * Where the AI wants its document: a new one, one by name, or the open one.
 * @typedef {Object} LinkTarget
 * @property {string} file - "new", the name of a document, or "" for the open one.
 * @property {string} name - the name of a new document, or "".
 */

/**
 * The parameters of a link after the #.
 * @typedef {Object} LinkParameters
 * @property {string} kind - "b64", "z" or "qr": how the document is encoded.
 * @property {string} data - the encoded document, or this part of it.
 * @property {string} mode - "add" or "set".
 * @property {number} part - the number of this part, 0 for a link without parts.
 * @property {number} of - how many parts the document has, 0 for a link without parts.
 * @property {string} id - the name that holds the parts of one document together.
 * @property {LinkTarget} target - where the document goes.
 */

/**
 * What one link gives: the document, the parts still missing, or an error.
 * @typedef {Object} LinkResult
 * @property {string} [text] - the QR document, when it is complete.
 * @property {string} [mode] - "add" or "set", with text.
 * @property {LinkTarget} [target] - where the document goes, with text.
 * @property {Array<number>} [missing] - the numbers of the parts still missing.
 * @property {number} [part] - the number of this part, with missing.
 * @property {number} [of] - how many parts the document has, with missing.
 * @property {boolean} [error] - true when the link is incomplete, damaged or too big.
 */

/**
 * The parts of one document collected so far, as they are stored.
 * @typedef {Object} StoredParts
 * @property {number} of - how many parts the document has.
 * @property {Object<string, string>} p - the parts that have arrived, by number.
 * @property {number} t - when the collection started (ms since the epoch).
 */

/**
 * Reads the document of one link. For a document in parts it stores this part until all have
 * arrived: a reader that consumes its input as it goes.
 * @param {string} hash - the part of the link from the #.
 * @returns {Promise<LinkResult|null>} what the link gives, or null when it carries no document.
 */
export async function readLink(hash) {
    const link = parseLink(hash);
    if (!link) return null;
    let data = link.data;
    if (link.of > 1) {
        const collected = addLinkPart(link);
        if (collected.error) return { error: true };
        if (collected.missing) return { missing: collected.missing, part: link.part, of: link.of };
        data = collected.data;
    }
    try {
        const text = await convertFromLinkData(link.kind, data);
        if (!text.trim() || REPLACEMENT_CHARACTER.test(text)) throw new Error('no text');
        return { text, mode: link.mode, target: link.target };
    } catch (error) { return { error: true }; }
}

/**
 * Returns the parameters of a link after the #.
 * @param {string} hash - the part of the link from the #.
 * @returns {LinkParameters|null} the parameters, or null when the link carries no document.
 */
export function parseLink(hash) {
    const parameters = parseHashParameters(hash);
    const kind = LINK_KINDS.find(name => parameters.has(name));
    if (!kind) return null;
    return {
        kind, data: parameters.get(kind),
        mode: parameters.get('mode') === MODE_ADD ? MODE_ADD : MODE_SET,
        part: +parameters.get('part') || 0, of: +parameters.get('of') || 0, id: (parameters.get('id') || DEFAULT_PART_ID).slice(0, MAX_ID_LENGTH),
        target: { file: (parameters.get('file') || '').slice(0, MAX_TARGET_LENGTH), name: (parameters.get('name') || '').replace(/\+/g, ' ').slice(0, MAX_TARGET_LENGTH) },
    };
}

/**
 * Returns the name=value pairs after the #, decoded. Split by hand: URLSearchParams would turn
 * the "+" of normal base64 into spaces.
 * @param {string} hash - the part of the link from the #.
 * @returns {Map<string, string>} the values by name; a value that cannot be decoded stays as it is.
 */
function parseHashParameters(hash) {
    const parameters = new Map();
    for (const pair of hash.replace(/^#/, '').split('&')) {
        const separator = pair.indexOf('=');
        if (separator < 0) continue;
        let value = pair.slice(separator + 1);
        try { value = decodeURIComponent(value); } catch (error) { /* keep it as it is */ }
        parameters.set(pair.slice(0, separator), value);
    }
    return parameters;
}

/**
 * Returns the link parts (after the #) in a pasted text. A link that a terminal broke over
 * several lines continues on the following lines as long as they consist of link characters only.
 * @param {string} text - the pasted text, such as the whole answer of an AI.
 * @returns {Array<string>} the links without the #, in order.
 */
export function getLinksInText(text) {
    const links = [];
    const linkStart = new RegExp(LINK_START_SOURCE, 'g');
    let match;
    while ((match = linkStart.exec(text))) {
        const { link, end } = getLinkAt(text, match.index + 1);
        links.push(link);
        linkStart.lastIndex = end;
    }
    return links;
}

/**
 * Returns the link that starts at a position, joined with the lines that continue it.
 * @param {string} text - the pasted text.
 * @param {number} start - the position right after the #.
 * @returns {{link: string, end: number}} the link without trailing punctuation, and the position after it.
 */
function getLinkAt(text, start) {
    let position = start, link = '';
    while (position < text.length && !WHITESPACE.test(text[position])) link += text[position++];
    for (;;) {
        const continued = text.slice(position).match(CONTINUED_LINE);
        if (!continued || !LINK_CHARACTERS.test(continued[1]) || NEXT_LINK_START.test(continued[1])) break;
        link += continued[1];
        position += continued[0].length;
    }
    return { link: link.replace(TRAILING_PUNCTUATION, ''), end: position };
}

/**
 * Decodes the document of a link.
 * @param {string} kind - "b64", "z" or "qr".
 * @param {string} data - the encoded document (all parts joined).
 * @returns {Promise<string>} the document text.
 * @throws {Error} when the link is too long or the compressed document cannot be unpacked.
 */
async function convertFromLinkData(kind, data) {
    if (data.length > MAX_LINK_LENGTH) throw new Error('The link is too long.');
    if (kind === LINK_KIND) return data;
    const bytes = convertFromBase64(data);
    return kind === COMPRESSED_KIND ? expandCompressed(bytes) : new TextDecoder().decode(bytes);
}

/**
 * Returns the bytes of base64 or base64url text; spaces count as "+", line breaks are dropped.
 * @param {string} text - the base64 text, with or without padding.
 * @returns {Uint8Array} the bytes.
 * @throws {Error} when the text is not base64.
 */
function convertFromBase64(text) {
    const base64 = text.replace(/ /g, '+').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    const binary = atob(base64 + '='.repeat((BASE64_GROUP - base64.length % BASE64_GROUP) % BASE64_GROUP));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

/**
 * Unpacks compressed bytes; tries zlib, raw deflate and gzip in turn.
 * @param {Uint8Array} bytes - the compressed document.
 * @returns {Promise<string>} the document text.
 * @throws {Error} when it unpacks to more than MAX_TEXT or none of the formats fits.
 */
async function expandCompressed(bytes) {
    for (const format of COMPRESSION_FORMATS) {
        try {
            return await expandWithFormat(bytes, format);
        } catch (error) {
            if (error instanceof RangeError) throw new Error('The link unpacks to more than 5 MB - it is not opened.');
        }
    }
    throw new Error('The compressed document could not be unpacked.');
}

/**
 * Unpacks compressed bytes in one format. A small link that unpacks to a huge text is no
 * document, so the reading stops at MAX_TEXT.
 * @param {Uint8Array} bytes - the compressed document.
 * @param {string} format - "deflate", "deflate-raw" or "gzip".
 * @returns {Promise<string>} the document text.
 * @throws {RangeError} when the text grows beyond MAX_TEXT.
 * @throws {Error} when the bytes are not in this format.
 */
async function expandWithFormat(bytes, format) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_TEXT) { reader.cancel(); throw new RangeError('too big'); }
        chunks.push(value);
    }
    return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}

/**
 * Stores one part of a document and returns what the collection holds: a reader that consumes
 * its input as it goes. Too many parts, or too much text, end the collection.
 * @param {LinkParameters} link - the parameters of the link with this part.
 * @returns {{error: boolean}|{missing: Array<number>}|{data: string}} an error, the missing part numbers, or all parts joined.
 */
function addLinkPart(link) {
    const key = PARTS_KEY_PREFIX + link.kind + '.' + link.id;
    const parts = getStoredParts(key, link);
    parts.p[link.part] = link.data;
    if (link.of > MAX_PARTS || getPartsLength(parts) > MAX_LINK_LENGTH) {
        try { localStorage.removeItem(key); } catch (error) { /* storage blocked */ }
        return { error: true };
    }
    const missing = getMissingParts(link.of, parts);
    try {
        if (missing.length) localStorage.setItem(key, JSON.stringify(parts));
        else localStorage.removeItem(key);
    } catch (error) { /* storage blocked: parts cannot be collected */ }
    return missing.length ? { missing } : { data: Array.from({ length: link.of }, (_, index) => parts.p[index + 1]).join('') };
}

/**
 * Returns the stored parts of a document, or a new empty collection when there are none, when
 * they belong to a document with another number of parts, or when they are older than half an hour.
 * @param {string} key - the storage key of the collection.
 * @param {LinkParameters} link - the parameters of the link with this part.
 * @returns {StoredParts} the collection.
 */
function getStoredParts(key, link) {
    let parts = {};
    try { parts = JSON.parse(localStorage.getItem(key) || '{}'); } catch (error) { /* storage blocked */ }
    if (parts.of !== link.of || !(Date.now() - (parts.t || 0) < PART_LIFETIME_MS)) parts = { of: link.of, p: {}, t: Date.now() };
    return parts;
}

/**
 * Returns the length of all collected parts together.
 * @param {StoredParts} parts - the collection.
 * @returns {number} the number of characters.
 */
function getPartsLength(parts) {
    return Object.values(parts.p).reduce((sum, part) => sum + part.length, 0);
}

/**
 * Returns the numbers of the parts that have not arrived yet.
 * @param {number} count - how many parts the document has.
 * @param {StoredParts} parts - the collection.
 * @returns {Array<number>} the missing numbers, 1-based and in order.
 */
function getMissingParts(count, parts) {
    const missing = [];
    for (let number = 1; number <= count; number++) if (!(number in parts.p)) missing.push(number);
    return missing;
}
