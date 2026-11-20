/**
 * What a QR code holds: the content types, read from the content itself
 * (getContentType), its fields (parseContent) and the content written back in
 * the canonical form of its type (buildContent). Each type has its parse and
 * build function in a module of its topic; this module chooses by type.
 *
 * Formats: WiFi as ZXing reads it (WIFI:T:…;S:…;P:…;H:true;;), vCard 3.0 and
 * MeCard, mailto: (RFC 6068), SMSTO:, tel: (RFC 3966), geo: (RFC 5870),
 * iCalendar VEVENT (RFC 5545), BIP21 / EIP-681 (here, with the conversion
 * between ether and wei), the EPC069-12 SEPA credit transfer (version 002) and
 * the Swiss Payments Code of the Swiss QR bill (SIX Implementation Guidelines
 * 2.3 and 2.4).
 *
 * Related modules: payload-fields.js (the form of each type), payload-check.js
 * (the problems of a content), payload-bank.js (IBAN and references).
 */

import { buildContact, parseContact } from './payload-contact.js?v=2';
import { buildEvent, parseEvent } from './payload-event.js?v=2';
import { buildEpc, buildSwiss, parseEpc, parseSwiss } from './payload-payment.js?v=2';
import {
    buildEmail, buildLink, buildLocation, buildPhone, buildSms, buildText, buildWifi,
    parseEmail, parseLink, parseLocation, parsePhone, parseSms, parseText, parseWifi,
} from './payload-simple.js?v=2';
import { buildQuery, parseQuery } from './payload-text.js?v=2';

/** The content types in the order of the type menu. */
export const TYPES = ['link', 'text', 'wifi', 'contact', 'email', 'sms', 'phone', 'location', 'event', 'crypto', 'epc', 'swiss'];

/** The name of each content type (English; the language pack translates it). */
export const TYPE_NAMES = {
    link: 'Link', text: 'Text', wifi: 'WiFi', contact: 'Contact', email: 'Email', sms: 'SMS', phone: 'Phone',
    location: 'Location', event: 'Event', crypto: 'Crypto', epc: 'SEPA payment', swiss: 'Swiss QR bill',
};

/** How each type starts, tested in this order; a content that matches none is a link or a text. */
const TYPE_PATTERNS = [
    [/^WIFI:/i, 'wifi'],
    [/^BEGIN:VCARD/i, 'contact'], [/^MECARD:/i, 'contact'],
    [/^(mailto:|MATMSG:)/i, 'email'],
    [/^(SMSTO:|SMS:)/i, 'sms'], [/^sms:/i, 'sms'],
    [/^tel:/i, 'phone'],
    [/^geo:/i, 'location'],
    [/^BEGIN:(VEVENT|VCALENDAR)/i, 'event'],
    [/^(bitcoin|litecoin|dogecoin|bitcoincash|ethereum):/i, 'crypto'],
    [/^BCD\r?\n/, 'epc'],
    [/^SPC\r?\n/, 'swiss'],
];
const LINK_PATTERNS = [/^(https?|ftp):\/\/\S+$/i, /^www\.[^\s]+\.[a-z]{2,}\S*$/i];

const PARSERS = {
    link: parseLink, text: parseText, wifi: parseWifi, contact: parseContact, email: parseEmail, sms: parseSms, phone: parsePhone,
    location: parseLocation, event: parseEvent, crypto: parseCrypto, epc: parseEpc, swiss: parseSwiss,
};
const BUILDERS = {
    link: buildLink, text: buildText, wifi: buildWifi, contact: buildContact, email: buildEmail, sms: buildSms, phone: buildPhone,
    location: buildLocation, event: buildEvent, crypto: buildCrypto, epc: buildEpc, swiss: buildSwiss,
};

const CRYPTO_URI = /^([a-z]+):([^?@]*)(?:@([^?]*))?\??(.*)$/i;   // coin:address@chain?parameters (EIP-681 chain id)
const DEFAULT_COIN = 'bitcoin';
const ETHEREUM = 'ethereum';
const ETHER_AMOUNT = /^(\d*)(?:\.(\d*))?$/;
const SCIENTIFIC_AMOUNT = /^(\d+)(?:\.(\d+))?e(\d+)$/i;
const WHOLE_NUMBER = /^\d+$/;
const LEADING_ZEROS = /^0+(?=\d)/;
const TRAILING_ZEROS = /\.?0+$/;
const WEI_DIGITS = 18;                  // 1 ether is 10^18 wei
const MAX_WEI_DIGITS = 80;              // amounts beyond 10^80 wei are no real amount

/**
 * Returns the type of a content, read from how it starts.
 * @param {string} content - the content of the code.
 * @returns {string} one of TYPES; "text" for anything without a known form.
 */
export function getContentType(content) {
    const text = String(content || '');
    const match = TYPE_PATTERNS.find(([pattern]) => pattern.test(text));
    if (match) return match[1];
    if (LINK_PATTERNS.some(pattern => pattern.test(text.trim()))) return 'link';
    return 'text';
}

/**
 * Reads the fields of a content of a type.
 * @param {string} type - one of TYPES.
 * @param {string} content - the content of the code.
 * @returns {Object<string, *>} the fields as the form of the type shows them, {} for an unknown type.
 */
export function parseContent(type, content) {
    const text = String(content || '');
    return Object.hasOwn(PARSERS, type) ? PARSERS[type](text) : {};
}

/**
 * Writes the content of a type from its fields, in the canonical form of the type.
 * @param {string} type - one of TYPES.
 * @param {Object<string, *>} fields - the fields as the form of the type holds them.
 * @returns {string} the content, '' for an unknown type.
 */
export function buildContent(type, fields) {
    return Object.hasOwn(BUILDERS, type) ? BUILDERS[type](fields) : '';
}

/**
 * Reads a payment request of a cryptocurrency (BIP21, or EIP-681 with the amount in wei).
 * @param {string} content - the content coin:address?….
 * @returns {Object<string, string>} coin, address, amount, label, message and chain (the network of an
 *   Ethereum request, kept when the form changes the amount).
 */
function parseCrypto(content) {
    const match = CRYPTO_URI.exec(content.trim());
    if (!match) return { coin: DEFAULT_COIN, address: '', amount: '', label: '', message: '' };
    const coin = match[1].toLowerCase(), parameters = parseQuery(match[4]);
    const amount = coin === ETHEREUM ? (parameters.value ? convertFromWei(parameters.value) : '') : parameters.amount || '';
    return { coin, address: match[2], amount, label: parameters.label || '', message: parameters.message || '', chain: match[3] || '' };
}

/**
 * Writes a payment request of a cryptocurrency: Ethereum as EIP-681 with value in wei, the others as BIP21.
 * @param {Object<string, string>} fields - coin, address, amount, label, message and chain.
 * @returns {string} the content.
 */
function buildCrypto(fields) {
    const coin = fields.coin || DEFAULT_COIN, address = String(fields.address || '').trim();
    if (coin === ETHEREUM) {
        const wei = fields.amount ? convertToWei(fields.amount) : '';
        return `ethereum:${address}${fields.chain ? '@' + fields.chain : ''}${wei ? '?value=' + wei : ''}`;
    }
    const query = buildQuery([['amount', String(fields.amount || '').trim()], ['label', fields.label], ['message', fields.message]]);
    return `${coin}:${address}${query ? '?' + query : ''}`;
}

/**
 * Converts ether to wei as decimal strings, without rounding by floating point.
 * @param {string} ether - the amount in ether (a comma counts as point).
 * @returns {string} the amount in wei, '' when it is no number.
 */
export function convertToWei(ether) {
    const match = ETHER_AMOUNT.exec(String(ether).trim().replace(',', '.'));
    if (!match) return '';
    return ((match[1] || '0') + (match[2] || '').padEnd(WEI_DIGITS, '0').slice(0, WEI_DIGITS)).replace(LEADING_ZEROS, '');
}

/**
 * Converts wei to ether as decimal strings, without rounding by floating point; scientific notation is read.
 * @param {string} wei - the amount in wei.
 * @returns {string} the amount in ether without trailing zeros, '' when it is no amount.
 */
export function convertFromWei(wei) {
    const digits = expandScientific(String(wei).trim());
    if (!WHOLE_NUMBER.test(digits)) return '';
    const padded = digits.padStart(WEI_DIGITS + 1, '0');
    return `${padded.slice(0, -WEI_DIGITS).replace(LEADING_ZEROS, '')}.${padded.slice(-WEI_DIGITS)}`.replace(TRAILING_ZEROS, '');
}

/**
 * Writes a number in scientific notation (2.014e18) as whole digits; other text stays as it is.
 * @param {string} text - the number.
 * @returns {string} the digits ('' when the number would have more than 80 digits), or the text.
 */
function expandScientific(text) {
    const match = SCIENTIFIC_AMOUNT.exec(text);
    if (!match) return text;
    const [, whole, fraction = '', exponent] = match;
    const length = whole.length + +exponent;
    // A huge exponent would build a string of that length.
    if (length > MAX_WEI_DIGITS) return '';
    return (whole + fraction).padEnd(length, '0').slice(0, length);
}
