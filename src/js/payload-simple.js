/**
 * The short content formats: link, text, WiFi as ZXing reads it
 * (WIFI:T:…;S:…;P:…;H:true;;), email (mailto: after RFC 6068, MATMSG:),
 * SMS (SMSTO:, SMS:, sms: after RFC 5724), phone (tel: after RFC 3966) and
 * location (geo: after RFC 5870). Each type has a parse… function that reads
 * its fields from the content and a build… function that writes the content
 * in the canonical form of the type.
 */

import {
    buildQuery, convertFromUriValue, convertToUriValue, escapeWifi, getKeyAndValue, parseQuery, removeEscapes, splitEscaped,
} from './payload-text.js?v=2';

const WIFI_PREFIX = /^WIFI:/i;
const WIFI_TYPE_PART = /;T:/i;
const QUOTED = /^"(.*)"$/;
const MATMSG_PREFIX = 'MATMSG:';
const MATMSG_PATTERN = /^MATMSG:/i;
const MAILTO_PREFIX = /^mailto:/i;
const SMS_URI = /^sms:([^?]*)\??(.*)$/;                       // sms: (RFC 5724, lower case) carries the text as ?body=
const SMSTO_TEXT = /^(?:SMSTO|SMS):([^:]*):?([\s\S]*)$/i;    // SMSTO: / SMS: as number:text
const TEL_PREFIX = /^tel:/i;
const GEO_URI = /^geo:([^,;?]*),([^,;?]*)[^?]*\??(.*)$/i;
const GEO_LABEL = /^[-\d.]+,[-\d.]+\s*\((.*)\)$/;            // q=lat,lon(label)

/**
 * Reads the address of a link.
 * @param {string} content - the content.
 * @returns {{url: string}} the fields.
 */
export function parseLink(content) {
    return { url: content.trim() };
}

/**
 * Writes a link.
 * @param {Object<string, string>} fields - the fields: url.
 * @returns {string} the content.
 */
export function buildLink(fields) {
    return String(fields.url || '').trim();
}

/**
 * Reads a text.
 * @param {string} content - the content.
 * @returns {{text: string}} the fields.
 */
export function parseText(content) {
    return { text: content };
}

/**
 * Writes a text.
 * @param {Object<string, string>} fields - the fields: text.
 * @returns {string} the content.
 */
export function buildText(fields) {
    return String(fields.text || '');
}

/**
 * Reads a WiFi network; without T: the network counts as open unless it has a password.
 * @param {string} content - the content WIFI:….
 * @returns {Object<string, *>} ssid, auth ("WPA", "WEP", "nopass"), password, hidden and rawT (T: as written, when there).
 */
export function parseWifi(content) {
    const fields = { ssid: '', auth: 'WPA', password: '', hidden: false };
    const body = content.replace(WIFI_PREFIX, '');
    for (const part of splitEscaped(body, ';')) setWifiField(fields, getKeyAndValue(part));
    if (!WIFI_TYPE_PART.test(';' + body)) fields.auth = fields.password ? 'WPA' : 'nopass';
    return fields;
}

/**
 * Sets the field of one part S:, T:, P: or H: of a WiFi text.
 * @param {Object<string, *>} fields - the fields being read.
 * @param {?KeyValue} part - the part (getKeyAndValue), null for a part without a colon.
 * @returns {void}
 */
function setWifiField(fields, part) {
    if (!part) return;
    const value = removeEscapes(part.value);
    if (part.key === 'S') fields.ssid = value.replace(QUOTED, '$1');
    else if (part.key === 'T') { fields.auth = getWifiAuth(value); fields.rawT = value; }
    else if (part.key === 'P') fields.password = value.replace(QUOTED, '$1');
    else if (part.key === 'H') fields.hidden = /^true$/i.test(value);
}

/**
 * Returns the security of a WiFi network from its T: value.
 * @param {string} type - the value of T:.
 * @returns {string} "nopass" (empty or nopass), "WEP" or "WPA" (everything else).
 */
function getWifiAuth(type) {
    if (/^nopass$/i.test(type) || type === '') return 'nopass';
    return /^WEP$/i.test(type) ? 'WEP' : 'WPA';
}

/**
 * Writes a WiFi network; an open network has no P:.
 * @param {Object<string, *>} fields - ssid, auth, password and hidden.
 * @returns {string} the content WIFI:….
 */
export function buildWifi(fields) {
    const auth = fields.auth || 'WPA';
    const password = auth === 'nopass' ? '' : `P:${escapeWifi(fields.password || '')};`;
    return `WIFI:T:${auth};S:${escapeWifi(fields.ssid || '')};${password}${fields.hidden ? 'H:true;' : ''};`;
}

/**
 * Reads an email: mailto: with subject and body, or MATMSG:.
 * @param {string} content - the content.
 * @returns {{to: string, subject: string, body: string}} the fields.
 */
export function parseEmail(content) {
    if (MATMSG_PATTERN.test(content)) return parseMatmsg(content);
    const rest = content.replace(MAILTO_PREFIX, ''), queryStart = rest.indexOf('?');
    const parameters = parseQuery(queryStart < 0 ? '' : rest.slice(queryStart + 1));
    return { to: convertFromUriValue(queryStart < 0 ? rest : rest.slice(0, queryStart)), subject: parameters.subject || '', body: parameters.body || '' };
}

/**
 * Reads an email in the form MATMSG:TO:…;SUB:…;BODY:…;;.
 * @param {string} content - the content.
 * @returns {{to: string, subject: string, body: string}} the fields.
 */
function parseMatmsg(content) {
    const fields = { to: '', subject: '', body: '' };
    for (const text of splitEscaped(content.slice(MATMSG_PREFIX.length), ';')) {
        const part = getKeyAndValue(text);
        if (!part) continue;
        const value = removeEscapes(part.value);
        if (part.key === 'TO') fields.to = value; else if (part.key === 'SUB') fields.subject = value; else if (part.key === 'BODY') fields.body = value;
    }
    return fields;
}

/**
 * Writes an email as mailto: with the percent-encoded subject and body.
 * @param {Object<string, string>} fields - the fields: to, subject, body.
 * @returns {string} the content.
 */
export function buildEmail(fields) {
    const query = buildQuery([['subject', fields.subject], ['body', fields.body]]);
    return `mailto:${String(fields.to || '').trim()}${query ? '?' + query : ''}`;
}

/**
 * Reads an SMS: sms:number?body=… or SMSTO:number:text.
 * @param {string} content - the content.
 * @returns {{number: string, message: string}} the fields.
 */
export function parseSms(content) {
    const uriMatch = SMS_URI.exec(content);
    if (uriMatch) return { number: convertFromUriValue(uriMatch[1]), message: parseQuery(uriMatch[2]).body || '' };
    const textMatch = SMSTO_TEXT.exec(content);
    return textMatch ? { number: textMatch[1], message: textMatch[2] } : { number: '', message: '' };
}

/**
 * Writes an SMS as SMSTO:number:text.
 * @param {Object<string, string>} fields - the fields: number, message.
 * @returns {string} the content.
 */
export function buildSms(fields) {
    return `SMSTO:${String(fields.number || '').replace(/\s+/g, '')}:${fields.message || ''}`;
}

/**
 * Reads a phone number.
 * @param {string} content - the content tel:….
 * @returns {{number: string}} the fields.
 */
export function parsePhone(content) {
    return { number: content.replace(TEL_PREFIX, '').trim() };
}

/**
 * Writes a phone number as tel: with digits, + * # , and ; only.
 * @param {Object<string, string>} fields - the fields: number.
 * @returns {string} the content.
 */
export function buildPhone(fields) {
    return `tel:${String(fields.number || '').replace(/[^\d+*#,;]/g, '')}`;
}

/**
 * Reads a location: latitude, longitude and the label of q=lat,lon(label).
 * @param {string} content - the content geo:….
 * @returns {{lat: string, lon: string, label: string}} the fields.
 */
export function parseLocation(content) {
    const match = GEO_URI.exec(content.trim());
    if (!match) return { lat: '', lon: '', label: '' };
    const query = parseQuery(match[3]).q || '';
    return { lat: match[1], lon: match[2], label: query.replace(GEO_LABEL, '$1') };
}

/**
 * Writes a location as geo:lat,lon with the label as q=lat,lon(label).
 * @param {Object<string, string>} fields - the fields: lat, lon, label.
 * @returns {string} the content.
 */
export function buildLocation(fields) {
    const lat = String(fields.lat || '').trim(), lon = String(fields.lon || '').trim();
    return `geo:${lat},${lon}${fields.label ? `?q=${lat},${lon}(${convertToUriValue(fields.label)})` : ''}`;
}
