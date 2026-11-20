/* The side panel: Content (the type and its form, panel-content.js), Design
   (colors, shapes, logo, caption, error correction, panel-design.js) and Check
   (scan check, the code's data, contrast, print size, problems, panel-check.js).
   Every control writes into the document through the panel's functions
   (panel-actions.js); the panel is drawn again from the document after each
   change, except while the panel itself writes (a color dragged, a form typed in). */

import { startContentTab, renderContentTab, resetForm } from './panel-content.js?v=2';
import { startDesignTab, renderDesignTab } from './panel-design.js?v=3';
import { startCheckTab, renderCheckTab } from './panel-check.js?v=3';

/** The tab shown when no other is chosen. */
const DEFAULT_TAB = 'content';

/** The bodies of the tabs, by name. */
let bodies = {};

/** The tab shown. */
let currentTab = DEFAULT_TAB;

/** The panel's functions (see panel-actions.js). */
let actions = null;

/**
 * The functions the panel calls (panel-actions.js).
 * @typedef {Object} PanelActions
 * @property {function(): import('./state.js').EditorState} getState - the editor state.
 * @property {function(string, string, boolean=): void} setKey - sets a design key (merge: a continuous change).
 * @property {function(Object<string, string>): void} setKeys - sets several design keys in one step.
 * @property {function(string, boolean=, string=): void} setContent - sets the content (merge, message).
 * @property {function(): void} resetDesign - removes every design line.
 * @property {function(): void} openLogoChoice - opens the choice of a logo picture.
 * @property {function(number): void} showLine - selects a line in the code.
 * @property {function(): void} savePrint - stores the print sizes.
 * @property {function(string): void} writeReference - writes a payment reference ("qrr" or "scor").
 * @property {function(): boolean} isEditing - the panel itself is writing.
 */

/**
 * Sets up the side panel and its tabs.
 * @param {PanelActions} panelActions - what the panel may do.
 * @returns {{render: function(boolean=): void, showTab: function(string): void, getTab: function(): string, resetForm: function(): void}}
 *   the panel API.
 */
export function createPanel(panelActions) {
    actions = panelActions;
    bodies = { content: document.querySelector('#content-body'), design: document.querySelector('#design-body'), check: document.querySelector('#check-body') };
    document.querySelectorAll('[data-itab]').forEach(button => button.addEventListener('click', () => showTab(button.dataset.itab)));
    startContentTab(bodies.content, actions, renderPanel);
    startDesignTab(bodies.design, actions);
    startCheckTab(bodies.check, actions);
    return { render: renderUnlessEditing, showTab, getTab: () => currentTab, resetForm };
}

/**
 * Shows a tab (an unknown name shows Content) and draws it.
 * @param {string} name - "content", "design" or "check".
 * @returns {void}
 */
function showTab(name) {
    currentTab = bodies[name] ? name : DEFAULT_TAB;
    document.querySelectorAll('[data-itab]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.itab === currentTab)));
    for (const [tab, body] of Object.entries(bodies)) body.hidden = tab !== currentTab;
    renderPanel(true);
}

/**
 * Draws the tab shown.
 * @param {boolean} [force=false] - make the content form anew even while it is typed in.
 * @returns {void}
 */
function renderPanel(force = false) {
    const state = actions.getState();
    if (currentTab === 'content') renderContentTab(state, force);
    else if (currentTab === 'design') renderDesignTab(state);
    else renderCheckTab(state);
}

/**
 * Draws the tab shown after a change, but not while the panel itself writes (a color is dragged
 * or a field typed in), so the control in use stays as it is.
 * @param {boolean} [force=false] - make the content form anew even while it is typed in.
 * @returns {void}
 */
function renderUnlessEditing(force = false) {
    if (!actions.isEditing()) renderPanel(force);
}
