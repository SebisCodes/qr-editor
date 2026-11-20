/**
 * The form fields of each content type: the editor builds the form of a type
 * from this list, and parse / build in payload.js read and write the same keys.
 */

/**
 * One field of a form.
 * @typedef {Object} Field
 * @property {string} k - the key of the value in the fields of the type.
 * @property {string} label - the label above the field (English; the language pack translates it).
 * @property {string} kind - "text", "area", "select", "check", "number", "datetime" or "date".
 * @property {Array<Array<string>>} [opts] - the choices of a select: [value, label].
 * @property {string} [ph] - the placeholder, a sample of the format.
 * @property {string} [mode] - the input mode of the keyboard ("url", "tel", "email", "decimal").
 * @property {boolean} [half] - the field takes half the width.
 * @property {boolean} [mono] - the value is shown in a monospaced font (IBAN, references).
 * @property {number} [max] - the most characters the format allows.
 * @property {function(Object<string, *>): boolean} [show] - tells from the values of the form whether the field is shown.
 */

/**
 * The fields of every content type, in the order of the form.
 * @type {Object<string, Array<Field>>}
 */
export const FIELDS = {
    link: [{ k: 'url', label: 'Address (URL)', kind: 'text', ph: 'https://example.com', mode: 'url' }],
    text: [{ k: 'text', label: 'Text', kind: 'area', ph: 'Any text' }],
    wifi: [
        { k: 'ssid', label: 'Network name (SSID)', kind: 'text' },
        { k: 'auth', label: 'Security', kind: 'select', opts: [['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP (old)'], ['nopass', 'None (open network)']] },
        { k: 'password', label: 'Password', kind: 'text', show: f => f.auth !== 'nopass' },
        { k: 'hidden', label: 'Hidden network', kind: 'check' },
    ],
    contact: [
        { k: 'format', label: 'Format', kind: 'select', opts: [['vcard', 'vCard 3.0 (all phones)'], ['mecard', 'MeCard (smaller code)']] },
        { k: 'first', label: 'First name', kind: 'text', half: true },
        { k: 'last', label: 'Last name', kind: 'text', half: true },
        { k: 'org', label: 'Company', kind: 'text', half: true },
        { k: 'title', label: 'Job title', kind: 'text', half: true, show: f => f.format !== 'mecard' },
        { k: 'mobile', label: 'Mobile', kind: 'text', half: true, mode: 'tel' },
        { k: 'phone', label: 'Phone (work)', kind: 'text', half: true, mode: 'tel' },
        { k: 'email', label: 'Email', kind: 'text', mode: 'email' },
        { k: 'url', label: 'Website', kind: 'text', mode: 'url' },
        { k: 'street', label: 'Street and number', kind: 'text' },
        { k: 'zip', label: 'Postal code', kind: 'text', half: true },
        { k: 'city', label: 'City', kind: 'text', half: true },
        { k: 'region', label: 'Region', kind: 'text', half: true, show: f => f.format !== 'mecard' },
        { k: 'country', label: 'Country', kind: 'text', half: true },
        { k: 'note', label: 'Note', kind: 'area' },
    ],
    email: [
        { k: 'to', label: 'To', kind: 'text', mode: 'email' },
        { k: 'subject', label: 'Subject', kind: 'text' },
        { k: 'body', label: 'Message', kind: 'area' },
    ],
    sms: [
        { k: 'number', label: 'Phone number', kind: 'text', mode: 'tel' },
        { k: 'message', label: 'Message', kind: 'area' },
    ],
    phone: [{ k: 'number', label: 'Phone number', kind: 'text', mode: 'tel', ph: '+41 52 123 45 67' }],
    location: [
        { k: 'lat', label: 'Latitude', kind: 'text', half: true, ph: '47.6779' },
        { k: 'lon', label: 'Longitude', kind: 'text', half: true, ph: '8.6152' },
        { k: 'label', label: 'Name of the place (optional)', kind: 'text' },
    ],
    event: [
        { k: 'title', label: 'Title', kind: 'text' },
        { k: 'allday', label: 'All day', kind: 'check' },
        { k: 'start', label: 'Start', kind: 'datetime', half: true },
        { k: 'end', label: 'End', kind: 'datetime', half: true },
        { k: 'location', label: 'Place', kind: 'text' },
        { k: 'description', label: 'Description', kind: 'area' },
    ],
    crypto: [
        { k: 'coin', label: 'Currency', kind: 'select', opts: [['bitcoin', 'Bitcoin (BTC)'], ['ethereum', 'Ethereum (ETH)'], ['litecoin', 'Litecoin (LTC)'], ['bitcoincash', 'Bitcoin Cash (BCH)'], ['dogecoin', 'Dogecoin (DOGE)']] },
        { k: 'address', label: 'Address', kind: 'text' },
        { k: 'amount', label: 'Amount (optional)', kind: 'text', half: true, mode: 'decimal' },
        { k: 'label', label: 'Recipient (optional)', kind: 'text', half: true, show: f => f.coin !== 'ethereum' },
        { k: 'message', label: 'Message (optional)', kind: 'text', show: f => f.coin !== 'ethereum' },
    ],
    epc: [
        { k: 'name', label: 'Recipient', kind: 'text', max: 70 },
        { k: 'iban', label: 'IBAN', kind: 'text', mono: true },
        { k: 'bic', label: 'BIC (optional)', kind: 'text', half: true, max: 11, mono: true },
        { k: 'amount', label: 'Amount in EUR (optional)', kind: 'text', half: true, mode: 'decimal' },
        { k: 'reference', label: 'Creditor reference RF… (or a message below)', kind: 'text', max: 35, mono: true },
        { k: 'text', label: 'Message to the recipient', kind: 'text', max: 140 },
        { k: 'purpose', label: 'Purpose code (optional, e.g. CHAR)', kind: 'text', half: true, max: 4 },
        { k: 'info', label: 'Note for the payer (optional)', kind: 'text', half: true, max: 70 },
    ],
    swiss: [
        { k: 'iban', label: 'IBAN or QR-IBAN of the creditor (CH or LI)', kind: 'text', mono: true },
        { k: 'name', label: 'Creditor name', kind: 'text', max: 70 },
        { k: 'street', label: 'Street', kind: 'text', half: true, max: 70 },
        { k: 'house', label: 'Number', kind: 'text', half: true, max: 16 },
        { k: 'zip', label: 'Postal code', kind: 'text', half: true, max: 16 },
        { k: 'city', label: 'Town', kind: 'text', half: true, max: 35 },
        { k: 'country', label: 'Country (2 letters)', kind: 'text', half: true, max: 2 },
        { k: 'currency', label: 'Currency', kind: 'select', half: true, opts: [['CHF', 'CHF'], ['EUR', 'EUR']] },
        { k: 'amount', label: 'Amount (empty: the payer fills it in)', kind: 'text', mode: 'decimal' },
        { k: 'reftype', label: 'Reference', kind: 'select', opts: [['NON', 'No reference'], ['QRR', 'QR reference (with a QR-IBAN)'], ['SCOR', 'Creditor reference (RF…)']] },
        { k: 'reference', label: 'Reference number', kind: 'text', mono: true, show: f => f.reftype !== 'NON' },
        { k: 'message', label: 'Additional information (message)', kind: 'text', max: 140 },
        { k: 'billing', label: 'Billing information (optional, //S1/…)', kind: 'text', max: 140 },
        { k: 'dname', label: 'Payable by: name (optional)', kind: 'text', max: 70 },
        { k: 'dstreet', label: 'Street', kind: 'text', half: true, max: 70, show: f => !!f.dname },
        { k: 'dhouse', label: 'Number', kind: 'text', half: true, max: 16, show: f => !!f.dname },
        { k: 'dzip', label: 'Postal code', kind: 'text', half: true, max: 16, show: f => !!f.dname },
        { k: 'dcity', label: 'Town', kind: 'text', half: true, max: 35, show: f => !!f.dname },
        { k: 'dcountry', label: 'Country', kind: 'text', half: true, max: 2, show: f => !!f.dname },
    ],
};
