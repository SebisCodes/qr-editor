/* Short messages at the bottom of the screen (the toast). */

import { ui } from './state.js?v=2';

/** How long a message stays on screen, in milliseconds. */
const TOAST_MS = 2800;

/** The timer that hides the message. */
let hideTimer = 0;

/**
 * Shows a short message for a few seconds; a new message replaces the one on screen.
 * @param {string} message - the text, already translated.
 * @returns {void}
 */
export function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('shown');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => ui.toast.classList.remove('shown'), TOAST_MS);
}
