/**
 * The QR documents the editor starts from: the welcome example (START), the
 * templates of "New" (TEMPLATES) and the content each content type starts with
 * when it is chosen in the Content tab (STARTERS).
 */

/**
 * A QR document with its name, as the editor creates it.
 * @typedef {Object} SampleDocument
 * @property {string} name - the name of the new document.
 * @property {string} code - the QR document: design lines, a line "---", then the content.
 */

/**
 * The welcome example: the document the editor opens when it has none.
 * @type {SampleDocument}
 */
export const START = {
    name: 'Guest WiFi',
    code: `# Design: one line "key: value" each - the line --- ends it
color: #1d2b53
color2: #2c55c9
gradient: linear
angle: 45
modules: rounded
eye-frame: rounded
eye-ball: rounded
eye-color: #c2185b
logo: wifi
logo-size: 22
ecc: H
caption: Guest WiFi - just scan
frame: filled
frame-color: #1d2b53
---
WIFI:T:WPA;S:Guest;P:sunny-day-42;;
`,
};

/* The design lines most templates share. */
const TEMPLATE_DESIGN = 'color: #1d2b53\neye-frame: rounded\neye-ball: rounded\n';

/**
 * The templates of "New", by the kind the menu names.
 * @type {Object<string, SampleDocument>}
 */
export const TEMPLATES = {
    link: { name: 'Link', code: `${TEMPLATE_DESIGN}---\nhttps://example.com\n` },
    text: { name: 'Text', code: 'Hello! This text is in the QR code.\n' },
    wifi: { name: 'WiFi', code: `${TEMPLATE_DESIGN}logo: wifi\necc: Q\ncaption: Scan for WiFi\n---\nWIFI:T:WPA;S:MyNetwork;P:my-password;;\n` },
    contact: { name: 'Contact', code: `${TEMPLATE_DESIGN}---\nBEGIN:VCARD\nVERSION:3.0\nN:Muster;Anna;;;\nFN:Anna Muster\nORG:Example Ltd\nTEL;TYPE=CELL:+41 79 123 45 67\nEMAIL:anna@example.com\nURL:https://example.com\nEND:VCARD\n` },
    event: { name: 'Event', code: `${TEMPLATE_DESIGN}logo: calendar\necc: Q\n---\nBEGIN:VEVENT\nSUMMARY:Summer party\nDTSTART:20270618T180000\nDTEND:20270618T230000\nLOCATION:Rheinfallquai 1, Neuhausen am Rheinfall\nEND:VEVENT\n` },
    email: { name: 'Email', code: `${TEMPLATE_DESIGN}logo: mail\necc: Q\n---\nmailto:info@example.com?subject=Hello\n` },
    sms: { name: 'SMS', code: `${TEMPLATE_DESIGN}---\nSMSTO:+41791234567:Hello!\n` },
    phone: { name: 'Phone', code: `${TEMPLATE_DESIGN}logo: phone\necc: Q\n---\ntel:+41521234567\n` },
    location: { name: 'Location', code: `${TEMPLATE_DESIGN}logo: pin\necc: Q\n---\ngeo:47.6779,8.6152?q=47.6779,8.6152(Rhine%20Falls)\n` },
    crypto: { name: 'Bitcoin', code: `${TEMPLATE_DESIGN}---\nbitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.001&label=Donation\n` },
    epc: { name: 'SEPA payment', code: '---\nBCD\n002\n1\nSCT\n\nRed Cross\nDE89370400440532013000\nEUR25.00\n\n\nDonation\n' },
    swiss: { name: 'Swiss QR bill', code: '---\nSPC\n0200\n1\nCH4431999123000889012\nS\nRobert Schneider AG\nRue du Lac\n1268\n2501\nBiel\nCH\n\n\n\n\n\n\n\n1949.75\nCHF\nS\nPia-Maria Rutschmann-Schnyder\nGrosse Marktgasse\n28\n9400\nRorschach\nCH\nQRR\n210000000003139471430009017\nOrder of 15 June 2026\nEPD\n' },
};

/**
 * The content a content type starts with when it is chosen in the Content tab, by type.
 * @type {Object<string, string>}
 */
export const STARTERS = {
    link: 'https://example.com', text: 'Hello!', wifi: 'WIFI:T:WPA;S:MyNetwork;P:my-password;;',
    contact: 'BEGIN:VCARD\nVERSION:3.0\nN:Muster;Anna;;;\nFN:Anna Muster\nTEL;TYPE=CELL:+41 79 123 45 67\nEND:VCARD',
    email: 'mailto:info@example.com?subject=Hello', sms: 'SMSTO:+41791234567:Hello!', phone: 'tel:+41521234567',
    location: 'geo:47.6779,8.6152', event: 'BEGIN:VEVENT\nSUMMARY:Meeting\nDTSTART:20270115T090000\nDTEND:20270115T100000\nEND:VEVENT',
    crypto: 'bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', epc: 'BCD\n002\n1\nSCT\n\nRecipient\nDE89370400440532013000\nEUR10.00\n\n\nPayment',
    swiss: TEMPLATES.swiss.code.slice(4).trimEnd(),
};
