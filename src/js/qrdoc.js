/**
 * The QR document: optional design lines "key: value", a line "---", then the
 * content exactly as it goes into the code. Text without such a header is all
 * content. One final line break of the document is not part of the content.
 *
 * parseDoc() reads a document in these steps:
 *   1. read the header lines up to the line "---" with the place of every line
 *      (for the problems and the highlighting);
 *   2. take the content after it, without the document's final line break;
 *   3. read the design from the key lines, with a problem for every line that
 *      has no effect.
 *
 * setKey(), setKeys(), setContent() and resetDesign() change a document with
 * small edits that keep the rest as it is.
 */

/** The built-in symbols a logo can be. */
export const ICONS = ['wifi', 'web', 'mail', 'phone', 'chat', 'pin', 'calendar', 'user', 'pay', 'star', 'heart'];

const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const PICTURE_PATTERN = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/;
const KEY_LINE_PATTERN = /^([A-Za-z][A-Za-z0-9-]*)[ \t]*:[ \t]?(.*)$/;
const COMMENT_LINE_PATTERN = /^\s*#/;
const LEADING_BLANKS_PATTERN = /^[ \t]*/;
const SEPARATOR = '---';
const FINAL_LINE_BREAK = /\r?\n$/;
const VALUE_PREVIEW_LENGTH = 40;        // a value longer than this is shortened in a problem text

/**
 * How a design key is checked: either a list of allowed values or a test.
 * @typedef {Object} KeyRule
 * @property {string} def - the default value.
 * @property {Array<string>} [values] - the allowed values (compared in lower case, or upper case with `upper`).
 * @property {boolean} [upper] - the values are upper case.
 * @property {function(string): boolean} [test] - tells whether a value is valid, when there is no list.
 * @property {string} [hint] - what a valid value looks like, for the problem text.
 */

/** Every design key with its default and how a value is checked (KeyRule). */
export const KEYS = {
    ecc: { def: 'M', values: ['L', 'M', 'Q', 'H'], upper: true },
    boost: { def: 'yes', values: ['yes', 'no'] },
    version: { def: 'auto', test: v => v === 'auto' || (/^\d+$/.test(v) && +v >= 1 && +v <= 40), hint: 'auto or 1 to 40' },
    mask: { def: 'auto', test: v => v === 'auto' || /^[0-7]$/.test(v), hint: 'auto or 0 to 7' },
    margin: { def: '4', test: v => /^\d+$/.test(v) && +v <= 20, hint: '0 to 20 modules' },
    color: { def: '#000000', test: v => COLOR_PATTERN.test(v), hint: 'a color like #1d2b53' },
    color2: { def: '', test: v => v === '' || COLOR_PATTERN.test(v), hint: 'a color like #1d2b53' },
    gradient: { def: 'none', values: ['none', 'linear', 'radial'] },
    angle: { def: '45', test: v => /^\d+$/.test(v) && +v <= 360, hint: '0 to 360 degrees' },
    background: { def: '#ffffff', test: v => v === 'transparent' || COLOR_PATTERN.test(v), hint: 'a color like #ffffff, or transparent' },
    modules: { def: 'square', values: ['square', 'rounded', 'dots', 'soft', 'diamond', 'bars-v', 'bars-h'] },
    'eye-frame': { def: 'square', values: ['square', 'rounded', 'circle', 'leaf'] },
    'eye-ball': { def: 'square', values: ['square', 'rounded', 'circle', 'diamond', 'leaf'] },
    'eye-color': { def: '', test: v => v === '' || COLOR_PATTERN.test(v), hint: 'a color like #1d2b53' },
    logo: { def: 'none', test: v => v === 'none' || ICONS.includes(v) || PICTURE_PATTERN.test(v), hint: `none, ${ICONS.join(', ')} or a picture as data:image/png;base64,…` },
    'logo-size': { def: '20', test: v => /^\d+$/.test(v) && +v >= 5 && +v <= 30, hint: '5 to 30 percent' },
    'logo-clear': { def: 'yes', values: ['yes', 'no'] },
    caption: { def: '', test: () => true },
    'caption-position': { def: 'below', values: ['below', 'above'] },
    frame: { def: 'none', values: ['none', 'line', 'filled'] },
    'frame-color': { def: '', test: v => v === '' || COLOR_PATTERN.test(v), hint: 'a color like #1d2b53' },
};

/** The default value of every design key. */
export const DEFAULTS = Object.fromEntries(Object.entries(KEYS).map(([key, rule]) => [key, rule.def]));

/**
 * The design of a code: every key of KEYS with its value.
 * @typedef {Object<string, string>} Design
 */

/**
 * One header line of a document; lines are counted from 0.
 * @typedef {Object} DocLine
 * @property {number} n - the line number.
 * @property {number} start - the offset of the line's first character.
 * @property {number} end - the offset of the line's end (its line break or the end of the text).
 * @property {string} kind - "key", "comment", "blank" or "sep" (the line "---").
 * @property {string} [key] - the key in lower case (key lines).
 * @property {string} [value] - the value without surrounding blanks (key lines).
 * @property {number} [valueStart] - the offset of the value (key lines).
 */

/**
 * A problem of a design line.
 * @typedef {Object} DocProblem
 * @property {number} line - the line number, from 0.
 * @property {string} kind - "warn".
 * @property {string} msg - what is wrong.
 */

/**
 * A document as parseDoc() reads it.
 * @typedef {Object} QrDocument
 * @property {boolean} header - whether the document has a header (a line "---").
 * @property {Array<DocLine>} lines - the header lines including "---", empty without a header.
 * @property {number} sepLine - the line number of "---", -1 without a header.
 * @property {number} contentStart - the offset where the content starts.
 * @property {string} content - the content as it goes into the code.
 * @property {number} contentLine - the line number where the content starts.
 * @property {Design} design - the defaults with the valid design lines applied.
 * @property {Object<string, number>} set - the line number of every key that is set.
 * @property {Array<DocProblem>} problems - the problems of the design lines.
 */

/**
 * Reads a document: its header lines, its content and its design.
 * @param {string} text - the document.
 * @returns {QrDocument} the parts of the document.
 */
export function parseDoc(text) {
    const source = String(text ?? '');
    const { lines, sepLine, contentStart } = readHeaderLines(source);
    const header = sepLine >= 0;
    const content = (header ? source.slice(contentStart) : source).replace(FINAL_LINE_BREAK, '');
    const contentLine = header ? sepLine + 1 : 0;
    const { design, set, problems } = header ? readDesign(lines) : { design: { ...DEFAULTS }, set: {}, problems: [] };
    return { header, lines: header ? lines : [], sepLine, contentStart: header ? contentStart : 0, content, contentLine, design, set, problems };
}

/**
 * Reads the lines at the top of a text that can belong to a header, up to the line "---".
 * @param {string} source - the document.
 * @returns {{lines: Array<DocLine>, sepLine: number, contentStart: number}} the lines read,
 *   the line number of "---" (-1 when there is none) and the offset after it (0 when there is none).
 */
function readHeaderLines(source) {
    const lines = [];
    let position = 0, lineNumber = 0;
    while (position <= source.length) {
        const lineBreak = source.indexOf('\n', position);
        const end = lineBreak < 0 ? source.length : lineBreak;
        const line = createHeaderLine(source.slice(position, end).replace(/\r$/, ''), lineNumber, position, end);
        if (!line) break;
        lines.push(line);
        if (line.kind === 'sep') return { lines, sepLine: lineNumber, contentStart: lineBreak < 0 ? source.length : lineBreak + 1 };
        if (lineBreak < 0) break;
        position = lineBreak + 1;
        lineNumber++;
    }
    return { lines, sepLine: -1, contentStart: 0 };
}

/**
 * Describes one line as a header line, or returns null when it cannot be one.
 * @param {string} raw - the line without its line break.
 * @param {number} lineNumber - the line number, from 0.
 * @param {number} start - the offset of the line in the document.
 * @param {number} end - the offset of the line's end.
 * @returns {DocLine|null} the header line, or null for a line of content.
 */
function createHeaderLine(raw, lineNumber, start, end) {
    if (raw.trim() === SEPARATOR) return { n: lineNumber, start, end, kind: 'sep' };
    const keyMatch = KEY_LINE_PATTERN.exec(raw);
    if (!raw.trim()) return { n: lineNumber, start, end, kind: 'blank' };
    if (COMMENT_LINE_PATTERN.test(raw)) return { n: lineNumber, start, end, kind: 'comment' };
    if (!keyMatch) return null;
    const colon = raw.indexOf(':');
    const valueStart = start + colon + 1 + LEADING_BLANKS_PATTERN.exec(raw.slice(colon + 1))[0].length;
    return { n: lineNumber, start, end, kind: 'key', key: keyMatch[1].toLowerCase(), value: keyMatch[2].trim(), valueStart };
}

/**
 * Applies the key lines of a header to the defaults; the last valid line of a key counts.
 * @param {Array<DocLine>} lines - the header lines.
 * @returns {{design: Design, set: Object<string, number>, problems: Array<DocProblem>}} the design,
 *   the line of every key set and the problems of the lines.
 */
function readDesign(lines) {
    const design = { ...DEFAULTS }, set = {}, problems = [];
    for (const line of lines) {
        if (line.kind !== 'key') continue;
        const rule = Object.hasOwn(KEYS, line.key) ? KEYS[line.key] : null;     // "constructor" is an unknown key, not Object's
        if (!rule) { problems.push({ line: line.n, kind: 'warn', msg: `Unknown key "${line.key}" - it is kept, but has no effect` }); continue; }
        if (set[line.key] != null) problems.push({ line: line.n, kind: 'warn', msg: `"${line.key}" is set twice - the last line counts` });
        if (!isValidValue(line.key, line.value)) { problems.push({ line: line.n, kind: 'warn', msg: getInvalidValueText(line, rule) }); continue; }
        design[line.key] = getNormalValue(line.key, line.value);
        set[line.key] = line.n;
    }
    return { design, set, problems };
}

/**
 * Returns the problem text of a key line with a value that is not valid.
 * @param {DocLine} line - the key line.
 * @param {KeyRule} rule - the rule of its key.
 * @returns {string} the problem text.
 */
function getInvalidValueText(line, rule) {
    const shown = line.value.length > VALUE_PREVIEW_LENGTH ? line.value.slice(0, VALUE_PREVIEW_LENGTH) + '…' : line.value;
    return `"${line.key}: ${shown}" is not valid (${rule.hint || rule.values.join(', ')}) - the default is used`;
}

/**
 * Tells whether a value is valid for a key.
 * @param {string} key - a key of KEYS.
 * @param {string} value - the value as written.
 * @returns {boolean} true when the value is allowed.
 */
function isValidValue(key, value) {
    const rule = KEYS[key];
    return rule.values ? rule.values.includes(rule.upper ? value.toUpperCase() : value.toLowerCase()) : rule.test(value);
}

/**
 * Returns a valid value in its normal form: list values in their case, colors as #rrggbb in lower case.
 * @param {string} key - a key of KEYS.
 * @param {string} value - a valid value as written.
 * @returns {string} the normal form.
 */
function getNormalValue(key, value) {
    const rule = KEYS[key];
    if (rule.values) return rule.upper ? value.toUpperCase() : value.toLowerCase();
    return COLOR_PATTERN.test(value) ? expandColor(value) : value;
}

/**
 * Writes a color #rgb as #rrggbb, in lower case.
 * @param {string} color - a color #rgb or #rrggbb.
 * @returns {string} the color as #rrggbb.
 */
function expandColor(color) {
    return (color.length === 4 ? '#' + [...color.slice(1)].map(digit => digit + digit).join('') : color).toLowerCase();
}

/**
 * Returns the document with a key set to a value: its line gets the new value (the last one
 * when it is there twice), a new key goes at the end of the header, a header is made
 * when there is none. The value '' or null removes the key's lines.
 * @param {string} text - the document.
 * @param {string} key - the design key.
 * @param {?string} value - the new value, '' or null to remove the key.
 * @returns {string} the changed document.
 */
export function setKey(text, key, value) {
    const doc = parseDoc(text);
    const isRemoval = value == null || value === '';
    const keyLine = `${key}: ${value}`;
    if (!doc.header) return isRemoval ? text : `${keyLine}\n${SEPARATOR}\n${text}`;
    const ownLines = doc.lines.filter(line => line.kind === 'key' && line.key === key);
    if (isRemoval) {
        let out = text;
        for (const line of ownLines.reverse()) out = out.slice(0, line.start) + out.slice(Math.min(out.length, line.end + 1));
        return out;
    }
    if (ownLines.length) {
        const last = ownLines[ownLines.length - 1];
        return text.slice(0, last.start) + keyLine + text.slice(last.end).replace(/^\r(?=\n)/, '');
    }
    const separator = doc.lines.find(line => line.kind === 'sep');
    return text.slice(0, separator.start) + keyLine + '\n' + text.slice(separator.start);
}

/**
 * Returns the document with several keys set at once (one undo step for the caller).
 * @param {string} text - the document.
 * @param {Object<string, ?string>} pairs - the keys and their new values ('' or null removes a key).
 * @returns {string} the changed document.
 */
export function setKeys(text, pairs) {
    let out = text;
    for (const [key, value] of Object.entries(pairs)) out = setKey(out, key, value);
    return out;
}

/**
 * Returns the document with another content; the header stays as it is. Content that
 * would be read as a header itself gets an empty header in front.
 * @param {string} text - the document.
 * @param {string} content - the new content.
 * @returns {string} the changed document.
 */
export function setContent(text, content) {
    const doc = parseDoc(text);
    // Content that ends with a line break keeps it: the document's own final line break comes after it.
    const tail = /\r?\n$/.test(doc.header ? text.slice(doc.contentStart) : text) || /\n$/.test(content) ? '\n' : '';
    const head = doc.header ? text.slice(0, doc.contentStart) : '';
    const out = head + content + tail;
    if (!doc.header && parseDoc(out).content !== content) return `${SEPARATOR}\n` + content + tail;
    return out;
}

/**
 * Returns the document without its design lines; comments and the content stay.
 * @param {string} text - the document.
 * @returns {string} the changed document.
 */
export function resetDesign(text) {
    const doc = parseDoc(text);
    if (!doc.header) return text;
    const comments = doc.lines.filter(line => line.kind === 'comment').map(line => text.slice(line.start, line.end));
    const rest = text.slice(doc.contentStart);
    // Content that would be read as a header of its own keeps an empty header in front.
    if (!comments.length && parseDoc(rest).content !== doc.content) return `${SEPARATOR}\n` + rest;
    return (comments.length ? comments.join('\n') + `\n${SEPARATOR}\n` : '') + rest;
}

/**
 * Returns the line and column of a character offset in a text.
 * @param {string} text - the whole document text.
 * @param {number} position - the character offset, 0-based.
 * @returns {{line: number, column: number}} 0-based line and column.
 */
export function getLineColumn(text, position) {
    let line = 0, lastBreak = -1;
    for (let i = text.indexOf('\n'); i >= 0 && i < position; i = text.indexOf('\n', i + 1)) { line++; lastBreak = i; }
    return { line, column: position - lastBreak - 1 };
}
