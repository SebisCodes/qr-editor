/**
 * The modules of a layout (render.js createLayout): the data modules in the
 * shape of the design, the alignment patterns as whole rings and the finder
 * patterns (eyes). Sizes are in modules; ox / oy of the LayoutFrame is where
 * the modules start.
 */

import { createDiamondPath, createEllipsePath, createRoundedRectPath } from './shapes.js?v=2';

const FINDER_SIZE = 7;                  // a finder pattern is 7 x 7 modules
const ALIGNMENT_REACH = 2;              // an alignment pattern reaches 2 modules from its center
const BAR = { inset: 0.06, side: 0.1, thickness: 0.8, radius: 0.4 };
const DOT_RADIUS = 0.46;
const SOFT = { inset: 0.04, size: 0.92, radius: 0.3 };
const DIAMOND = { inset: 0.04, size: 1.08 };
const ROUND_CORNER = 0.5;

/**
 * The square of modules a logo clears, the same range on both axes.
 * @typedef {Object} ClearSquare
 * @property {number} a - the first module.
 * @property {number} b - the module after the last one.
 */

/**
 * Tells whether a module lies in a finder pattern.
 * @param {number} x - the column.
 * @param {number} y - the row.
 * @param {number} n - the modules per side.
 * @returns {boolean} true inside one of the three eyes.
 */
export function isFinder(x, y, n) {
    return (x < FINDER_SIZE && y < FINDER_SIZE) || (x >= n - FINDER_SIZE && y < FINDER_SIZE) || (x < FINDER_SIZE && y >= n - FINDER_SIZE);
}

/**
 * Tells whether a module lies in the cleared square.
 * @param {ClearSquare} clear - the cleared square.
 * @param {number} x - the column.
 * @param {number} y - the row.
 * @returns {boolean} true inside it.
 */
export function isInSquare(clear, x, y) {
    return x >= clear.a && x < clear.b && y >= clear.a && y < clear.b;
}

/**
 * Tells whether the logo hides a module (unless the design keeps the modules under the logo).
 * @param {LayoutFrame} frame - the frame of the layout.
 * @param {LogoArea} logoArea - the logo area.
 * @param {number} x - the column.
 * @param {number} y - the row.
 * @returns {boolean} true when the module is left out.
 */
function isHiddenByLogo(frame, logoArea, x, y) {
    return !!logoArea.logo && frame.design['logo-clear'] !== 'no' && isInSquare(logoArea.clear, x, y);
}

/**
 * Returns the centers of the alignment patterns that are drawn: not in an eye, not under the logo.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @param {LogoArea} logoArea - the logo area.
 * @returns {Array<Array<number>>} [column, row] of every center.
 */
export function getAlignmentCenters(frame, logoArea) {
    const { qr, n } = frame;
    const positions = qr.version > 1 ? qr.getAlignmentPatternPositions() : [];
    const centers = [];
    for (const y of positions) for (const x of positions) if (!isFinder(x, y, n) && !isHiddenByLogo(frame, logoArea, x, y)) centers.push([x, y]);
    return centers;
}

/**
 * Creates the test whether a module is drawn as a data module: dark, inside the code, not in an eye,
 * not under the logo and, for shapes other than square, not in an alignment pattern (those are drawn as rings).
 * @param {LayoutFrame} frame - the frame of the layout.
 * @param {LogoArea} logoArea - the logo area.
 * @param {Array<Array<number>>} alignments - the centers of the alignment patterns.
 * @returns {function(number, number): boolean} the test for a column and row.
 */
function createDarkTest(frame, logoArea, alignments) {
    const { qr, n, design } = frame;
    /**
     * Tells whether a module lies in a drawn alignment pattern (not for square modules).
     * @param {number} x - the column.
     * @param {number} y - the row.
     * @returns {boolean} true inside one.
     */
    const isInAlignment = (x, y) => design.modules !== 'square' && alignments.some(([ax, ay]) => Math.abs(x - ax) <= ALIGNMENT_REACH && Math.abs(y - ay) <= ALIGNMENT_REACH);
    return (x, y) => x >= 0 && y >= 0 && x < n && y < n && qr.getModule(x, y) && !isFinder(x, y, n) && !isHiddenByLogo(frame, logoArea, x, y) && !isInAlignment(x, y);
}

/**
 * Returns the data modules in the shape of the design, as one path.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @param {LogoArea} logoArea - the logo area.
 * @param {Array<Array<number>>} alignments - the centers of the alignment patterns.
 * @returns {Array<LayoutItem>} one path item, none when no module is drawn.
 */
export function createModuleItems(frame, logoArea, alignments) {
    const isDark = createDarkTest(frame, logoArea, alignments);
    const shape = frame.design.modules;
    let path;
    if (shape === 'square') path = createSquareModulesPath(frame, isDark);
    else if (shape === 'bars-h' || shape === 'bars-v') path = createBarModulesPath(frame, isDark, shape === 'bars-h');
    else path = createSingleModulesPath(frame, isDark, shape);
    return path.length ? [{ t: 'path', d: path, fill: frame.fillDark }] : [];
}

/**
 * Draws square modules: one rectangle per run of dark modules in a row, so no seams show between them.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @param {function(number, number): boolean} isDark - whether a module is drawn.
 * @returns {Path} the path.
 */
function createSquareModulesPath(frame, isDark) {
    const { n, ox, oy } = frame;
    const path = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (!isDark(x, y)) continue;
        let end = x;
        while (isDark(end + 1, y)) end++;
        path.push(['M', ox + x, oy + y], ['L', ox + end + 1, oy + y], ['L', ox + end + 1, oy + y + 1], ['L', ox + x, oy + y + 1], ['Z']);
        x = end;
    }
    return path;
}

/**
 * Draws modules as bars: one rounded bar per run of dark modules in a row or column.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @param {function(number, number): boolean} isDark - whether a module is drawn.
 * @param {boolean} isHorizontal - bars along the rows (true) or the columns (false).
 * @returns {Path} the path.
 */
function createBarModulesPath(frame, isDark, isHorizontal) {
    const { n, ox, oy } = frame;
    const path = [];
    /**
     * Tells whether a module is drawn, by line and place along it.
     * @param {number} line - the row of horizontal bars, the column of vertical ones.
     * @param {number} along - the place along that line.
     * @returns {boolean} true when the module is drawn.
     */
    const isDarkAt = (line, along) => (isHorizontal ? isDark(along, line) : isDark(line, along));
    for (let line = 0; line < n; line++) for (let along = 0; along < n; along++) {
        if (!isDarkAt(line, along)) continue;
        let end = along;
        while (isDarkAt(line, end + 1)) end++;
        const length = end - along + 1;
        path.push(...(isHorizontal
            ? createRoundedRectPath(ox + along + BAR.inset, oy + line + BAR.side, length - 2 * BAR.inset, BAR.thickness, BAR.radius)
            : createRoundedRectPath(ox + line + BAR.side, oy + along + BAR.inset, BAR.thickness, length - 2 * BAR.inset, BAR.radius)));
        along = end;
    }
    return path;
}

/**
 * Draws every dark module on its own: dots, soft squares, diamonds, or rounded (a corner is round
 * where neither neighbor beside it is dark).
 * @param {LayoutFrame} frame - the frame of the layout.
 * @param {function(number, number): boolean} isDark - whether a module is drawn.
 * @param {string} shape - "dots", "soft", "diamond", anything else is rounded.
 * @returns {Path} the path.
 */
function createSingleModulesPath(frame, isDark, shape) {
    const { n, ox, oy } = frame;
    const path = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (!isDark(x, y)) continue;
        const left = ox + x, top = oy + y;
        if (shape === 'dots') path.push(...createEllipsePath(left + 0.5, top + 0.5, DOT_RADIUS));
        else if (shape === 'soft') path.push(...createRoundedRectPath(left + SOFT.inset, top + SOFT.inset, SOFT.size, SOFT.size, SOFT.radius));
        else if (shape === 'diamond') path.push(...createDiamondPath(left - DIAMOND.inset, top - DIAMOND.inset, DIAMOND.size));
        else path.push(...createRoundedRectPath(left, top, 1, 1, getRoundCorners(isDark, x, y)));
    }
    return path;
}

/**
 * Returns the corner radii of a rounded module from its neighbors.
 * @param {function(number, number): boolean} isDark - whether a module is drawn.
 * @param {number} x - the column.
 * @param {number} y - the row.
 * @returns {Array<number>} top left, top right, bottom right, bottom left.
 */
function getRoundCorners(isDark, x, y) {
    const top = isDark(x, y - 1), right = isDark(x + 1, y), bottom = isDark(x, y + 1), left = isDark(x - 1, y);
    return [!top && !left ? ROUND_CORNER : 0, !top && !right ? ROUND_CORNER : 0, !bottom && !right ? ROUND_CORNER : 0, !bottom && !left ? ROUND_CORNER : 0];
}

/**
 * Returns the alignment patterns as whole rings with a dot, in the shape of the eyes, so every
 * reader finds them; square modules draw them as modules.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @param {Array<Array<number>>} alignments - the centers of the alignment patterns.
 * @returns {Array<LayoutItem>} the rings and the dots, or none.
 */
export function createAlignmentItems(frame, alignments) {
    const { design, ox, oy, fillDark } = frame;
    if (design.modules === 'square' || !alignments.length) return [];
    const ring = [], dot = [];
    const eyeFrame = design['eye-frame'], eyeBall = design['eye-ball'];
    for (const [ax, ay] of alignments) {
        const left = ox + ax - ALIGNMENT_REACH, top = oy + ay - ALIGNMENT_REACH;
        if (eyeFrame === 'circle') ring.push(...createEllipsePath(left + 2.5, top + 2.5, 2.5), ...createEllipsePath(left + 2.5, top + 2.5, 1.5));
        else if (eyeFrame === 'square') ring.push(...createRoundedRectPath(left, top, 5, 5, 0), ...createRoundedRectPath(left + 1, top + 1, 3, 3, 0));
        else ring.push(...createRoundedRectPath(left, top, 5, 5, 1.4), ...createRoundedRectPath(left + 1, top + 1, 3, 3, 0.6));
        dot.push(...(eyeBall === 'circle' || eyeFrame === 'circle'
            ? createEllipsePath(left + 2.5, top + 2.5, 0.55)
            : createRoundedRectPath(left + 2, top + 2, 1, 1, eyeBall === 'square' ? 0 : 0.3)));
    }
    return [{ t: 'path', d: ring, fill: fillDark, rule: 'evenodd' }, { t: 'path', d: dot, fill: fillDark }];
}

/**
 * Returns the three finder patterns (eyes): their rings and their balls, in the eye color.
 * @param {LayoutFrame} frame - the frame of the layout.
 * @returns {Array<LayoutItem>} the rings and the balls.
 */
export function createFinderItems(frame) {
    const { design, n, ox, oy, fillDark } = frame;
    const eyeFill = design['eye-color'] || fillDark;
    const corners = [[0, 0, 'tl'], [n - FINDER_SIZE, 0, 'tr'], [0, n - FINDER_SIZE, 'bl']];
    const ring = [], ball = [];
    for (const [column, row, corner] of corners) {
        ring.push(...createEyeRingPath(design['eye-frame'], ox + column, oy + row, corner));
        ball.push(...createEyeBallPath(design['eye-ball'], ox + column, oy + row, corner));
    }
    return [{ t: 'path', d: ring, fill: eyeFill, rule: 'evenodd' }, { t: 'path', d: ball, fill: eyeFill }];
}

/**
 * Returns the corner radii of a leaf: round at the corners away from the code's middle line.
 * @param {string} corner - "tl", "tr" or "bl".
 * @param {number} radius - the radius of the round corners.
 * @returns {Array<number>} top left, top right, bottom right, bottom left.
 */
function getLeafCorners(corner, radius) {
    return corner === 'tl' ? [radius, 0, radius, 0] : [0, radius, 0, radius];
}

/**
 * Returns the ring of an eye (7 x 7 with a hole of 5 x 5).
 * @param {string} shape - "rounded", "circle", "leaf", anything else is square.
 * @param {number} left - the left edge of the eye.
 * @param {number} top - the top edge of the eye.
 * @param {string} corner - "tl", "tr" or "bl".
 * @returns {Path} the outline and the hole.
 */
function createEyeRingPath(shape, left, top, corner) {
    switch (shape) {
    case 'rounded': return [...createRoundedRectPath(left, top, 7, 7, 2.2), ...createRoundedRectPath(left + 1, top + 1, 5, 5, 1.4)];
    case 'circle': return [...createEllipsePath(left + 3.5, top + 3.5, 3.5), ...createEllipsePath(left + 3.5, top + 3.5, 2.5)];
    case 'leaf': return [...createRoundedRectPath(left, top, 7, 7, getLeafCorners(corner, 3)), ...createRoundedRectPath(left + 1, top + 1, 5, 5, getLeafCorners(corner, 2))];
    default: return [...createRoundedRectPath(left, top, 7, 7, 0), ...createRoundedRectPath(left + 1, top + 1, 5, 5, 0)];
    }
}

/**
 * Returns the ball of an eye (3 x 3 in its middle).
 * @param {string} shape - "rounded", "circle", "diamond", "leaf", anything else is square.
 * @param {number} left - the left edge of the eye.
 * @param {number} top - the top edge of the eye.
 * @param {string} corner - "tl", "tr" or "bl".
 * @returns {Path} the ball.
 */
function createEyeBallPath(shape, left, top, corner) {
    switch (shape) {
    case 'rounded': return createRoundedRectPath(left + 2, top + 2, 3, 3, 0.9);
    case 'circle': return createEllipsePath(left + 3.5, top + 3.5, 1.5);
    case 'diamond': return createDiamondPath(left + 1.8, top + 1.8, 3.4);
    case 'leaf': return createRoundedRectPath(left + 2, top + 2, 3, 3, getLeafCorners(corner, 1.4));
    default: return createRoundedRectPath(left + 2, top + 2, 3, 3, 0);
    }
}
