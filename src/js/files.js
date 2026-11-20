/**
 * My documents: the dialog that lists the documents kept in this browser
 * (the store is files-store.js; this module passes it on as store). The
 * editor works on one of them at a time; the dialog opens, renames,
 * duplicates, downloads and deletes them, and saves all as a ZIP.
 *
 * createFiles() runs these steps:
 *   1. handle the clicks on the cards (open, rename, duplicate, download, delete);
 *   2. filter the list while the user types in the search field;
 *   3. connect the buttons New, Import and ZIP;
 *   4. show the list again when another editor tab changes it.
 */

import { openDialog, openConfirmation } from './dialogs.js?v=5';
import { createZip } from './zip.js?v=4';
import { saveFile, getSafeFileName } from './util.js?v=3';
import { store, LIST_KEY } from './files-store.js?v=2';
import { createFileCard, formatSize } from './files-card.js?v=2';

export { store };

const DIALOG_ID = 'files';
const GRID_ID = 'files-grid';
const SEARCH_ID = 'files-search';
const INFO_ID = 'files-info';
const NEW_BUTTON_ID = 'files-new';
const IMPORT_BUTTON_ID = 'files-import';
const ZIP_BUTTON_ID = 'files-zip';
const FILE_EXTENSION = '.qr';
const ZIP_NAME = 'qr-documents.zip';
const BLANK_KIND = 'blank';

/**
 * The open document as the editor reports it.
 * @typedef {Object} CurrentDocument
 * @property {string} id - its id in the store.
 * @property {string} name - its name.
 * @property {string} code - its QR document as it is in the editor.
 */

/**
 * What the editor hands to createFiles().
 * @typedef {Object} FilesOptions
 * @property {function(): CurrentDocument} getCurrent - the open document.
 * @property {function(string): void} open - opens a stored document by id.
 * @property {function(string): void} create - creates a document of a kind ("blank" for an empty one).
 * @property {function(string, string): void} rename - renames a document (id, new name).
 * @property {function(string): void} onRemove - called with the id of a deleted document.
 * @property {function(): void} importFile - lets the user choose a file to import.
 * @property {function(string): void} showToast - shows a short message.
 * @property {function(string): string} renderThumbnail - returns the SVG of a QR document for its card.
 */

/**
 * What createFiles() gives back to the editor.
 * @typedef {Object} FilesDialog
 * @property {function(): void} open - opens the dialog with the open document in focus.
 * @property {function(): void} render - shows the list again when the dialog is open.
 */

/**
 * Sets up the dialog "My documents". Like every initializeX, it sets up an area and returns its API.
 * @param {FilesOptions} options - the editor's functions the dialog uses.
 * @returns {FilesDialog} open and render.
 */
export function createFiles(options) {
    const { getCurrent, showToast } = options;
    const dialog = document.getElementById(DIALOG_ID);
    const grid = document.getElementById(GRID_ID);
    const search = document.getElementById(SEARCH_ID);
    const info = document.getElementById(INFO_ID);

    grid.addEventListener('click', handleGridClick);
    search.addEventListener('input', renderList);
    document.getElementById(NEW_BUTTON_ID).addEventListener('click', () => { dialog.close(); options.create(BLANK_KIND); });
    document.getElementById(IMPORT_BUTTON_ID).addEventListener('click', () => { dialog.close(); options.importFile(); });
    document.getElementById(ZIP_BUTTON_ID).addEventListener('click', exportAllAsZip);
    addEventListener('storage', event => { if (event.key === LIST_KEY && dialog.open) renderList(); });
    return { open: openFilesDialog, render: renderIfOpen };

    /**
     * Opens the dialog with an empty search and the open document in focus.
     * @returns {void}
     */
    function openFilesDialog() {
        search.value = '';
        renderList();
        openDialog(dialog);
        grid.querySelector('.current .file-open')?.focus();
    }

    /**
     * Shows the list again, but only while the dialog is open.
     * @returns {void}
     */
    function renderIfOpen() {
        if (dialog.open) renderList();
    }

    /**
     * Shows the cards of the documents that match the search, and their number and size.
     * @returns {void}
     */
    function renderList() {
        const current = getCurrent();
        const all = store.getSorted();
        const query = search.value.trim().toLowerCase();
        const shown = query ? all.filter(entry => entry.name.toLowerCase().includes(query)) : all;
        grid.replaceChildren(...shown.map(entry => createFileCard(entry, entry.id === current.id ? current.code : store.code(entry.id) || '', entry.id === current.id, options.renderThumbnail)));
        if (!shown.length) grid.append(createEmptyNote(query));
        const total = all.reduce((sum, entry) => sum + (entry.size || 0), 0);
        info.textContent = `${all.length} ${all.length === 1 ? 'document' : 'documents'} · ${formatSize(total)} in this browser`;
    }

    /**
     * Creates the note shown when no document matches or there is none.
     * @param {string} query - the search text, empty when there is none.
     * @returns {HTMLParagraphElement} the note.
     */
    function createEmptyNote(query) {
        const note = document.createElement('p');
        note.className = 'muted file-empty';
        note.textContent = query ? `No document named "${search.value.trim()}".` : 'No documents yet.';
        return note;
    }

    /**
     * Routes a click in the list to the action of the card: open, rename, duplicate, download or delete.
     * @param {MouseEvent} event - the click.
     * @returns {Promise<void>}
     */
    async function handleGridClick(event) {
        const card = event.target.closest('.file-card');
        if (!card) return;
        const id = card.dataset.id;
        const entry = store.getMeta(id);
        if (!entry) { renderList(); return; }
        const action = event.target.closest('[data-act]')?.dataset.act;
        if (!action && !event.target.closest('input')) openFromCard(id);
        else if (action === 'rename') startRename(card);
        else if (action === 'copy') copyStoredDocument(entry);
        else if (action === 'download') saveFile(getDocumentCode(id), `${getSafeFileName(entry.name)}${FILE_EXTENSION}`, 'text/plain');
        else if (action === 'delete') await removeStoredDocument(entry);
    }

    /**
     * Returns the code of a document: the editor's for the open one, the stored one for the others.
     * @param {string} id - the document's id.
     * @returns {string} its QR document, empty when it is missing.
     */
    function getDocumentCode(id) {
        return id === getCurrent().id ? getCurrent().code : store.code(id) || '';
    }

    /**
     * Closes the dialog and opens a document, unless it is the open one.
     * @param {string} id - the document's id.
     * @returns {void}
     */
    function openFromCard(id) {
        dialog.close();
        if (id !== getCurrent().id) options.open(id);
    }

    /**
     * Stores a copy of a document under the name "<name> copy" (or a free variant of it).
     * @param {import('./files-store.js').FileEntry} entry - the document's entry.
     * @returns {void}
     */
    function copyStoredDocument(entry) {
        try {
            store.create(store.getUniqueName(entry.name + ' copy'), getDocumentCode(entry.id));
            showToast(`"${entry.name}" duplicated`);
        } catch (error) { showToast('The browser storage is full - delete or download some documents first'); }
        renderList();
    }

    /**
     * Deletes a document after the user confirmed it, then shows the dialog again.
     * @param {import('./files-store.js').FileEntry} entry - the document's entry.
     * @returns {Promise<void>}
     */
    async function removeStoredDocument(entry) {
        const isConfirmed = await openConfirmation({
            title: `Delete "${entry.name}"?`,
            text: 'The document is removed from this browser for good. Download it first if you want to keep a copy.',
            ok: 'Delete',
        });
        openDialog(dialog);
        if (!isConfirmed) return;
        store.remove(entry.id);
        options.onRemove(entry.id);
        showToast(`"${entry.name}" deleted`);
        renderList();
    }

    /**
     * Shows a field in place of the name of a card; Enter or leaving the field renames, Escape keeps the name.
     * @param {HTMLLIElement} card - the card of the document.
     * @returns {void}
     */
    function startRename(card) {
        const id = card.dataset.id;
        const field = document.createElement('input');
        field.className = 'file-rename';
        field.value = store.getMeta(id)?.name || '';
        field.setAttribute('aria-label', 'New name');
        card.querySelector('.file-name').replaceWith(field);
        field.focus();
        field.select();
        let isFinished = false;
        /**
         * Ends the renaming once: renames when asked and the field is not empty, then shows the list again.
         * @param {boolean} isRenaming - true to take the new name, false to keep the name it has.
         * @returns {void}
         */
        const stopRename = isRenaming => {
            if (isFinished) return;
            isFinished = true;
            const newName = field.value.trim();
            if (isRenaming && newName) options.rename(id, store.getUniqueName(newName, id));
            renderList();
            grid.querySelector(`[data-id="${id}"] .file-open`)?.focus();
        };
        field.addEventListener('keydown', event => {
            if (event.key === 'Enter') { event.preventDefault(); stopRename(true); }
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopRename(false); }
        });
        field.addEventListener('blur', () => stopRename(true));
    }

    /**
     * Saves every document as one ZIP of .qr files; names that occur twice get -2, -3 ….
     * @returns {Promise<void>}
     */
    async function exportAllAsZip() {
        const current = getCurrent();
        const usedNames = new Set();
        const zipFiles = [];
        const entries = store.getSorted();
        for (const entry of entries) {
            let fileName = getSafeFileName(entry.name);
            for (let number = 2; usedNames.has(fileName.toLowerCase()); number++) fileName = `${getSafeFileName(entry.name)}-${number}`;
            usedNames.add(fileName.toLowerCase());
            zipFiles.push({ name: `${fileName}${FILE_EXTENSION}`, data: entry.id === current.id ? current.code : store.code(entry.id) || '' });
        }
        saveFile(await createZip(zipFiles), ZIP_NAME);
        showToast(`ZIP with ${entries.length} ${entries.length === 1 ? 'document' : 'documents'} downloaded`);
    }
}
