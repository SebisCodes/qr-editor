/**
 * Contacts as vCard 3.0 or MeCard: parseContact() reads the fields from the
 * content, buildContact() writes the content in the canonical form of the
 * chosen format.
 */

import { escapeIcs, escapeMecard, getKeyAndValue, parseIcsText, removeEscapes, splitEscaped, splitLines } from './payload-text.js?v=2';

const MECARD_PREFIX = /^MECARD:/i;
const FOLDED_LINE = /\r?\n[ \t]/g;                              // a line that goes on in the next one (RFC 2425 folding)
const ITEM_GROUP = /^ITEM\d+\./;
const MECARD_FULL_ADDRESS = 7;                                  // the parts of a MeCard address in vCard order

/**
 * The fields of a contact.
 * @typedef {Object} ContactFields
 * @property {string} format - "vcard" or "mecard".
 * @property {string} first - the first name.
 * @property {string} last - the last name.
 * @property {string} org - the company.
 * @property {string} title - the job title.
 * @property {string} mobile - the mobile number.
 * @property {string} phone - the work number.
 * @property {string} email - the email address.
 * @property {string} url - the website.
 * @property {string} street - the street and number.
 * @property {string} zip - the postal code.
 * @property {string} city - the city.
 * @property {string} region - the region.
 * @property {string} country - the country.
 * @property {string} note - the note.
 */

/**
 * Reads a contact, as MeCard or vCard.
 * @param {string} content - the content.
 * @returns {ContactFields} the fields.
 */
export function parseContact(content) {
    return MECARD_PREFIX.test(content) ? parseMecard(content) : parseVcard(content);
}

/**
 * Writes a contact in the format of its fields.
 * @param {ContactFields} fields - the fields.
 * @returns {string} the content.
 */
export function buildContact(fields) {
    return fields.format === 'mecard' ? buildMecard(fields) : buildVcard(fields);
}

/**
 * Returns a contact without values.
 * @param {string} format - "vcard" or "mecard".
 * @returns {ContactFields} the empty fields.
 */
function createEmptyContact(format) {
    return { format, first: '', last: '', org: '', title: '', mobile: '', phone: '', email: '', url: '', street: '', zip: '', city: '', region: '', country: '', note: '' };
}

/**
 * Reads a vCard: name, company, title, numbers, email, website, address and note.
 * @param {string} content - the content BEGIN:VCARD….
 * @returns {ContactFields} the fields.
 */
function parseVcard(content) {
    const contact = createEmptyContact('vcard');
    for (const line of splitLines(content.replace(FOLDED_LINE, ''))) {
        const colon = line.indexOf(':');
        if (colon >= 0) setVcardField(contact, line.slice(0, colon).toUpperCase(), line.slice(colon + 1));
    }
    return contact;
}

/**
 * Sets the field of one vCard property; the first number, email, website and address count.
 * @param {ContactFields} contact - the fields being read.
 * @param {string} head - the property name with its parameters, in upper case (TEL;TYPE=CELL).
 * @param {string} value - the value as written.
 * @returns {void}
 */
function setVcardField(contact, head, value) {
    const name = head.split(';')[0].replace(ITEM_GROUP, '');
    const parts = splitEscaped(value, ';').map(parseIcsText);
    if (name === 'N') { contact.last = parts[0] || ''; contact.first = parts[1] || ''; }
    else if (name === 'FN' && !contact.first && !contact.last) setNameFromFullName(contact, parseIcsText(value));
    else if (name === 'ORG') contact.org = parts.filter(Boolean).join(', ');
    else if (name === 'TITLE') contact.title = parseIcsText(value);
    else if (name === 'TEL') setVcardNumber(contact, head, value);
    else if (name === 'EMAIL' && !contact.email) contact.email = value;
    else if (name === 'URL' && !contact.url) contact.url = parseIcsText(value);
    else if (name === 'ADR' && !contact.street) { contact.street = parts[2] || ''; contact.city = parts[3] || ''; contact.region = parts[4] || ''; contact.zip = parts[5] || ''; contact.country = parts[6] || ''; }
    else if (name === 'NOTE') contact.note = parseIcsText(value);
}

/**
 * Sets first and last name from a full name: the last word is the last name.
 * @param {ContactFields} contact - the fields being read.
 * @param {string} fullName - the full name.
 * @returns {void}
 */
function setNameFromFullName(contact, fullName) {
    const words = fullName.split(' ');
    contact.last = words.length > 1 ? words.pop() : '';
    contact.first = words.join(' ');
}

/**
 * Sets a number of a vCard: a CELL number is the mobile number, the first other one the work number.
 * @param {ContactFields} contact - the fields being read.
 * @param {string} head - the property with its parameters, in upper case.
 * @param {string} number - the number.
 * @returns {void}
 */
function setVcardNumber(contact, head, number) {
    if (/CELL/.test(head) && !contact.mobile) contact.mobile = number;
    else if (!contact.phone) contact.phone = number;
    else if (!contact.mobile) contact.mobile = number;
}

/**
 * Reads a MeCard: N:Last,First, the first two numbers, email, website, company, address and note.
 * @param {string} content - the content MECARD:….
 * @returns {ContactFields} the fields.
 */
function parseMecard(content) {
    const contact = createEmptyContact('mecard');
    for (const text of splitEscaped(content.replace(MECARD_PREFIX, ''), ';')) {
        const part = getKeyAndValue(text);
        if (part) setMecardField(contact, part.key, part.value);
    }
    return contact;
}

/**
 * Sets the field of one MeCard part.
 * @param {ContactFields} contact - the fields being read.
 * @param {string} key - the key in upper case.
 * @param {string} value - the escaped value.
 * @returns {void}
 */
function setMecardField(contact, key, value) {
    if (key === 'N') { const [last, first] = splitEscaped(value, ','); contact.last = removeEscapes(last || ''); contact.first = removeEscapes(first || ''); }
    else if (key === 'TEL') { if (!contact.mobile) contact.mobile = removeEscapes(value); else if (!contact.phone) contact.phone = removeEscapes(value); }
    else if (key === 'EMAIL') contact.email = removeEscapes(value);
    else if (key === 'URL') contact.url = removeEscapes(value);
    else if (key === 'ORG') contact.org = removeEscapes(value);
    else if (key === 'NOTE') contact.note = removeEscapes(value);
    else if (key === 'ADR') setMecardAddress(contact, value);
}

/**
 * Sets the address of a MeCard: seven parts in vCard order, otherwise all of it as the street.
 * @param {ContactFields} contact - the fields being read.
 * @param {string} value - the escaped address.
 * @returns {void}
 */
function setMecardAddress(contact, value) {
    const parts = splitEscaped(value, ',').map(removeEscapes);
    if (parts.length >= MECARD_FULL_ADDRESS) { contact.street = parts[2]; contact.city = parts[3]; contact.region = parts[4]; contact.zip = parts[5]; contact.country = parts[6]; }
    else contact.street = removeEscapes(value);
}

/**
 * Writes a contact as vCard 3.0.
 * @param {ContactFields} fields - the fields.
 * @returns {string} the content BEGIN:VCARD….
 */
function buildVcard(fields) {
    const out = ['BEGIN:VCARD', 'VERSION:3.0'];
    const fullName = [fields.first, fields.last].filter(Boolean).join(' ').trim() || fields.org || '';
    out.push(`N:${escapeIcs(fields.last || '')};${escapeIcs(fields.first || '')};;;`);
    out.push('FN:' + escapeIcs(fullName));
    if (fields.org) out.push('ORG:' + escapeIcs(fields.org));
    if (fields.title) out.push('TITLE:' + escapeIcs(fields.title));
    if (fields.mobile) out.push('TEL;TYPE=CELL:' + fields.mobile.trim());
    if (fields.phone) out.push('TEL;TYPE=WORK,VOICE:' + fields.phone.trim());
    if (fields.email) out.push('EMAIL:' + fields.email.trim());
    if (fields.url) out.push('URL:' + fields.url.trim());
    if (fields.street || fields.city || fields.zip || fields.country || fields.region) {
        out.push(`ADR;TYPE=WORK:;;${[fields.street, fields.city, fields.region, fields.zip, fields.country].map(part => escapeIcs(part || '')).join(';')}`);
    }
    if (fields.note) out.push('NOTE:' + escapeIcs(fields.note));
    out.push('END:VCARD');
    return out.join('\n');
}

/**
 * Writes a contact as MeCard (the address in one part: street, postal code and city, country).
 * @param {ContactFields} fields - the fields.
 * @returns {string} the content MECARD:…;;.
 */
function buildMecard(fields) {
    const parts = [`N:${escapeMecard(fields.last || '')}${fields.first ? ',' + escapeMecard(fields.first) : ''}`];
    if (fields.mobile) parts.push('TEL:' + escapeMecard(fields.mobile.trim()));
    if (fields.phone) parts.push('TEL:' + escapeMecard(fields.phone.trim()));
    if (fields.email) parts.push('EMAIL:' + escapeMecard(fields.email.trim()));
    if (fields.url) parts.push('URL:' + escapeMecard(fields.url.trim()));
    if (fields.org) parts.push('ORG:' + escapeMecard(fields.org));
    if (fields.street || fields.city || fields.zip || fields.country) {
        parts.push('ADR:' + escapeMecard([fields.street, [fields.zip, fields.city].filter(Boolean).join(' '), fields.country].filter(Boolean).join(', ')));
    }
    if (fields.note) parts.push('NOTE:' + escapeMecard(fields.note));
    return 'MECARD:' + parts.join(';') + ';;';
}
