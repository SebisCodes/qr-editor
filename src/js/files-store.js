/**
 * The store of "My documents": several documents kept in this browser
 * (localStorage), no server. qreditor.files holds the list
 * [{ id, name, created, updated, size }], qreditor.file.<id> the QR document of each.
 *
 * Documents from a page around the editor are kept in memory only: they are
 * in the list like the others but never written to the browser's storage,
 * and are gone when the editor closes.
 *
 * On import, an in-memory entry found in the stored list is removed with its
 * content, before anything reads the list.
 */

export const LIST_KEY = 'qreditor.files';
const FILE_KEY_PREFIX = 'qreditor.file.';
const DEFAULT_NAME = 'Document';
const MAX_NAME_LENGTH = 80;
const ID_RANDOM_START = 2;               // the random part of an id: characters 2 to 5 of a base-36 random number
const ID_RANDOM_END = 6;
const ID_RADIX = 36;
const NUMBER_AT_END = /\s+\d+$/;         // " 2" in "House 2"

/**
 * The entry of a document in the list.
 * @typedef {Object} FileEntry
 * @property {string} id - the document's id.
 * @property {string} name - its name, unique in the list (ignoring case).
 * @property {number} created - its creation time (ms since the epoch).
 * @property {number} updated - when its code last changed (ms since the epoch).
 * @property {number} [size] - the size of its code in bytes.
 * @property {boolean} [temp] - true for a document kept in memory only.
 * @property {string} [page] - the page around the editor the document comes from.
 * @property {Object} [hook] - the document's own webhook.
 */

/**
 * A document kept in memory only.
 * @typedef {Object} InMemoryDocument
 * @property {FileEntry} meta - its entry in the list.
 * @property {string} code - its QR document.
 */

/** @type {Map<string, InMemoryDocument>} the documents kept in memory only, by id. */
const inMemoryDocuments = new Map();

export const store = {
    /**
     * Returns the entries of the documents stored in this browser.
     * @returns {Array<FileEntry>} the stored entries; empty when the storage is blocked or damaged.
     */
    getSavedList() {
        try {
            const entries = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
            return Array.isArray(entries) ? entries.filter(entry => entry && entry.id && !entry.temp) : [];
        } catch (error) { return []; }
    },

    /**
     * Returns the entries of all documents: the stored ones, then the ones in memory. The name is
     * kept as it is because the maintainers' tests call it.
     * @returns {Array<FileEntry>} the entries.
     */
    list() {
        return [...this.getSavedList(), ...[...inMemoryDocuments.values()].map(inMemory => inMemory.meta)];
    },

    /**
     * Returns the entries of all documents, most recently changed first.
     * @returns {Array<FileEntry>} the sorted entries.
     */
    getSorted() {
        return this.list().sort((a, b) => b.updated - a.updated);
    },

    /**
     * Returns the entry of a document.
     * @param {string} id - the document's id.
     * @returns {FileEntry|null} the entry, or null when there is none.
     */
    getMeta(id) {
        return this.list().find(entry => entry.id === id) || null;
    },

    /**
     * Tells whether a document is kept in memory only.
     * @param {string} id - the document's id.
     * @returns {boolean} true for a document in memory.
     */
    isTemp(id) {
        return inMemoryDocuments.has(id);
    },

    /**
     * Returns the QR document of a document. The name is kept as it is because the maintainers'
     * tests call it.
     * @param {string} id - the document's id.
     * @returns {string|null} its code, or null when it is missing or the storage is blocked.
     */
    code(id) {
        if (inMemoryDocuments.has(id)) return inMemoryDocuments.get(id).code;
        try { return localStorage.getItem(FILE_KEY_PREFIX + id); } catch (error) { return null; }
    },

    /**
     * Writes the code and/or the name of a document; adds the document to the list when it is
     * missing (deleted in another tab meanwhile, for example).
     * @param {string} id - the document's id.
     * @param {Object} changes - what to write.
     * @param {string} [changes.name] - the new name.
     * @param {string} [changes.code] - the new code.
     * @returns {void}
     * @throws {Error} when the browser storage is full.
     */
    write(id, { name, code }) {
        const inMemory = inMemoryDocuments.get(id);
        if (inMemory) {
            if (code != null) { inMemory.code = code; setChanged(inMemory.meta, code); }
            if (name) inMemory.meta.name = name;
            return;
        }
        const entries = this.getSavedList();
        let entry = entries.find(saved => saved.id === id);
        if (!entry) { entry = { id, name: name || DEFAULT_NAME, created: Date.now(), updated: Date.now() }; entries.push(entry); }
        if (code != null) { localStorage.setItem(FILE_KEY_PREFIX + id, code); setChanged(entry, code); }
        if (name) entry.name = name;
        localStorage.setItem(LIST_KEY, JSON.stringify(entries));
    },

    /**
     * Sets other fields of a document's entry, such as its own webhook; a field set to null or
     * undefined is removed.
     * @param {string} id - the document's id.
     * @param {Object} fields - the fields to set.
     * @returns {void}
     * @throws {Error} when the browser storage is full.
     */
    setMeta(id, fields) {
        const inMemory = inMemoryDocuments.get(id);
        const entries = inMemory ? null : this.getSavedList();
        const entry = inMemory ? inMemory.meta : entries.find(saved => saved.id === id);
        if (!entry) return;
        for (const [field, value] of Object.entries(fields)) { if (value == null) delete entry[field]; else entry[field] = value; }
        if (entries) localStorage.setItem(LIST_KEY, JSON.stringify(entries));
    },

    /**
     * Creates a document under a name not yet taken, in memory only when asked (a page's
     * document). Returns the id of the new document, as a factory does.
     * @param {string} name - the wished name.
     * @param {string} [code] - its QR document.
     * @param {boolean} [inMemory] - keep it in memory only, never stored.
     * @returns {string} the id of the new document.
     * @throws {Error} when the browser storage is full.
     */
    create(name, code, inMemory = false) {
        const id = createDocumentId();
        if (inMemory) {
            const now = Date.now();
            inMemoryDocuments.set(id, { meta: { id, name: this.getUniqueName(name), created: now, updated: now, size: new Blob([code || '']).size, temp: true }, code: code || '' });
        } else this.write(id, { name: this.getUniqueName(name), code });
        return id;
    },

    /**
     * Removes a document and its code.
     * @param {string} id - the document's id.
     * @returns {void}
     */
    remove(id) {
        if (inMemoryDocuments.delete(id)) return;
        try {
            localStorage.removeItem(FILE_KEY_PREFIX + id);
            localStorage.setItem(LIST_KEY, JSON.stringify(this.getSavedList().filter(entry => entry.id !== id)));
        } catch (error) { /* storage blocked */ }
    },

    /**
     * Returns the document with this name, ignoring case and spaces around it.
     * @param {string} name - the name to look for.
     * @returns {FileEntry|null} the entry, or null when there is none.
     */
    findByName(name) {
        const wanted = String(name || '').trim().toLowerCase();
        return wanted ? this.list().find(entry => entry.name.trim().toLowerCase() === wanted) || null : null;
    },

    /**
     * Returns a name not yet taken: "House", or "House 2", "House 3" … when the name is taken.
     * @param {string} name - the wished name ("Document" when empty; at most 80 characters).
     * @param {string} [except] - the id of a document whose name does not count (the one being renamed).
     * @returns {string} the free name.
     */
    getUniqueName(name, except) {
        const base = String(name || DEFAULT_NAME).trim().slice(0, MAX_NAME_LENGTH) || DEFAULT_NAME;
        const taken = new Set(this.list().filter(entry => entry.id !== except).map(entry => entry.name.trim().toLowerCase()));
        if (!taken.has(base.toLowerCase())) return base;
        const stem = base.replace(NUMBER_AT_END, '');
        for (let number = 2; ; number++) if (!taken.has(`${stem} ${number}`.toLowerCase())) return `${stem} ${number}`;
    },
};

removeStoredInMemoryEntries();

/**
 * Returns a new document id: the time in base 36 and four random characters.
 * @returns {string} the id.
 */
function createDocumentId() {
    return Date.now().toString(ID_RADIX) + Math.random().toString(ID_RADIX).slice(ID_RANDOM_START, ID_RANDOM_END);
}

/**
 * Sets the change time of an entry to the current time, and the size of its new code.
 * @param {FileEntry} entry - the entry of the document.
 * @param {string} code - its new code.
 * @returns {void}
 */
function setChanged(entry, code) {
    entry.updated = Date.now();
    entry.size = new Blob([code]).size;
}

/**
 * Removes the entries of in-memory documents from the stored list, with their content: such an
 * entry never belongs in storage.
 * @returns {void}
 */
function removeStoredInMemoryEntries() {
    try {
        const entries = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
        if (!Array.isArray(entries) || !entries.some(entry => entry && entry.temp)) return;
        for (const entry of entries) {
            if (entry && entry.temp && entry.id) localStorage.removeItem(FILE_KEY_PREFIX + entry.id);
        }
        localStorage.setItem(LIST_KEY, JSON.stringify(entries.filter(entry => entry && !entry.temp)));
    } catch (error) { /* storage blocked */ }
}
