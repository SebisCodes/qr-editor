/**
 * Text helpers of the content formats (payload.js and its modules): lines, the
 * UTF-8 length, percent-encoding and query strings of URIs, "KEY:value" parts,
 * and the backslash escapes of WiFi, MeCard, vCard and iCalendar values.
 */

const LINE_BREAK = /\r?\n/;
const ESCAPE_CHARACTER = '\\';
const QUERY_SEPARATOR = '&';
const QUERY_ASSIGNMENT = '=';
const KEY_SEPARATOR = ':';

/**
 * Splits a text into its lines (LF or CRLF).
 * @param {string} text - the text.
 * @returns {Array<string>} the lines without their line breaks.
 */
export function splitLines(text) {
    return String(text).split(LINE_BREAK);
}

/**
 * Returns the number of bytes of a text in UTF-8.
 * @param {string} text - the text.
 * @returns {number} the length in bytes.
 */
export function getUtf8Length(text) {
    return new TextEncoder().encode(text).length;
}

/**
 * Percent-encodes a value for a URI (a space as %20).
 * @param {string} value - the value.
 * @returns {string} the encoded value.
 */
export function convertToUriValue(value) {
    return encodeURIComponent(value);
}

/**
 * Decodes a percent-encoded value; "+" is a space. A value that is not valid percent-encoding stays as written.
 * @param {string} value - the encoded value.
 * @returns {string} the decoded value.
 */
export function convertFromUriValue(value) {
    try { return decodeURIComponent(String(value).replace(/\+/g, ' ')); } catch (error) { return String(value); }
}

/**
 * Reads the parameters of a query string; names in lower case, the first of a name counts.
 * @param {string} queryText - the part after "?", without it.
 * @returns {Object<string, string>} the decoded values by name.
 */
export function parseQuery(queryText) {
    const parameters = {};
    for (const part of String(queryText || '').split(QUERY_SEPARATOR)) {
        if (!part) continue;
        const assignment = part.indexOf(QUERY_ASSIGNMENT);
        const name = convertFromUriValue(assignment < 0 ? part : part.slice(0, assignment)).toLowerCase();
        if (!(name in parameters)) parameters[name] = assignment < 0 ? '' : convertFromUriValue(part.slice(assignment + 1));
    }
    return parameters;
}

/**
 * Writes a query string from name and value pairs; empty values are left out.
 * @param {Array<Array<string>>} pairs - [name, value] in the order they are written.
 * @returns {string} the query string without "?", empty when no value is set.
 */
export function buildQuery(pairs) {
    return pairs.filter(([, value]) => value !== '' && value != null).map(([name, value]) => `${name}=${convertToUriValue(value)}`).join(QUERY_SEPARATOR);
}

/**
 * Splits a text at a separator that is not escaped with a backslash; the escapes stay in the parts.
 * @param {string} text - the text.
 * @param {string} separator - the separator character.
 * @returns {Array<string>} the parts.
 */
export function splitEscaped(text, separator) {
    const parts = [];
    let current = '';
    for (let i = 0; i < text.length; i++) {
        if (text[i] === ESCAPE_CHARACTER && i + 1 < text.length) { current += text[i] + text[i + 1]; i++; continue; }
        if (text[i] === separator) { parts.push(current); current = ''; continue; }
        current += text[i];
    }
    parts.push(current);
    return parts;
}

/**
 * A part "KEY:value" of a WiFi, MATMSG or MeCard text.
 * @typedef {Object} KeyValue
 * @property {string} key - the key in upper case.
 * @property {string} value - the value as written, with its escapes.
 */

/**
 * Splits a part "KEY:value" of a WiFi, MATMSG or MeCard text.
 * @param {string} part - the part.
 * @returns {?KeyValue} the key and the value, null without a colon.
 */
export function getKeyAndValue(part) {
    const colon = part.indexOf(KEY_SEPARATOR);
    if (colon < 0) return null;
    return { key: part.slice(0, colon).toUpperCase(), value: part.slice(colon + 1) };
}

/**
 * Removes the backslash escapes of a WiFi or MeCard value: "\x" becomes "x".
 * @param {string} text - the escaped value.
 * @returns {string} the plain value.
 */
export function removeEscapes(text) {
    return text.replace(/\\(.)/g, '$1');
}

/**
 * Escapes a WiFi value as ZXing reads it: \ ; , : and " get a backslash.
 * @param {string} text - the value.
 * @returns {string} the escaped value.
 */
export function escapeWifi(text) {
    return String(text).replace(/([\\;,:"])/g, '\\$1');
}

/**
 * Escapes a MeCard value: \ ; , and : get a backslash.
 * @param {string} text - the value.
 * @returns {string} the escaped value.
 */
export function escapeMecard(text) {
    return String(text).replace(/([\\;,:])/g, '\\$1');
}

/**
 * Escapes a vCard or iCalendar text value: \ ; and , get a backslash, a line break becomes \n.
 * @param {string} text - the value.
 * @returns {string} the escaped value.
 */
export function escapeIcs(text) {
    return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/**
 * Reads a vCard or iCalendar text value: \n and \N are line breaks, \\ \; and \, the character itself.
 * @param {string} text - the escaped value.
 * @returns {string} the plain value.
 */
export function parseIcsText(text) {
    return String(text).replace(/\\([nN\\;,])/g, (escape, character) => (character === 'n' || character === 'N' ? '\n' : character));
}
