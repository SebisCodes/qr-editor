/**
 * The problems of the payment codes: the EPC069-12 SEPA credit transfer and the
 * Swiss Payments Code of the Swiss QR bill (SIX Implementation Guidelines 2.3
 * and 2.4). Each problem names the line of the element it is about.
 *
 * addSwissProblems() checks in the order of the code: header and creditor
 * account, creditor, amount, debtor, reference, then message, trailer, lengths
 * and characters of the whole code.
 */

import {
    formatIban, getCreditorReferenceProblem, getIbanProblem, getQrReferenceProblem, isQrIban, isValidAmount,
} from './payload-bank.js?v=2';
import { EPC_LINE, SWISS_LINE } from './payload-payment.js?v=2';
import { getUtf8Length, splitLines } from './payload-text.js?v=2';

const EPC_VERSIONS = ['002', '001'];
const EPC_VERSION_WITH_BIC = '001';
const UTF8_ENCODING = '1';
const SEPA_CREDIT_TRANSFER = 'SCT';
const BIC_PATTERN = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
const PURPOSE_PATTERN = /^[A-Z0-9]{4}$/;
const NAME_MAX = 70;
const MESSAGE_MAX = 140;
const EPC_MAX_BYTES = 331;
const SWISS_VERSION = '0200';
const SWISS_CODING = '1';
const SWISS_COUNTRIES = /^(CH|LI)/;
const STRUCTURED_ADDRESS = 'S';
const COUNTRY_CODE = /^[A-Z]{2}$/;
const CURRENCIES = ['CHF', 'EUR'];
const REFERENCE_TYPES = ['QRR', 'SCOR', 'NON'];
const SWISS_TRAILER = 'EPD';
/** The most characters of the creditor and debtor lines, by line. */
const SWISS_LINE_LIMITS = { 5: 70, 6: 70, 7: 16, 8: 16, 9: 35, 21: 70, 22: 70, 23: 16, 24: 16, 25: 35 };
const SWISS_LATIN = /^[\u0020-\u007e\u00a0-\u017f\u0218-\u021b\u20ac]*$/;
const SWISS_MAX_CHARACTERS = 997;

/**
 * Adds the problems of a SEPA credit transfer.
 * @param {Object<string, string>} fields - the fields of the transfer.
 * @param {string} content - the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
export function addEpcProblems(fields, content, problems) {
    const lines = splitLines(content);
    const version = lines[EPC_LINE.version];
    if (!EPC_VERSIONS.includes(version)) problems.addError('The second line is the version, 001 or 002', EPC_LINE.version);
    if (lines[EPC_LINE.encoding] !== UTF8_ENCODING) problems.addWarning('The third line should be 1 (UTF-8)', EPC_LINE.encoding);
    if (lines[EPC_LINE.identification] !== SEPA_CREDIT_TRANSFER) problems.addError('The fourth line must be SCT', EPC_LINE.identification);
    if (version === EPC_VERSION_WITH_BIC && !fields.bic) problems.addError('Version 001 needs a BIC', EPC_LINE.bic);
    if (fields.bic && !BIC_PATTERN.test(fields.bic)) problems.addError('The BIC has 8 or 11 letters and digits', EPC_LINE.bic);
    if (!fields.name) problems.addError('The recipient is missing', EPC_LINE.name);
    else if (fields.name.length > NAME_MAX) problems.addError('The recipient has more than 70 characters', EPC_LINE.name);
    const ibanProblem = getIbanProblem(fields.iban);
    if (ibanProblem) problems.addError(ibanProblem, EPC_LINE.iban);
    if (fields.amount && !isValidAmount(fields.amount)) problems.addError('The amount is between 0.01 and 999999999.99 EUR, with a point and at most two decimals', EPC_LINE.amount);
    if (fields.purpose && !PURPOSE_PATTERN.test(fields.purpose)) problems.addError('The purpose code has 4 letters (for example CHAR, GDDS)', EPC_LINE.purpose);
    if (fields.reference && fields.text) problems.addError('Either a reference or a message, not both', EPC_LINE.text);
    if (fields.reference && getCreditorReferenceProblem(fields.reference)) problems.addWarning(getCreditorReferenceProblem(fields.reference), EPC_LINE.reference);
    if (fields.text && fields.text.length > MESSAGE_MAX) problems.addError('The message has more than 140 characters', EPC_LINE.text);
    if (getUtf8Length(content) > EPC_MAX_BYTES) problems.addError(`The SEPA code has ${getUtf8Length(content)} bytes, at most 331 are allowed`);
}

/**
 * Adds the problems of a Swiss QR bill, in the order of its elements.
 * @param {Object<string, string>} fields - the fields of the bill.
 * @param {string} content - the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
export function addSwissProblems(fields, content, problems) {
    const lines = splitLines(content);
    addSwissHeaderProblems(fields, lines, problems);
    addSwissCreditorProblems(fields, lines, problems);
    addSwissAmountProblems(fields, problems);
    addSwissDebtorProblems(fields, problems);
    addSwissReferenceProblems(fields, problems);
    addSwissTextProblems(fields, content, lines, problems);
}

/**
 * Adds the problems of the version, the coding type, the account and the creditor's address type.
 * @param {Object<string, string>} fields - the fields of the bill.
 * @param {Array<string>} lines - the lines of the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addSwissHeaderProblems(fields, lines, problems) {
    if (lines[SWISS_LINE.version] !== SWISS_VERSION) problems.addError('The second line is the version 0200', SWISS_LINE.version);
    if (lines[SWISS_LINE.coding] !== SWISS_CODING) problems.addError('The third line is the coding type 1', SWISS_LINE.coding);
    const ibanProblem = getIbanProblem(fields.iban);
    if (ibanProblem) problems.addError(ibanProblem, SWISS_LINE.iban);
    else if (!SWISS_COUNTRIES.test(formatIban(fields.iban))) problems.addError('The Swiss QR bill takes only IBANs of Switzerland and Liechtenstein (CH, LI)', SWISS_LINE.iban);
    if (fields.addrType !== STRUCTURED_ADDRESS) problems.addError('The creditor address must be structured (S): street, number, postal code and town in their own lines', SWISS_LINE.addressType);
}

/**
 * Adds the problems of the creditor: name, postal code and town, country, and the ultimate creditor that stays empty.
 * @param {Object<string, string>} fields - the fields of the bill.
 * @param {Array<string>} lines - the lines of the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addSwissCreditorProblems(fields, lines, problems) {
    if (!fields.name) problems.addError('The creditor name is missing', SWISS_LINE.name);
    if (!fields.zip || !fields.city) problems.addError('Postal code and town of the creditor are needed', SWISS_LINE.zip);
    if (!COUNTRY_CODE.test(fields.country)) problems.addError('The country of the creditor is two letters, for example CH', SWISS_LINE.country);
    for (let line = SWISS_LINE.ultimateFirst; line <= SWISS_LINE.ultimateLast; line++) {
        if (lines[line]) problems.addError('The ultimate creditor (lines 12 to 18) must stay empty', line);
    }
}

/**
 * Adds the problems of amount and currency.
 * @param {Object<string, string>} fields - the fields of the bill.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addSwissAmountProblems(fields, problems) {
    if (fields.amount && !isValidAmount(fields.amount)) problems.addError('The amount is between 0.01 and 999999999.99, with a point and two decimals', SWISS_LINE.amount);
    if (!CURRENCIES.includes(fields.currency)) problems.addError('The currency is CHF or EUR', SWISS_LINE.currency);
}

/**
 * Adds the problems of the debtor: postal code and town, a structured address.
 * @param {Object<string, string>} fields - the fields of the bill.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addSwissDebtorProblems(fields, problems) {
    if (fields.dname && (!fields.dzip || !fields.dcity)) problems.addError('Postal code and town of the payer are needed', SWISS_LINE.debtorZip);
    if (fields.dAddrType && fields.dAddrType !== STRUCTURED_ADDRESS) problems.addError('The payer\'s address must be structured (S)', SWISS_LINE.debtorAddressType);
}

/**
 * Adds the problems of the reference: its type against the account and the currency, the reference number.
 * @param {Object<string, string>} fields - the fields of the bill.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addSwissReferenceProblems(fields, problems) {
    const hasQrIban = isQrIban(fields.iban);
    if (!REFERENCE_TYPES.includes(fields.reftype)) problems.addError('The reference type is QRR, SCOR or NON', SWISS_LINE.referenceType);
    if (hasQrIban && fields.reftype !== 'QRR') problems.addError('A QR-IBAN needs a QR reference (QRR)', SWISS_LINE.referenceType);
    if (!hasQrIban && fields.reftype === 'QRR') problems.addError('A QR reference needs a QR-IBAN (an IBAN with 30000 to 31999 after the check digits)', SWISS_LINE.referenceType);
    if (fields.currency === 'EUR' && (hasQrIban || fields.reftype === 'QRR')) problems.addError('From 14 November 2026 a bill in EUR takes only an IBAN with a creditor reference (SCOR) or none - QR-IBAN and QR reference only in CHF', SWISS_LINE.referenceType);
    const referenceProblem = getReferenceProblem(fields);
    if (referenceProblem) problems.addError(referenceProblem, SWISS_LINE.reference);
}

/**
 * Returns what is wrong with the reference number for its type.
 * @param {Object<string, string>} fields - the fields of the bill.
 * @returns {string} '' when the reference fits its type, otherwise what is wrong.
 */
function getReferenceProblem(fields) {
    if (fields.reftype === 'QRR') return getQrReferenceProblem(fields.reference);
    if (fields.reftype === 'SCOR') return getCreditorReferenceProblem(fields.reference);
    if (fields.reftype === 'NON' && fields.reference) return 'Without a reference type the reference line must be empty';
    return '';
}

/**
 * Adds the problems of the whole code: message length, the trailer EPD, line lengths, characters and total length.
 * @param {Object<string, string>} fields - the fields of the bill.
 * @param {string} content - the content.
 * @param {Array<string>} lines - the lines of the content.
 * @param {ProblemList} problems - the list to add to.
 * @returns {void}
 */
function addSwissTextProblems(fields, content, lines, problems) {
    if ((fields.message || '').length + (fields.billing || '').length > MESSAGE_MAX) problems.addError('Message and billing information together have at most 140 characters', SWISS_LINE.message);
    if (lines[SWISS_LINE.trailer] !== SWISS_TRAILER) problems.addError('Line 31 must be EPD (end of the payment data)', SWISS_LINE.trailer);
    for (const [line, max] of Object.entries(SWISS_LINE_LIMITS)) {
        if ((lines[line] || '').length > max) problems.addError(`Line ${+line + 1} has more than ${max} characters`, +line);
    }
    if (!SWISS_LATIN.test(content.replace(/\r?\n/g, ''))) problems.addError('The Swiss QR bill allows only Latin characters (no emoji, no other scripts)');
    if (content.length > SWISS_MAX_CHARACTERS) problems.addError(`The Swiss QR bill has ${content.length} characters, at most 997 are allowed`);
}
