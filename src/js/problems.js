/* The problem list above the code: the errors and warnings of the document
   with their lines (notes are only in the Check tab). A click on a problem
   selects its line in the code; the list can be folded. */

import { state, ui, escapeHtml } from './state.js?v=2';
import { translate } from './translate.js?v=2';
import { renderMarks, showLine } from './codeview.js?v=5';

/** At most this many problems are listed above the code. */
const MAX_LISTED = 60;

/**
 * Lets the problems be opened with the keyboard and the mouse, and the list be folded.
 * @returns {void}
 */
export function startProblems() {
    ui.problemBox.addEventListener('keydown', openProblemOnKey);
    ui.problemBox.addEventListener('click', handleProblemClick);
}

/**
 * Shows the errors and warnings above the code (and marks their lines), or hides the box without any.
 * @returns {void}
 */
export function renderProblems() {
    const problems = state.problems.filter(problem => problem.kind !== 'info');
    const box = ui.problemBox;
    renderMarks();
    if (!problems.length) { box.hidden = true; return; }
    const errors = problems.filter(problem => problem.kind === 'error').length;
    box.innerHTML = `<div class="pr-header"><span>${getProblemCounts(errors, problems.length - errors)}</span><button type="button" class="button small" data-toggle-probs>${state.showProblems ? translate('Hide') : translate('Show')}</button></div>${state.showProblems ? `<ul>${problems.slice(0, MAX_LISTED).map(renderProblemItem).join('')}</ul>` : ''}`;
    box.classList.toggle('only-warnings', !errors);
    box.hidden = false;
}

/**
 * Returns the heading of the problem list: the number of errors and of notes.
 * @param {number} errors - the number of errors.
 * @param {number} warnings - the number of warnings.
 * @returns {string} its HTML.
 */
function getProblemCounts(errors, warnings) {
    const parts = [];
    if (errors) parts.push(`<b>${errors} ${errors === 1 ? translate('error') : translate('errors')}</b>`);
    if (warnings) parts.push(`${warnings} ${warnings === 1 ? translate('note') : translate('notes')}`);
    return parts.join(' · ');
}

/**
 * Returns one problem of the list as a row that selects its line.
 * @param {import('./state.js').Problem} problem - the problem.
 * @returns {string} its HTML.
 */
function renderProblemItem(problem) {
    const isError = problem.kind === 'error';
    return `<li class="${isError ? 'err' : 'warn'}"><div class="pr-row" role="button" tabindex="0" data-line="${problem.line}"><span class="kind">${isError ? '✕' : '!'}</span><span class="line-number">${translate('Line')} ${problem.line + 1}</span><span>${escapeHtml(translate(problem.msg))}</span></div></li>`;
}

/**
 * Opens a problem with Enter or Space, as a button would.
 * @param {KeyboardEvent} event - the key on the problem list.
 * @returns {void}
 */
function openProblemOnKey(event) {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-line]')) { event.preventDefault(); event.target.click(); }
}

/**
 * Folds the list, or selects the line of the clicked problem (not while text in it is being selected).
 * @param {MouseEvent} event - the click on the problem list.
 * @returns {void}
 */
function handleProblemClick(event) {
    if (event.target.closest('[data-line]') && String(getSelection())) return;
    if (event.target.closest('[data-toggle-probs]')) { state.showProblems = !state.showProblems; renderProblems(); return; }
    const row = event.target.closest('[data-line]');
    if (row) showLine(+row.dataset.line);
}
