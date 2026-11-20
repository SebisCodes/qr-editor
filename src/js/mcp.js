/**
 * WebMCP: the editor offers its functions as tools to an AI agent that runs
 * in the browser (document.modelContext, in Chrome as an early preview).
 * The tools run in this page only - no server, no connector. Browsers
 * without WebMCP skip this. Every change is a normal undo step.
 * list_files, open_file and new_file reach the user's other documents.
 *
 * createWebMcp() runs these steps:
 *   1. find the browser's model context, or return null without WebMCP;
 *   2. give every tool its function, which notes the time of the call and tells the editor;
 *   3. register the tools; a tool the browser refuses is left out.
 * It returns { last() } (when an agent last used a tool, for the AI status in aistatus.js).
 */

/**
 * What a tool tells the agent about itself (the WebMCP tool definition without its function).
 * @typedef {Object} ToolDefinition
 * @property {string} name - the tool's name.
 * @property {string} description - what the tool does, for the agent.
 * @property {Object} inputSchema - the JSON schema of its parameters.
 * @property {Object} [annotations] - hints such as readOnlyHint.
 */

/**
 * A problem the editor found, as the tools list it.
 * @typedef {Object} EditorProblem
 * @property {number} line - the 1-based line of the document.
 * @property {string} kind - the kind of problem.
 * @property {string} msg - the message.
 */

/**
 * A stored document as list_files shows it.
 * @typedef {Object} FileSummary
 * @property {string} name - the document's name.
 * @property {number} updated - when it last changed (ms since the epoch).
 * @property {boolean} open - whether it is the open document.
 */

/**
 * What the editor hands to createWebMcp().
 * @typedef {Object} WebMcpOptions
 * @property {function(): void} [onUse] - called on each tool call.
 * @property {function(): {name: string, about: string, code: string}} getState - the open document and what the editor knows about it.
 * @property {function(): Array<EditorProblem>} getProblems - the problems of the open document.
 * @property {function(string): Promise<string>} setContent - sets the content of the code; resolves with the answer for the agent.
 * @property {function(string, string): Promise<string>} setDesign - sets one design key; resolves with the answer for the agent.
 * @property {function(): Promise<string>} checkScan - reads the drawn code back; resolves with the result.
 * @property {function(): Array<FileSummary>} getFiles - the stored documents, most recently changed first.
 * @property {function(string): boolean} openFile - opens a document by name; false when there is none.
 * @property {function(string, string): (string|false)} createFile - creates and opens a document; its name, or false when storage is full.
 * @property {function(string, string, Object): void} receiveDocument - loads a whole QR document into the open document.
 * @property {function(): void} undo - undoes the last change.
 */

/**
 * What createWebMcp() gives back.
 * @typedef {Object} WebMcpStatus
 * @property {function(): number} last - when an agent last called a tool (ms since the epoch), 0 for never.
 */

const NO_INPUT = { type: 'object', properties: {} };
const RECEIVE_MODE_REPLACE = 'replace';
const ISO_MINUTE_LENGTH = 16;            // "YYYY-MM-DDTHH:MM" of an ISO date

/** @type {Array<ToolDefinition>} the tools in the order they are registered. */
const TOOL_DEFINITIONS = [
    {
        name: 'get_document',
        description: 'Returns the QR document open in the editor: its name, the content type, version and error correction of the code, whether it scans, and the document (design lines "key: value", a line "---", then the content).',
        inputSchema: NO_INPUT,
        annotations: { readOnlyHint: true, untrustedContentHint: true },
    },
    {
        name: 'get_problems',
        description: 'Lists what the editor found: whether the code scans, contrast, quiet zone, a logo larger than the error correction can repair, content too long, and the checks of the content type (IBAN, references, missing fields).',
        inputSchema: NO_INPUT,
        annotations: { readOnlyHint: true },
    },
    {
        name: 'set_content',
        description: 'Sets what the QR code holds (everything after the "---" line), exactly as it goes into the code - e.g. "https://example.com", "WIFI:T:WPA;S:Guest;P:secret;;", a vCard, an EPC or Swiss QR bill payload. The design stays.',
        inputSchema: { type: 'object', properties: { content: { type: 'string', description: 'The content of the code.' } }, required: ['content'] },
    },
    {
        name: 'set_design',
        description: 'Sets one design key of the QR document, e.g. color "#1d2b53", modules "rounded", logo "wifi", ecc "H", caption "Scan me". An empty value removes the key (its default applies). Keys: ecc, boost, version, mask, margin, color, color2, gradient, angle, background, modules, eye-frame, eye-ball, eye-color, logo, logo-size, logo-clear, caption, caption-position, frame, frame-color.',
        inputSchema: {
            type: 'object',
            properties: { key: { type: 'string', description: 'The design key.' }, value: { type: 'string', description: 'The new value, or "" to remove the key.' } },
            required: ['key', 'value'],
        },
    },
    {
        name: 'set_document',
        description: 'Replaces the whole open QR document (design lines, "---", content). Keep the user\'s content and design unless asked otherwise.',
        inputSchema: { type: 'object', properties: { qr: { type: 'string', description: 'The complete QR document.' } }, required: ['qr'] },
    },
    {
        name: 'scan_check',
        description: 'Reads the drawn code back (normal, small, blurred) and says whether it scans and returns exactly the content.',
        inputSchema: NO_INPUT,
        annotations: { readOnlyHint: true },
    },
    {
        name: 'undo',
        description: 'Undoes the last change in the editor.',
        inputSchema: NO_INPUT,
    },
    {
        name: 'list_files',
        description: 'Lists the user\'s documents stored in the editor ("My documents"), most recently changed first, and which one is open.',
        inputSchema: NO_INPUT,
        annotations: { readOnlyHint: true, untrustedContentHint: true },
    },
    {
        name: 'open_file',
        description: 'Opens one of the user\'s documents by name; the other tools then work on it.',
        inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'The name from list_files.' } }, required: ['name'] },
    },
    {
        name: 'new_file',
        description: 'Creates a new QR document and opens it; the user\'s other documents stay unchanged.',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'A short name for the document.' }, qr: { type: 'string', description: 'Optional: the complete QR document, or only the content.' } },
            required: ['name'],
        },
    },
];

/**
 * Offers the editor's tools to a browser agent. Like every initializeX, it sets up an area and
 * returns its API.
 * @param {WebMcpOptions} options - the editor's functions the tools call.
 * @returns {WebMcpStatus|null} when an agent last used a tool, or null without WebMCP.
 */
export function createWebMcp(options) {
    const modelContext = document.modelContext || navigator.modelContext;
    if (!modelContext || typeof modelContext.registerTool !== 'function') return null;
    let lastCall = 0;
    const toolFunctions = createToolFunctions(options);
    for (const definition of TOOL_DEFINITIONS) addTool(modelContext, { ...definition, execute: createToolCall(toolFunctions[definition.name]) });
    return { last: getLastCall };

    /**
     * Wraps a tool's function so each call notes its time and tells the editor first.
     * @param {function(Object): Promise<string>} run - the tool's function.
     * @returns {function(...*): Promise<string>} the function the browser calls.
     */
    function createToolCall(run) {
        return async (...args) => { lastCall = Date.now(); options.onUse?.(); return run(...args); };
    }

    /**
     * Returns when an agent last called a tool.
     * @returns {number} ms since the epoch, 0 for never.
     */
    function getLastCall() {
        return lastCall;
    }
}

/**
 * Registers one tool; a tool the browser refuses, at once or later, is left out.
 * @param {Object} modelContext - the browser's model context.
 * @param {Object} tool - the tool definition with its execute function.
 * @returns {void}
 */
function addTool(modelContext, tool) {
    try {
        const registration = modelContext.registerTool(tool);
        if (registration && typeof registration.catch === 'function') registration.catch(() => { /* not available on this page */ });
    } catch (error) { /* the browser refused this tool */ }
}

/**
 * Creates the function of every tool, by tool name. Each is a one-line call of the editor or of
 * a step below; what the tool does is described in TOOL_DEFINITIONS.
 * @param {WebMcpOptions} editor - the editor's functions the tools call.
 * @returns {Object<string, function(Object): Promise<string>>} the functions by tool name.
 */
function createToolFunctions(editor) {
    return {
        get_document: async () => getDocumentText(editor),
        get_problems: async () => getProblemsText(editor),
        set_content: async ({ content }) => editor.setContent(String(content ?? '')),
        set_design: async ({ key, value }) => editor.setDesign(String(key || '').trim().toLowerCase(), String(value ?? '').trim()),
        set_document: async ({ qr }) => setWholeDocument(editor, qr),
        scan_check: async () => editor.checkScan(),
        undo: async () => { editor.undo(); return 'Undone.'; },
        list_files: async () => getFilesText(editor),
        open_file: async ({ name }) => openFileByName(editor, name),
        new_file: async ({ name, qr }) => createFileForAgent(editor, name, qr),
    };
}

/**
 * Returns the open document for get_document: its name, what the editor knows about it, and the document.
 * @param {WebMcpOptions} editor - the editor's functions.
 * @returns {string} the answer for the agent.
 */
function getDocumentText(editor) {
    const state = editor.getState();
    return `Document: "${state.name}"\n${state.about}\n\n${state.code}`;
}

/**
 * Returns the problems of the open document for get_problems, one per line.
 * @param {WebMcpOptions} editor - the editor's functions.
 * @returns {string} the answer for the agent.
 */
function getProblemsText(editor) {
    const problems = editor.getProblems();
    return problems.length ? problems.map(problem => `line ${problem.line} (${problem.kind}): ${problem.msg}`).join('\n') : 'No problems.';
}

/**
 * Replaces the whole open document for set_document; a command that returns the answer for
 * the agent, as the tool API dictates.
 * @param {WebMcpOptions} editor - the editor's functions.
 * @param {*} documentText - the complete QR document from the agent.
 * @returns {string} the answer for the agent.
 * @throws {Error} when the document is empty.
 */
function setWholeDocument(editor, documentText) {
    if (!String(documentText || '').trim()) throw new Error('The document is empty.');
    editor.receiveDocument(String(documentText), RECEIVE_MODE_REPLACE, { direct: true });
    const problemCount = editor.getProblems().length;
    return problemCount ? `Loaded, with ${problemCount} problem(s) - see get_problems.` : 'The document is in the editor.';
}

/**
 * Returns the stored documents for list_files: one line each, the open one marked with *.
 * @param {WebMcpOptions} editor - the editor's functions.
 * @returns {string} the answer for the agent.
 */
function getFilesText(editor) {
    return editor.getFiles().map(file => `${file.open ? '* ' : '  '}"${file.name}" (changed ${formatChangeTime(file.updated)})`).join('\n') + '\n(* = open now)';
}

/**
 * Returns a time as "YYYY-MM-DD HH:MM" in UTC.
 * @param {number} timestamp - ms since the epoch.
 * @returns {string} the date and time to the minute.
 */
function formatChangeTime(timestamp) {
    return new Date(timestamp).toISOString().slice(0, ISO_MINUTE_LENGTH).replace('T', ' ');
}

/**
 * Opens a stored document by name for open_file; a command that returns the answer for the
 * agent, as the tool API dictates.
 * @param {WebMcpOptions} editor - the editor's functions.
 * @param {string} name - the name from list_files.
 * @returns {string} the answer for the agent.
 * @throws {Error} when no document has this name.
 */
function openFileByName(editor, name) {
    if (!editor.openFile(name)) throw new Error(`No document "${name}" - call list_files.`);
    return `"${name}" is open.`;
}

/**
 * Creates and opens a document for new_file; a command that returns the answer for the agent,
 * as the tool API dictates.
 * @param {WebMcpOptions} editor - the editor's functions.
 * @param {string} name - a short name for the document.
 * @param {string} [documentText] - the complete QR document, or only the content.
 * @returns {string} the answer for the agent.
 * @throws {Error} when the browser storage is full.
 */
function createFileForAgent(editor, name, documentText) {
    const createdName = editor.createFile(name, documentText);
    if (!createdName) throw new Error('The browser storage is full.');
    return `New document "${createdName}" is open.`;
}
