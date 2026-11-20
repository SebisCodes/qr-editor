/**
 * The payment codes: the EPC069-12 SEPA credit transfer (version 002) and the
 * Swiss Payments Code of the Swiss QR bill (SIX Implementation Guidelines 2.3
 * and 2.4: structured addresses, EUR without QR-IBAN). Both are one element per
 * line in a fixed order; parse… reads the fields from the content, build…
 * writes the content in that order.
 */

import { formatIban } from './payload-bank.js?v=2';
import { splitLines } from './payload-text.js?v=2';

/** The 0-based line of each element of an EPC payload. */
export const EPC_LINE = { service: 0, version: 1, encoding: 2, identification: 3, bic: 4, name: 5, iban: 6, amount: 7, purpose: 8, reference: 9, text: 10, info: 11 };

/** The 0-based line of each element of a Swiss Payments Code. */
export const SWISS_LINE = {
    type: 0, version: 1, coding: 2, iban: 3, addressType: 4, name: 5, street: 6, house: 7, zip: 8, city: 9, country: 10,
    ultimateFirst: 11, ultimateLast: 17, amount: 18, currency: 19,
    debtorAddressType: 20, debtorName: 21, debtorStreet: 22, debtorHouse: 23, debtorZip: 24, debtorCity: 25, debtorCountry: 26,
    referenceType: 27, reference: 28, message: 29, trailer: 30, billing: 31,
};

const EPC_HEADER = ['BCD', '002', '1', 'SCT'];               // service tag, version, UTF-8, SEPA credit transfer
const EPC_REQUIRED_LINES = 7;                                // up to the IBAN; empty elements after the last one are left out
const EPC_CURRENCY = 'EUR';
const EPC_AMOUNT = /^EUR(.*)$/;
const SWISS_HEADER = ['SPC', '0200', '1'];                   // QR type, version, coding type (UTF-8, Latin subset)
const SWISS_TRAILER = 'EPD';
const STRUCTURED_ADDRESS = 'S';
const DEFAULT_COUNTRY = 'CH';
const DEFAULT_CURRENCY = 'CHF';
const NO_REFERENCE = 'NON';
const ADDRESS_LINES = 7;                                     // address type, name, street, number, postal code, town, country
const PLAIN_AMOUNT = /^\d+(\.\d+)?$/;
const AMOUNT_DECIMALS = 2;

/**
 * Reads a SEPA credit transfer.
 * @param {string} content - the content BCD….
 * @returns {Object<string, string>} bic, name, iban, amount (without EUR), purpose, reference, text and info.
 */
export function parseEpc(content) {
    const lines = splitLines(content);
    const amount = EPC_AMOUNT.exec(lines[EPC_LINE.amount] || '');
    return {
        bic: lines[EPC_LINE.bic] || '', name: lines[EPC_LINE.name] || '', iban: lines[EPC_LINE.iban] || '', amount: amount ? amount[1] : '',
        purpose: lines[EPC_LINE.purpose] || '', reference: lines[EPC_LINE.reference] || '', text: lines[EPC_LINE.text] || '', info: lines[EPC_LINE.info] || '',
    };
}

/**
 * Writes a SEPA credit transfer; a reference leaves the message out, and no line follows the last element.
 * @param {Object<string, string>} fields - bic, name, iban, amount, purpose, reference, text and info.
 * @returns {string} the content BCD….
 */
export function buildEpc(fields) {
    const amount = formatPaymentAmount(fields.amount);
    const out = [...EPC_HEADER, String(fields.bic || '').replace(/\s+/g, '').toUpperCase(), String(fields.name || '').trim(), formatIban(fields.iban),
        amount ? EPC_CURRENCY + amount : '', String(fields.purpose || '').trim().toUpperCase(),
        String(fields.reference || '').replace(/\s+/g, '').toUpperCase(), fields.reference ? '' : String(fields.text || '').trim(), String(fields.info || '').trim()];
    while (out.length > EPC_REQUIRED_LINES && !out[out.length - 1]) out.pop();
    return out.join('\n');
}

/**
 * Writes an amount with two decimals when it is a plain number (a comma counts as point).
 * @param {string} amount - the amount as typed.
 * @returns {string} the amount, as typed when it is no plain number, '' when empty.
 */
function formatPaymentAmount(amount) {
    const text = String(amount || '').trim().replace(',', '.');
    if (!text) return '';
    return PLAIN_AMOUNT.test(text) ? (+text).toFixed(AMOUNT_DECIMALS) : text;
}

/**
 * Reads a Swiss Payments Code; a missing country is CH, a missing currency CHF.
 * @param {string} content - the content SPC….
 * @returns {Object<string, string>} the creditor, amount, debtor (d…), reference, message, billing information
 *   and the address types addrType and dAddrType.
 */
export function parseSwiss(content) {
    const lines = splitLines(content);
    /**
     * Returns one element of this code.
     * @param {string} name - the name of the element in SWISS_LINE.
     * @returns {string} the element, '' when the code has no such line.
     */
    const getLine = name => getSwissLine(lines, name);
    return {
        iban: getLine('iban'), name: getLine('name'), street: getLine('street'), house: getLine('house'), zip: getLine('zip'), city: getLine('city'), country: getLine('country') || DEFAULT_COUNTRY,
        amount: getLine('amount'), currency: getLine('currency') || DEFAULT_CURRENCY,
        dname: getLine('debtorName'), dstreet: getLine('debtorStreet'), dhouse: getLine('debtorHouse'), dzip: getLine('debtorZip'), dcity: getLine('debtorCity'), dcountry: getLine('debtorCountry'),
        reftype: getLine('referenceType') || NO_REFERENCE, reference: getLine('reference'), message: getLine('message'), billing: getLine('billing'),
        addrType: getLine('addressType') || STRUCTURED_ADDRESS, dAddrType: getLine('debtorAddressType'),
    };
}

/**
 * Returns one element of a Swiss Payments Code.
 * @param {Array<string>} lines - the lines of the code.
 * @param {string} name - the name of the element in SWISS_LINE.
 * @returns {string} the element, '' when the code has no such line.
 */
function getSwissLine(lines, name) {
    return lines[SWISS_LINE[name]] || '';
}

/**
 * Writes a Swiss Payments Code with structured addresses: 31 elements, the billing information
 * as 32nd when there is one; line breaks inside a value become spaces.
 * @param {Object<string, string>} fields - the fields as parseSwiss() returns them.
 * @returns {string} the content SPC….
 */
export function buildSwiss(fields) {
    const referenceType = fields.reftype || NO_REFERENCE;
    const reference = referenceType === NO_REFERENCE ? '' : String(fields.reference || '').replace(/\s+/g, '').toUpperCase();
    const out = [...SWISS_HEADER, formatIban(fields.iban), STRUCTURED_ADDRESS, fields.name, fields.street, fields.house, fields.zip, fields.city,
        String(fields.country || DEFAULT_COUNTRY).toUpperCase(),
        ...new Array(ADDRESS_LINES).fill(''),                    // the ultimate creditor stays empty
        formatPaymentAmount(fields.amount), fields.currency || DEFAULT_CURRENCY,
        ...getDebtorLines(fields), referenceType, reference, fields.message || '', SWISS_TRAILER];
    if (fields.billing) out.push(fields.billing);
    return out.map(value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim()).join('\n');
}

/**
 * Returns the seven lines of the debtor: empty without a name.
 * @param {Object<string, string>} fields - the fields of the bill.
 * @returns {Array<string>} address type, name, street, number, postal code, town and country.
 */
function getDebtorLines(fields) {
    if (!fields.dname) return new Array(ADDRESS_LINES).fill('');
    return [STRUCTURED_ADDRESS, fields.dname, fields.dstreet, fields.dhouse, fields.dzip, fields.dcity, String(fields.dcountry || DEFAULT_COUNTRY).toUpperCase()];
}
