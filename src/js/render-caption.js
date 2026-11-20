/**
 * The caption of a layout (render.js createLayout): it shrinks to fit the
 * width of the code; below 60 % of its size it goes on two lines, broken at
 * the space nearest the middle. getCaptionLayout() gives its lines, size and
 * the height of its band; createCaptionItems() the text items in that band.
 */

const LIGHT = '#ffffff';
const TRANSPARENT = 'transparent';
const CAPTION = {
    minFontSize: 2.2,                   // modules
    fontShare: 0.075,                   // of the code with its quiet zone
    sideSpace: 2,                       // modules the caption keeps free beside it
    letterWidth: 0.6,                   // the width of a letter in font sizes, when the text cannot be measured
    twoLineLimit: 0.6,                  // below this share of the font size a caption goes on two lines
    minShare: 0.3,                      // the smallest caption, as share of the font size
    oneLineBand: 1.8, twoLineBand: 2.4, twoLineGap: 0.5, frameGap: 0.3,
    lineHeight: 1.2,
    quietShare: 0.35,                   // a caption below a code without frame moves up into the quiet zone by this share
    weight: 700,
};

/**
 * The caption as it is laid out.
 * @typedef {Object} CaptionLayout
 * @property {Array<string>} lines - no, one or two lines.
 * @property {number} size - the font size.
 * @property {number} band - the height of the band of the caption.
 */

/**
 * Returns an estimate of a text's width when no measuring function is given.
 * @param {string} text - the text.
 * @param {number} size - the font size in module units.
 * @returns {number} the width in module units.
 */
function getEstimatedTextWidth(text, size) {
    return text.length * size * CAPTION.letterWidth;
}

/**
 * Lays out the caption: it shrinks to fit; below 60 % of its size it goes on two lines,
 * broken at the space nearest the middle.
 * @param {Design} design - the design (caption, frame).
 * @param {number} full - the code with its quiet zone, per side.
 * @param {boolean} isFramed - whether the code has a frame.
 * @param {function(string, number): number} [measureText] - the width of a text at a font size.
 * @returns {CaptionLayout} the lines, their size and the band.
 */
export function getCaptionLayout(design, full, isFramed, measureText) {
    const caption = String(design.caption || '').trim();
    const fontSize = Math.max(CAPTION.minFontSize, full * CAPTION.fontShare);
    const measure = measureText || getEstimatedTextWidth;
    const maxWidth = full - CAPTION.sideSpace;
    let lines = caption ? [caption] : [], size = fontSize;
    if (caption && measure(caption, fontSize) > maxWidth) {
        size = fontSize * maxWidth / measure(caption, fontSize);
        if (size < fontSize * CAPTION.twoLineLimit && caption.includes(' ')) {
            lines = splitCaption(caption);
            size = Math.min(fontSize, fontSize * maxWidth / Math.max(...lines.map(line => measure(line, fontSize))));
        }
        size = Math.max(fontSize * CAPTION.minShare, size);
    }
    const lineBand = lines.length === 2 ? size * CAPTION.twoLineBand + fontSize * CAPTION.twoLineGap : fontSize * CAPTION.oneLineBand;
    const band = caption ? lineBand + (isFramed ? fontSize * CAPTION.frameGap : 0) : 0;
    return { lines, size, band };
}

/**
 * Splits a caption into two lines at the space nearest its middle.
 * @param {string} caption - the caption with at least one space.
 * @returns {Array<string>} the two lines.
 */
function splitCaption(caption) {
    const middle = caption.length / 2, spaces = [...caption.matchAll(/ /g)].map(match => match.index);
    const at = spaces.reduce((best, index) => (Math.abs(index - middle) < Math.abs(best - middle) ? index : best));
    return [caption.slice(0, at), caption.slice(at + 1)];
}

/**
 * Returns the caption lines, centered in their band; on a filled frame they take the background color.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @param {CaptionLayout} caption - the caption.
 * @returns {Array<LayoutItem>} one text item per line.
 */
export function createCaptionItems(frame, caption) {
    if (!caption.lines.length) return [];
    const { design, isFramed, pad, full, width, isAbove, codeY, light, frameColor, margin } = frame;
    const { lines, size, band } = caption;
    const color = design.frame === 'filled' ? (light === TRANSPARENT ? LIGHT : light) : frameColor;
    const middle = isAbove
        ? pad + band / 2 + (isFramed ? -pad / 2 : 0)
        : codeY + full + (isFramed ? (band + pad) / 2 - pad / 2 : band / 2) - (isFramed ? 0 : margin * CAPTION.quietShare);
    const step = size * CAPTION.lineHeight;
    return lines.map((line, i) => ({ t: 'text', x: width / 2, y: middle + (i - (lines.length - 1) / 2) * step, size, text: line, fill: color, weight: CAPTION.weight }));
}
