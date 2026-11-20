/* The interface in the language of the page: app.js sets up the shared i18n.js
   once at start-up and hands its API over (setTranslation); every module then
   looks its on-screen texts up with translate(). The AI prompt stays English. */

/** The translation API of i18n.js, set by setTranslation. */
let i18n = null;

/**
 * Takes the translation API that app.js set up; runs once at start-up, before any text is shown.
 * @param {Object} i18nApi - the API of createI18n (translate, ready).
 * @returns {void}
 */
export function setTranslation(i18nApi) {
    i18n = i18nApi;
}

/**
 * Looks an English on-screen text up in the language pack of the page.
 * @param {string} text - the English text.
 * @returns {string} the text in the page's language.
 */
export function translate(text) {
    return i18n.translate(text);
}

/**
 * Returns the promise that settles when the language pack is loaded.
 * @returns {Promise<void>} settles when the texts can be translated.
 */
export function getTranslationReady() {
    return i18n.ready;
}
