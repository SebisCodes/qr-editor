/**
 * The cards of "My documents": one per document, with its picture, name, age
 * and size, and the buttons rename, duplicate, download and delete (files.js
 * handles their clicks through data-act).
 */

const KILOBYTE = 1024;
const ONE_DECIMAL_BELOW = 10240;         // sizes below 10 KB show one decimal
const SECOND_MS = 1000;
const AGE_STEPS_S = { minute: 60, hour: 3600, day: 86400, twoDays: 172800 };
const ICON_PATHS = {
    rename: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    download: '<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>',
    delete: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
};

/** @typedef {import('./files-store.js').FileEntry} FileEntry */

/**
 * Creates the card of a document: its picture, name, age and size, and its buttons.
 * @param {FileEntry} entry - the document's entry.
 * @param {string} code - its QR document, for the picture.
 * @param {boolean} isCurrent - whether it is the open document.
 * @param {function(string): string} renderThumbnail - returns the SVG of a QR document for the picture.
 * @returns {HTMLLIElement} the card.
 */
export function createFileCard(entry, code, isCurrent, renderThumbnail) {
    const card = document.createElement('li');
    card.className = 'file-card' + (isCurrent ? ' current' : '');
    card.dataset.id = entry.id;
    card.innerHTML = `<button type="button" class="file-open"><span class="file-picture qr-picture" data-no-i18n></span></button>
            <div class="file-text"><span class="file-name" data-no-i18n></span><span class="file-info muted"></span></div>
            <div class="file-buttons">
                <button type="button" class="item-button" data-act="rename" title="Rename" aria-label="Rename">${getIcon('rename')}</button>
                <button type="button" class="item-button" data-act="copy" title="Duplicate" aria-label="Duplicate">${getIcon('copy')}</button>
                <button type="button" class="item-button" data-act="download" title="Download as .qr" aria-label="Download">${getIcon('download')}</button>
                <button type="button" class="item-button danger" data-act="delete" title="Delete" aria-label="Delete">${getIcon('delete')}</button>
            </div>`;
    card.title = isCurrent ? 'This document is open' : 'Click to open this document';
    card.querySelector('.qr-picture').innerHTML = renderThumbnail(code);
    card.querySelector('.file-name').textContent = entry.name;
    card.querySelector('.file-open').setAttribute('aria-label', isCurrent ? `${entry.name} (open now)` : `Open ${entry.name}`);
    card.querySelector('.file-info').textContent = isCurrent ? `Open now · ${formatSize(entry.size || 0)}` : `${formatAge(entry.updated)} · ${formatSize(entry.size || 0)}`;
    return card;
}

/**
 * Returns when a document last changed, as the list shows it: "just now", "5 min ago", "3 h ago", "yesterday" or the date.
 * @param {number} timestamp - when it last changed (ms since the epoch).
 * @returns {string} the age.
 */
function formatAge(timestamp) {
    const seconds = (Date.now() - timestamp) / SECOND_MS;
    if (seconds < AGE_STEPS_S.minute) return 'just now';
    if (seconds < AGE_STEPS_S.hour) return `${Math.floor(seconds / AGE_STEPS_S.minute)} min ago`;
    if (seconds < AGE_STEPS_S.day) return `${Math.floor(seconds / AGE_STEPS_S.hour)} h ago`;
    if (seconds < AGE_STEPS_S.twoDays) return 'yesterday';
    return new Date(timestamp).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Returns a size as the list shows it: "512 bytes", "3.4 KB", "120 KB".
 * @param {number} bytes - the size in bytes.
 * @returns {string} the size.
 */
export function formatSize(bytes) {
    return bytes < KILOBYTE ? `${bytes} bytes` : `${(bytes / KILOBYTE).toFixed(bytes < ONE_DECIMAL_BELOW ? 1 : 0)} KB`;
}

/**
 * Returns the SVG of a button icon.
 * @param {string} name - "rename", "copy", "download" or "delete".
 * @returns {string} the SVG markup.
 */
function getIcon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}
