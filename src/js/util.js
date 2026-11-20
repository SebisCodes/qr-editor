/**
 * Small helpers shared by the modules of the editor: a name that works as a
 * file name, and saving text or a Blob as a file of the browser's downloads.
 */

const DEFAULT_FILE_NAME = 'qr-code';
const UNSAFE_FILE_NAME_CHARACTERS = /[\\/:*?"<>|]+/g;  // characters that file systems refuse in a name
const UNSAFE_CHARACTER_SUBSTITUTE = '-';
const DEFAULT_MIME_TYPE = 'application/octet-stream';
const TEXT_MIME_TYPE = /^text|xml|json|x-tex/;          // types that are saved as UTF-8 text
const UTF8_CHARSET = ';charset=utf-8';
const OBJECT_URL_LIFETIME_MS = 4000;                    // the address of the file stays valid this long after the click

/**
 * Returns a name that works as a file name: trimmed, "qr-code" when empty, and
 * every run of characters that file systems refuse turned into one "-".
 * @param {*} name - the name of a document (null and undefined count as empty).
 * @returns {string} the file name without extension.
 */
export function getSafeFileName(name) {
    return (String(name || '').trim() || DEFAULT_FILE_NAME).replace(UNSAFE_FILE_NAME_CHARACTERS, UNSAFE_CHARACTER_SUBSTITUTE);
}

/**
 * Saves text or a Blob as a file: the browser downloads it under the given name.
 * @param {string|Blob} data - the content; text is saved with the given type (UTF-8 for text types).
 * @param {string} name - the file name with extension.
 * @param {string} [type] - the MIME type of text content, "application/octet-stream" by default.
 * @returns {void}
 */
export function saveFile(data, name, type = DEFAULT_MIME_TYPE) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type + (TEXT_MIME_TYPE.test(type) ? UTF8_CHARSET : '') });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), OBJECT_URL_LIFETIME_MS);
}
