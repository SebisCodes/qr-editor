/**
 * Events as iCalendar VEVENT (RFC 5545): parseEvent() reads the fields from
 * the content, buildEvent() writes the content in the canonical form. Times
 * are local; the end of an all-day event is its last day in the fields and the
 * day after it in the content, as RFC 5545 counts it.
 */

import { escapeIcs, parseIcsText, splitLines } from './payload-text.js?v=2';

const FOLDED_LINE = /\r?\n[ \t]/g;                              // a line that goes on in the next one (RFC 5545 folding)
const ICS_DATE_TIME = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/;
const ALL_DAY_VALUE = /VALUE=DATE(?!-)/;
const ICS_DATE = /^\d{8}$/;
const MIDDAY = 'T12:00:00';                                     // a date at noon keeps its day when the time zone shifts it
const DATE_LENGTH = 10;                                         // YYYY-MM-DD
const DATE_TIME_LENGTH = 16;                                    // YYYY-MM-DDTHH:MM
const TIME_START = 11;                                          // the offset of HH:MM in YYYY-MM-DDTHH:MM

/**
 * The fields of an event.
 * @typedef {Object} EventFields
 * @property {string} title - the title.
 * @property {boolean} allday - whether the event lasts whole days.
 * @property {string} start - YYYY-MM-DD or YYYY-MM-DDTHH:MM in local time.
 * @property {string} end - the same form; for an all-day event the last day.
 * @property {string} location - the place.
 * @property {string} description - the description.
 */

/**
 * Reads an event: title, start, end, place and description; the end of an all-day event is its last day.
 * @param {string} content - the content BEGIN:VEVENT… or BEGIN:VCALENDAR….
 * @returns {EventFields} the fields.
 */
export function parseEvent(content) {
    const event = { title: '', allday: false, start: '', end: '', location: '', description: '' };
    for (const line of splitLines(content.replace(FOLDED_LINE, ''))) {
        const colon = line.indexOf(':');
        if (colon >= 0) setEventField(event, line.slice(0, colon).toUpperCase(), line.slice(colon + 1));
    }
    if (event.allday && event.end) event.end = getLastDay(event.end);
    return event;
}

/**
 * Sets the field of one iCalendar property of an event.
 * @param {EventFields} event - the fields being read.
 * @param {string} head - the property name with its parameters, in upper case.
 * @param {string} value - the value as written.
 * @returns {void}
 */
function setEventField(event, head, value) {
    const name = head.split(';')[0];
    if (name === 'SUMMARY') event.title = parseIcsText(value);
    else if (name === 'DTSTART') { event.start = parseIcsDateTime(value); event.allday = ALL_DAY_VALUE.test(head) || ICS_DATE.test(value.trim()); }
    else if (name === 'DTEND') event.end = parseIcsDateTime(value);
    else if (name === 'LOCATION') event.location = parseIcsText(value);
    else if (name === 'DESCRIPTION') event.description = parseIcsText(value);
}

/**
 * Reads an iCalendar date or date-time; a time in UTC (Z) is given in local time.
 * @param {string} value - YYYYMMDD, YYYYMMDDTHHMM(SS) or YYYYMMDDTHHMMSSZ.
 * @returns {string} YYYY-MM-DD or YYYY-MM-DDTHH:MM, '' when the value has another form.
 */
function parseIcsDateTime(value) {
    const match = ICS_DATE_TIME.exec(value.trim());
    if (!match) return '';
    const [, year, month, day, hour, minute, second, utc] = match;
    if (!hour) return `${year}-${month}-${day}`;
    if (!utc) return `${year}-${month}-${day}T${hour}:${minute}`;
    const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +(second || 0)));
    return `${date.getFullYear()}-${formatTwoDigits(date.getMonth() + 1)}-${formatTwoDigits(date.getDate())}T${formatTwoDigits(date.getHours())}:${formatTwoDigits(date.getMinutes())}`;
}

/**
 * Writes a number with at least two digits.
 * @param {number} number - the number.
 * @returns {string} the number, with a leading zero below 10.
 */
function formatTwoDigits(number) {
    return String(number).padStart(2, '0');
}

/**
 * Returns the last day of an all-day event from its DTEND, which is the day after it.
 * @param {string} end - the end as YYYY-MM-DD.
 * @returns {string} the previous day, or the end as written when that date does not exist.
 */
function getLastDay(end) {
    const date = new Date(end + MIDDAY);
    date.setDate(date.getDate() - 1);
    return Number.isNaN(date.getTime()) ? end : date.toISOString().slice(0, DATE_LENGTH);
}

/**
 * Writes an event as iCalendar VEVENT; an all-day event ends the day after its last day.
 * @param {EventFields} fields - the fields.
 * @returns {string} the content BEGIN:VEVENT….
 */
export function buildEvent(fields) {
    const out = ['BEGIN:VEVENT'];
    if (fields.title) out.push('SUMMARY:' + escapeIcs(fields.title));
    if (fields.allday) out.push(...getAllDayLines(fields));
    else {
        if (fields.start) out.push('DTSTART:' + formatIcsDateTime(fields.start));
        if (fields.end) out.push('DTEND:' + formatIcsDateTime(fields.end));
    }
    if (fields.location) out.push('LOCATION:' + escapeIcs(fields.location));
    if (fields.description) out.push('DESCRIPTION:' + escapeIcs(fields.description));
    out.push('END:VEVENT');
    return out.join('\n');
}

/**
 * Returns the DTSTART and DTEND lines of an all-day event.
 * @param {EventFields} fields - the fields.
 * @returns {Array<string>} the lines that apply.
 */
function getAllDayLines(fields) {
    const lines = [];
    if (fields.start) lines.push('DTSTART;VALUE=DATE:' + formatIcsDate(fields.start));
    const last = fields.end || fields.start;
    if (!last) return lines;
    const date = new Date(String(last).slice(0, DATE_LENGTH) + MIDDAY);
    date.setDate(date.getDate() + 1);
    lines.push('DTEND;VALUE=DATE:' + (Number.isNaN(date.getTime()) ? formatIcsDate(last) : date.toISOString().slice(0, DATE_LENGTH).replace(/-/g, '')));
    return lines;
}

/**
 * Writes the day of a date as iCalendar date.
 * @param {string} value - YYYY-MM-DD, with or without a time.
 * @returns {string} YYYYMMDD.
 */
function formatIcsDate(value) {
    return String(value || '').slice(0, DATE_LENGTH).replace(/-/g, '');
}

/**
 * Writes a date and time as iCalendar date-time in local time; a date alone gets midnight.
 * @param {string} value - YYYY-MM-DDTHH:MM or YYYY-MM-DD.
 * @returns {string} YYYYMMDDTHHMMSS.
 */
function formatIcsDateTime(value) {
    if (String(value || '').length >= DATE_TIME_LENGTH) return formatIcsDate(value) + 'T' + value.slice(TIME_START, DATE_TIME_LENGTH).replace(':', '') + '00';
    return formatIcsDate(value) + 'T000000';
}
