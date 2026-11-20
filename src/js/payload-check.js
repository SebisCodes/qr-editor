/**
 * The problems of a content against the rules of its type: errors (the code
 * does not work as meant) and warnings (it works, but not everywhere or not
 * for long). The payment codes are checked in payload-check-payment.js.
 *
 * getContentProblems() runs these steps:
 *   1. an empty content has one warning and nothing else;
 *   2. the content is read into the fields of its type;
 *   3. the check of the type adds its problems in the order of the form.
 */

import { parseContent } from './payload.js?v=5';
import { addEpcProblems, addSwissProblems } from './payload-check-payment.js?v=2';
import { convertFromUriValue } from './payload-text.js?v=2';

/**
 * A problem of the content.
 * @typedef {Object} ContentProblem
 * @property {string} kind - "error", "warn" or "info".
 * @property {string} msg - what is wrong (English; the language pack translates it).
 * @property {number} [at] - the line of the content it is about, from 0.
 */

/**
 * The problems found so far, with the commands that add to them.
 * @typedef {Object} ProblemList
 * @property {Array<ContentProblem>} items - the problems in the order they were found.
 * @property {function(string, number=): void} addError - adds an error, optionally with its line.
 * @property {function(string, number=): void} addWarning - adds a warning, optionally with its line.
 */

/**
 * Link shorteners and the redirect services of QR code generators: a code that points
 * there stops working when the service ends or the plan expires.
 */
const REDIRECTS = /^(?:[a-z0-9-]+\.)?(bit\.ly|bitly\.com|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at|tiny\.cc|rb\.gy|s\.id|t\.ly|bl\.ink|short\.io|qrco\.de|qr-code-generator\.com|qrcode-monkey\.com|qrs\.ly|l\.ead\.me|me-qr\.com|qr\.io|scnv\.io|qrfy\.com|qr\.codes|qrcodechimp\.com|linqr\.app|qr1\.be|q-r\.to|uqr\.me|qrstud\.io|beaconstac\.com|uniqode\.com|flowcode\.com|qrd\.by)$/i;
const WWW_PREFIX = /^www\./i;
const HTTP_PREFIX = /^http:\/\//i;
const SECURE_SCHEME = 'https://';
const EMAIL_ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const WEP_KEY_LENGTHS = [5, 13, 16, 29];
const WEP_HEX_KEY = /^([0-9a-f]{10}|[0-9a-f]{26}|[0-9a-f]{32}|[0-9a-f]{58})$/i;
const WPA_PASSWORD_MIN = 8;
const WPA_PASSWORD_MAX = 63;
const WPA_HEX_KEY = /^[0-9a-f]{64}$/i;
const SMS_NUMBER = /^\+?[\d\s()/-]{3,}$/;
const PHONE_NUMBER = /^\+?[\d*#,;]{3,}$/;
const PHONE_SEPARATORS = /[\s()/.-]/g;
const LATITUDE_LIMIT = 90;
const LONGITUDE_LIMIT = 180;
const PLAIN_AMOUNT = /^\d+(\.\d+)?$/;
const ETHEREUM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ENS_NAME = /\.eth$/i;
const BITCOIN_ADDRESS = /^(bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/i;

const PROBLEM_FINDERS = {
    link: addLinkProblems, wifi: addWifiProblems, contact: addContactProblems, email: addEmailProblems, sms: addSmsProblems,
    phone: addPhoneProblems, location: addLocationProblems, event: addEventProblems, crypto: addCryptoProblems,
    epc: addEpcProblems, swiss: addSwissProblems,
};

/**
 * Returns the problems of a content of a type.
 * @param {string} type - one of TYPES of payload.js.
 * @param {string} content - the content of the code.
 * @returns {Array<ContentProblem>} the problems, in the order of the form; empty when there are none.
 */
export function getContentProblems(type, content) {
    const text = String(content || '');
    const fields = parseContent(type, text);
    const problems = createProblemList();
    if (!text.length) problems.addWarning('The code has no content yet');
    else if (Object.hasOwn(PROBLEM_FINDERS, type)) PROBLEM_FINDERS[type](fields, text, problems);
    return problems.items;
}

/**
 * Creates an empty list of problems.
 * @returns {ProblemList} the list with its commands.
 */
function createProblemList() {
    const items = [];
    return { items, addError, addWarning };

    /**
     * Adds an error.
     * @param {string} msg - what is wrong.
     * @param {number} [at] - the line of the content.
     * @returns {void}
     */
    function addError(msg, at) {
        items.push({ kind: 'error', msg, at });
    }

    /**
     * Adds a warning.
     * @param {string} msg - what is wrong.
     * @param {number} [at] - the line of the content.
     * @returns {void}
     */
    function addWarning(msg, at) {
        items.push({ kind: 'warn', msg, at });
    }
}

/**
 * Adds the problems of a link: spaces, a missing or insecure scheme, an address that is none, a redirect service.
 * @param {Object<string, string>} fields - the fields of the link: url.
 * @param {string} content - the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addLinkProblems(fields, content, problems) {
    const url = fields.url;
    if (/\s/.test(url)) problems.addError('The address contains spaces - encode them as %20');
    if (WWW_PREFIX.test(url)) problems.addWarning('The address has no https:// - some scanners show it as text instead of opening it');
    if (HTTP_PREFIX.test(url)) problems.addWarning('The address uses http:// - the browser may warn that the page is not secure; use https:// if the site has it');
    const host = getHostName(url);
    if (host === null && !WWW_PREFIX.test(url)) problems.addError('This is not a valid address');
    if (host && REDIRECTS.test(host)) problems.addWarning(`${host} is a link shortener or redirect service: the code works only as long as that service keeps the link - for printed codes put the real address in the code`);
}

/**
 * Returns the host of an address; an address starting with www. is read with https://.
 * @param {string} url - the address.
 * @returns {?string} the host name, null when the address cannot be read.
 */
function getHostName(url) {
    try { return new URL(WWW_PREFIX.test(url) ? SECURE_SCHEME + url : url).hostname; } catch (error) { return null; }
}

/**
 * Adds the problems of a WiFi network: name, password and its length, the old WEP and the T:SAE some scanners do not read.
 * @param {Object<string, *>} fields - the fields of the network.
 * @param {string} content - the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addWifiProblems(fields, content, problems) {
    const { ssid, auth, password, rawT } = fields;
    if (!ssid) problems.addError('The network name (SSID) is missing');
    if (auth !== 'nopass' && !password) problems.addError('The password is missing (or choose "None" for an open network)');
    if (auth === 'WEP' && password && !WEP_KEY_LENGTHS.includes(password.length) && !WEP_HEX_KEY.test(password)) problems.addWarning('A WEP key has 5, 13, 16 or 29 characters (or 10, 26, 32, 58 hex digits)');
    if (auth === 'WEP') problems.addWarning('WEP is not secure - use WPA2 or WPA3 if your router has it');
    if (/^SAE$/i.test(rawT || '')) problems.addWarning('T:SAE is not in the WiFi standard and some scanners do not read it - T:WPA works for WPA2 and WPA3');
    if (auth === 'WPA' && password && (password.length < WPA_PASSWORD_MIN || password.length > WPA_PASSWORD_MAX) && !WPA_HEX_KEY.test(password)) problems.addWarning('A WPA password has 8 to 63 characters');
}

/**
 * Adds the problems of a contact: no name and no company, an email address of the wrong form.
 * @param {Object<string, string>} fields - the fields of the contact.
 * @param {string} content - the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addContactProblems(fields, content, problems) {
    if (!fields.first && !fields.last && !fields.org) problems.addError('The contact has no name and no company');
    if (fields.email && !EMAIL_ADDRESS.test(fields.email)) problems.addWarning('The email address looks wrong');
}

/**
 * Adds the problems of an email: no address, or an address of the wrong form.
 * @param {Object<string, string>} fields - the fields of the email: to.
 * @param {string} content - the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addEmailProblems(fields, content, problems) {
    const to = fields.to;
    if (!to) problems.addWarning('No address - the email app opens with an empty "To"');
    else if (!to.split(',').every(address => EMAIL_ADDRESS.test(convertFromUriValue(address).trim()))) problems.addWarning('The email address looks wrong');
}

/**
 * Adds the problems of an SMS: no number, or other characters in it.
 * @param {Object<string, string>} fields - the fields of the SMS: number.
 * @param {string} content - the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addSmsProblems(fields, content, problems) {
    const number = fields.number;
    if (!number) problems.addError('The phone number is missing');
    else if (!SMS_NUMBER.test(number)) problems.addWarning('The phone number contains other characters than digits and +');
}

/**
 * Adds the problems of a phone number: none, other characters in it, no country code.
 * @param {Object<string, string>} fields - the fields of the phone number: number.
 * @param {string} content - the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addPhoneProblems(fields, content, problems) {
    const number = fields.number;
    if (!number) problems.addError('The phone number is missing');
    else if (!PHONE_NUMBER.test(number.replace(PHONE_SEPARATORS, ''))) problems.addWarning('The phone number contains other characters than digits and +');
    else if (!/^\+/.test(number)) problems.addWarning('Without the country code (+41 …) the number only works within the country');
}

/**
 * Adds the problems of a location: latitude and longitude missing, no numbers or out of range.
 * @param {Object<string, string>} fields - the fields of the location: lat, lon.
 * @param {string} content - the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addLocationProblems(fields, content, problems) {
    const latitude = +fields.lat, longitude = +fields.lon;
    if (fields.lat === '' || fields.lon === '' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) problems.addError('Latitude and longitude are needed as numbers, for example 47.6779 and 8.6152');
    else if (Math.abs(latitude) > LATITUDE_LIMIT || Math.abs(longitude) > LONGITUDE_LIMIT) problems.addError('The latitude lies between -90 and 90, the longitude between -180 and 180');
}

/**
 * Adds the problems of an event: BEGIN and END missing, no title, no start, an end ahead of the start.
 * @param {Object<string, *>} fields - the fields of the event.
 * @param {string} content - the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addEventProblems(fields, content, problems) {
    if (!/BEGIN:VEVENT/i.test(content)) problems.addError('The event has no BEGIN:VEVENT');
    if (!/END:VEVENT/i.test(content)) problems.addError('The event has no END:VEVENT');
    if (!fields.title) problems.addWarning('The event has no title');
    if (!fields.start) problems.addError('The event has no start');
    if (fields.start && fields.end && fields.end < fields.start) problems.addError('The event ends before it starts');
}

/**
 * Adds the problems of a payment request in a cryptocurrency: no address, an amount of the wrong form,
 * an address that does not look like one of the coin.
 * @param {Object<string, string>} fields - the fields of the request.
 * @param {string} content - the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addCryptoProblems(fields, content, problems) {
    const { coin, address, amount } = fields;
    if (!address) problems.addError('The address is missing');
    if (amount && !PLAIN_AMOUNT.test(amount)) problems.addError('The amount must be a number with a point, for example 0.005');
    if (coin === 'ethereum' && address && !ETHEREUM_ADDRESS.test(address) && !ENS_NAME.test(address)) problems.addWarning('An Ethereum address has 0x and 40 hex digits');
    if (coin === 'bitcoin' && address && !BITCOIN_ADDRESS.test(address)) problems.addWarning('This does not look like a Bitcoin address');
}
