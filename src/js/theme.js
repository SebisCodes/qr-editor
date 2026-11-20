/**
 * Color theme: light, dark or following the system setting (auto). Loaded as a
 * classic script in the page head so the chosen theme applies from the first paint.
 *
 * A page that embeds the editor can fix the theme with ?theme=light|dark|auto:
 * it holds for this page load, the stored choice stays as it is, and the theme
 * switch in the bar is hidden. Any other value is ignored.
 * The viewer (?viewer=1) runs on a storage in memory, set here before any other
 * script: stored documents are neither shown nor changed, nothing is stored.
 * The height of the top bar is kept in --header-height for the work area below it.
 * On the editor page (its script tag carries data-editor-page) it marks how the page is
 * opened, before the first paint: data-opened on the root, which sync.js reads,
 * and the classes embedded (inside a page that embeds the editor, and in the viewer) and
 * own-window (its own window opened by a page), which hide the way back to the overview and
 * the footer. The legal pages and the developer page load this file too and stay unmarked.
 *
 * Steps, while the script runs:
 *   1. keep the browser's storage, where the choice of theme is read from;
 *   2. read the address: how the page is opened, the viewer's storage in memory, a fixed theme;
 *   3. show the theme;
 *   4. once the page is parsed: show the theme on the switch, watch the height of the top bar,
 *      and hide the switch for a fixed theme or let it store the choice.
 */
(function () {
    var THEME_KEY = 'qreditor.theme';
    var root = document.documentElement;
    var HEADER_HEIGHT = '--header-height';
    var EDITOR_PAGE = 'data-editor-page';
    var OPENED = 'data-opened';
    var OPENED_IN_FRAME = 'frame';
    var OPENED_WITH_EMBED = 'embed';
    var OPENED_AS_WINDOW = 'window';
    var EMBED_PARAMETER = 'embed';
    var EMBED_IN_WINDOW = 'window';
    var VIEWER_PARAMETER = 'viewer';
    var VIEWER_ON = '1';
    var VIEWER_CLASS = 'viewer';
    var VIEWER_EMPTY_CLASS = 'viewer-empty';
    var DOCUMENT_IN_HASH = /^#.*=/;           // an address that carries a document after the #
    var EMBEDDED_CLASS = 'embedded';
    var OWN_WINDOW_CLASS = 'own-window';
    var THEME_PARAMETER = 'theme';
    var THEME_LIGHT = 'light';
    var THEME_DARK = 'dark';
    var THEME_AUTO = 'auto';
    var THEME_ATTRIBUTE = 'data-theme';
    var FIXED_THEME_ATTRIBUTE = 'data-theme-fixed';
    var THEME_BUTTON_ATTRIBUTE = 'data-theme-set';
    var THEME_BUTTON_SELECTOR = '[data-theme-set]';
    var THEME_SWITCH_SELECTOR = '.schema';
    var fixedTheme = null;
    var browserStorage = null;
    try { browserStorage = window.localStorage; } catch (error) { /* storage blocked */ }
    setAddressOptions();
    if (fixedTheme) root.setAttribute(FIXED_THEME_ATTRIBUTE, fixedTheme);

    showTheme(getTheme());
    document.addEventListener('DOMContentLoaded', handleDocumentReady);

    /**
     * Sets what the page's address asks for: how the editor page is opened, the viewer's
     * storage in memory and a theme fixed by the page. An address that cannot be read changes nothing.
     * @returns {void}
     */
    function setAddressOptions() {
        try {
            var query = new URLSearchParams(location.search);
            if (document.currentScript && document.currentScript.hasAttribute(EDITOR_PAGE)) setOpenedState(query);
            if (query.get(VIEWER_PARAMETER) === VIEWER_ON) startViewerStorage();
            var askedTheme = query.get(THEME_PARAMETER);
            if (askedTheme === THEME_LIGHT || askedTheme === THEME_DARK || askedTheme === THEME_AUTO) fixedTheme = askedTheme;
        } catch (error) { /* no parameters */ }
    }

    /**
     * Marks the viewer on the root and gives the page a storage in memory in place of localStorage.
     * @returns {void}
     */
    function startViewerStorage() {
        root.classList.add(VIEWER_CLASS);
        if (!DOCUMENT_IN_HASH.test(location.hash)) root.classList.add(VIEWER_EMPTY_CLASS);
        Object.defineProperty(window, 'localStorage', { configurable: true, value: createMemoryStorage() });
    }

    /**
     * Creates a storage with the methods of localStorage that keeps its values in memory only.
     * @returns {Storage} the storage; its values are gone when the page closes.
     */
    function createMemoryStorage() {
        var memory = new Map();
        return {
            /**
             * Returns the value stored under a key.
             * @param {string} key - the key.
             * @returns {string|null} the value, or null when there is none.
             */
            getItem: function (key) { return memory.has(String(key)) ? memory.get(String(key)) : null; },
            /**
             * Stores a value under a key.
             * @param {string} key - the key.
             * @param {string} value - the value; it is kept as text.
             * @returns {void}
             */
            setItem: function (key, value) { memory.set(String(key), String(value)); },
            /**
             * Removes the value of a key.
             * @param {string} key - the key.
             * @returns {void}
             */
            removeItem: function (key) { memory.delete(String(key)); },
            /**
             * Removes every value.
             * @returns {void}
             */
            clear: function () { memory.clear(); },
            /**
             * Returns the key at a position.
             * @param {number} index - the position, 0-based.
             * @returns {string|null} the key, or null past the end.
             */
            key: function (index) { return Array.from(memory.keys())[index] || null; },
            /**
             * Returns the number of stored values.
             * @returns {number} the number of keys.
             */
            get length() { return memory.size; },
        };
    }

    /**
     * Returns how the editor page is opened; sync.js takes "embed" and "window" from data-opened,
     * so both follow these conditions (the frame it checks itself, as window.parent).
     * @param {URLSearchParams} query - the parameters of the page's address.
     * @returns {string} "frame" inside an iframe, "embed" with ?embed= (any value but window),
     *   "window" as its own window opened by a page (?embed=window with an opener), "" as its own site.
     */
    function getOpenedAs(query) {
        if (window.parent !== window) return OPENED_IN_FRAME;
        if (query.get(EMBED_PARAMETER) === EMBED_IN_WINDOW) return window.opener ? OPENED_AS_WINDOW : '';
        return query.has(EMBED_PARAMETER) ? OPENED_WITH_EMBED : '';
    }

    /**
     * Sets how the editor page is opened: data-opened (only ever from the address and the window,
     * never from the HTML), the class embedded inside a page that embeds the editor and in the
     * viewer, own-window in its own window.
     * @param {URLSearchParams} query - the parameters of the page's address.
     * @returns {void}
     */
    function setOpenedState(query) {
        var openedAs = getOpenedAs(query);
        root.removeAttribute(OPENED);
        if (openedAs) root.setAttribute(OPENED, openedAs);
        if (openedAs === OPENED_IN_FRAME || openedAs === OPENED_WITH_EMBED || query.get(VIEWER_PARAMETER) === VIEWER_ON) root.classList.add(EMBEDDED_CLASS);
        if (openedAs === OPENED_AS_WINDOW) root.classList.add(OWN_WINDOW_CLASS);
    }

    /**
     * Returns the theme in force: the one the page fixed, else the stored choice, else auto.
     * @returns {string} "light", "dark" or "auto".
     */
    function getTheme() {
        if (fixedTheme) return fixedTheme;
        try { return browserStorage.getItem(THEME_KEY) || THEME_AUTO; } catch (error) { return THEME_AUTO; }
    }

    /**
     * Shows a theme on the page and marks its button in the theme switch.
     * @param {string} theme - "light", "dark" or "auto" (follows the system setting).
     * @returns {void}
     */
    function showTheme(theme) {
        if (theme === THEME_LIGHT || theme === THEME_DARK) root.setAttribute(THEME_ATTRIBUTE, theme);
        else root.removeAttribute(THEME_ATTRIBUTE);
        var buttons = document.querySelectorAll(THEME_BUTTON_SELECTOR);
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].setAttribute('aria-checked', String(buttons[i].getAttribute(THEME_BUTTON_ATTRIBUTE) === theme));
        }
    }

    /**
     * Runs once the page is parsed: shows the theme on the switch, watches the top bar, and
     * hides the switch for a fixed theme or lets it store the choice.
     * @returns {void}
     */
    function handleDocumentReady() {
        showTheme(getTheme());
        watchHeaderHeight();
        if (fixedTheme) { hideThemeSwitch(); return; }
        document.addEventListener('click', saveThemeOnClick);
    }

    /**
     * Keeps the height of the top bar in --header-height, so the work area fills the screen
     * below it whether the bar takes one row or more.
     * @returns {void}
     */
    function watchHeaderHeight() {
        var header = document.querySelector('.header');
        if (!header || !window.ResizeObserver) return;
        new ResizeObserver(function () {
            root.style.setProperty(HEADER_HEIGHT, Math.round(header.getBoundingClientRect().height) + 'px');
        }).observe(header);
    }

    /**
     * Hides the theme switch (its group, or each button outside a group) when the page fixed the theme.
     * @returns {void}
     */
    function hideThemeSwitch() {
        var buttons = document.querySelectorAll(THEME_BUTTON_SELECTOR);
        for (var i = 0; i < buttons.length; i++) (buttons[i].closest(THEME_SWITCH_SELECTOR) || buttons[i]).style.display = 'none';
    }

    /**
     * Stores and shows the theme of a clicked button of the theme switch.
     * @param {MouseEvent} event - a click anywhere in the page.
     * @returns {void}
     */
    function saveThemeOnClick(event) {
        var button = event.target.closest && event.target.closest(THEME_BUTTON_SELECTOR);
        if (!button) return;
        var theme = button.getAttribute(THEME_BUTTON_ATTRIBUTE);
        try { localStorage.setItem(THEME_KEY, theme); } catch (error) { /* without storage the choice lasts until the page is reloaded */ }
        showTheme(theme);
    }
})();
