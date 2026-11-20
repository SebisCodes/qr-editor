/**
 * Bank numbers of the payment codes: the IBAN (ISO 13616, check digits modulo 97),
 * the QR-IBAN of the Swiss QR bill, the QR reference (27 digits, check digit
 * modulo 10 recursive), the creditor reference (ISO 11649) and the amount.
 * The ...Problem functions return '' for a valid number, otherwise what is wrong.
 */

/** The length of an IBAN by country. */
const IBAN_LENGTHS = {
    AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GI: 23,
    GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28,
    PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22,
};
const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/;
const CHECK_PART_LENGTH = 4;            // country code and check digits of an IBAN, or RF and check digits
const COUNTRY_LENGTH = 2;
const MOD97_VALID = 1;
const MOD97_BASE = 98;
const LETTER_OFFSET = 55;               // A = 10, B = 11, … in the modulo 97 checks
const QR_IBAN_COUNTRIES = /^(CH|LI)/;
const QR_IID_START = 4;                 // the institution id of a QR-IBAN: characters 5 to 9
const QR_IID_END = 9;
const QR_IID_FIRST = 30000;
const QR_IID_LAST = 31999;
const MOD10_TABLE = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
const QR_REFERENCE_PATTERN = /^\d{27}$/;
const QR_REFERENCE_BASE_LENGTH = 26;
const CREDITOR_REFERENCE_PATTERN = /^RF\d{2}[A-Z0-9]{1,21}$/;
const CREDITOR_REFERENCE_BASE_LENGTH = 21;
const CREDITOR_REFERENCE_PREFIX = 'RF';
const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;
const AMOUNT_MIN = 0.01;
const AMOUNT_MAX = 999999999.99;

/**
 * Returns the remainder modulo 97 of a long number written as digits.
 * @param {string} digits - the digits.
 * @returns {number} the remainder.
 */
function getMod97(digits) {
    let remainder = 0;
    for (const digit of digits) remainder = (remainder * 10 + +digit) % 97;
    return remainder;
}

/**
 * Writes the letters of a text as numbers (A = 10 … Z = 35), as the modulo 97 checks need it.
 * @param {string} text - letters and digits.
 * @returns {string} digits only.
 */
function convertLettersToDigits(text) {
    return text.toUpperCase().replace(/[A-Z]/g, letter => String(letter.charCodeAt(0) - LETTER_OFFSET));
}

/**
 * Tells whether the check digits of an IBAN or a creditor reference match (modulo 97 is 1).
 * @param {string} number - the IBAN or reference without spaces, in upper case.
 * @returns {boolean} true when the check digits match.
 */
function hasValidMod97(number) {
    return getMod97(convertLettersToDigits(number.slice(CHECK_PART_LENGTH) + number.slice(0, CHECK_PART_LENGTH))) === MOD97_VALID;
}

/**
 * Writes an IBAN without spaces, in upper case.
 * @param {string} iban - the IBAN as typed.
 * @returns {string} the IBAN in electronic form.
 */
export function formatIban(iban) {
    return String(iban || '').replace(/\s+/g, '').toUpperCase();
}

/**
 * Checks an IBAN: form, length of its country and check digits.
 * @param {string} iban - the IBAN as typed.
 * @returns {string} '' when the IBAN is valid, otherwise what is wrong.
 */
export function getIbanProblem(iban) {
    const number = formatIban(iban);
    if (!number) return 'The IBAN is missing';
    if (!IBAN_PATTERN.test(number)) return 'The IBAN has the wrong form (two letters, two digits, then letters and digits)';
    const country = number.slice(0, COUNTRY_LENGTH);
    const expectedLength = IBAN_LENGTHS[country];
    if (expectedLength && number.length !== expectedLength) return `An IBAN of ${country} has ${expectedLength} characters, this one ${number.length}`;
    if (!hasValidMod97(number)) return 'The check digits of the IBAN do not match - a typing error?';
    return '';
}

/**
 * Tells whether an IBAN is a QR-IBAN: Switzerland or Liechtenstein with an institution id of 30000 to 31999.
 * @param {string} iban - the IBAN as typed.
 * @returns {boolean} true for a QR-IBAN.
 */
export function isQrIban(iban) {
    const number = formatIban(iban);
    const institution = +number.slice(QR_IID_START, QR_IID_END);
    return QR_IBAN_COUNTRIES.test(number) && institution >= QR_IID_FIRST && institution <= QR_IID_LAST;
}

/**
 * Returns the check digit of a QR reference (modulo 10, recursive).
 * @param {string} digits - the digits that precede the check digit.
 * @returns {number} the check digit.
 */
export function getMod10CheckDigit(digits) {
    let carry = 0;
    for (const digit of digits) carry = MOD10_TABLE[(carry + +digit) % 10];
    return (10 - carry) % 10;
}

/**
 * Checks a QR reference: 27 digits, the last one the check digit.
 * @param {string} reference - the reference as typed.
 * @returns {string} '' when the reference is valid, otherwise what is wrong.
 */
export function getQrReferenceProblem(reference) {
    const digits = String(reference || '').replace(/\s+/g, '');
    if (!QR_REFERENCE_PATTERN.test(digits)) return 'A QR reference has 27 digits';
    if (getMod10CheckDigit(digits.slice(0, QR_REFERENCE_BASE_LENGTH)) !== +digits[QR_REFERENCE_BASE_LENGTH]) return 'The check digit of the QR reference does not match';
    return '';
}

/**
 * Checks a creditor reference (ISO 11649): RF, two check digits, up to 21 letters and digits.
 * @param {string} reference - the reference as typed.
 * @returns {string} '' when the reference is valid, otherwise what is wrong.
 */
export function getCreditorReferenceProblem(reference) {
    const number = String(reference || '').replace(/\s+/g, '').toUpperCase();
    if (!CREDITOR_REFERENCE_PATTERN.test(number)) return 'A creditor reference starts with RF and two check digits, 5 to 25 characters';
    if (!hasValidMod97(number)) return 'The check digits of the creditor reference do not match';
    return '';
}

/**
 * Builds a QR reference from any number: its last 26 digits, padded with zeros, and the check digit.
 * @param {string} base - the number, other characters are left out.
 * @returns {string} the 27 digits of the reference.
 */
export function buildQrReference(base) {
    const digits = String(base || '').replace(/\D/g, '').slice(-QR_REFERENCE_BASE_LENGTH).padStart(QR_REFERENCE_BASE_LENGTH, '0');
    return digits + getMod10CheckDigit(digits);
}

/**
 * Builds a creditor reference from any text: up to 21 letters and digits after RF and the check digits.
 * @param {string} base - the text, other characters are left out; "1" when nothing is left.
 * @returns {string} the reference.
 */
export function buildCreditorReference(base) {
    const reference = String(base || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, CREDITOR_REFERENCE_BASE_LENGTH) || '1';
    const checkDigits = MOD97_BASE - getMod97(convertLettersToDigits(reference + CREDITOR_REFERENCE_PREFIX + '00'));
    return CREDITOR_REFERENCE_PREFIX + String(checkDigits).padStart(2, '0') + reference;
}

/**
 * Tells whether an amount is valid for a payment code: up to 9 digits, a point and up to two decimals, 0.01 to the maximum.
 * @param {string} amount - the amount as written in the code.
 * @param {number} [max] - the largest amount allowed.
 * @returns {boolean} true when the amount is valid.
 */
export function isValidAmount(amount, max = AMOUNT_MAX) {
    return AMOUNT_PATTERN.test(amount) && +amount >= AMOUNT_MIN && +amount <= max;
}
