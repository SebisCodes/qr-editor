/**
 * The shapes a drawn code is made of, as paths in module units: rectangles
 * with rounded corners, ellipses, diamonds, arcs and polygons, all as M / L /
 * C / Z commands so every output (canvas, SVG, PDF, EPS) can draw them. Also
 * the built-in logo symbols and the SVG path data of a path.
 */

const CIRCLE_KAPPA = 0.5522847498;      // the control point distance of a quarter circle as cubic Bézier
const DEGREES_PER_SEGMENT = 90;         // an arc is drawn with one Bézier per quarter circle at most
const NUMBER_PRECISION = 1000;          // numbers are written with up to three decimals

/**
 * One command of a path: the letter M, L, C or Z, then its coordinates.
 * @typedef {Array<(string|number)>} PathCommand
 */

/**
 * A path: a list of commands.
 * @typedef {Array<PathCommand>} Path
 */

/**
 * A rectangle with rounded corners.
 * @param {number} x - the left edge.
 * @param {number} y - the top edge.
 * @param {number} width - the width.
 * @param {number} height - the height.
 * @param {number|Array<number>} radius - the radius of every corner, or [top left, top right, bottom right, bottom left];
 *   a radius is at most half the width and height.
 * @returns {Path} the closed path, clockwise.
 */
export function createRoundedRectPath(x, y, width, height, radius) {
    const [topLeft, topRight, bottomRight, bottomLeft] = (Array.isArray(radius) ? radius : [radius, radius, radius, radius])
        .map(value => Math.max(0, Math.min(value, width / 2, height / 2)));
    const k = CIRCLE_KAPPA;
    const path = [['M', x + topLeft, y], ['L', x + width - topRight, y]];
    if (topRight) path.push(['C', x + width - topRight + topRight * k, y, x + width, y + topRight - topRight * k, x + width, y + topRight]);
    path.push(['L', x + width, y + height - bottomRight]);
    if (bottomRight) path.push(['C', x + width, y + height - bottomRight + bottomRight * k, x + width - bottomRight + bottomRight * k, y + height, x + width - bottomRight, y + height]);
    path.push(['L', x + bottomLeft, y + height]);
    if (bottomLeft) path.push(['C', x + bottomLeft - bottomLeft * k, y + height, x, y + height - bottomLeft + bottomLeft * k, x, y + height - bottomLeft]);
    path.push(['L', x, y + topLeft]);
    if (topLeft) path.push(['C', x, y + topLeft - topLeft * k, x + topLeft - topLeft * k, y, x + topLeft, y]);
    path.push(['Z']);
    return path;
}

/**
 * An ellipse, or a circle when both radii are the same.
 * @param {number} cx - the center, horizontally.
 * @param {number} cy - the center, vertically.
 * @param {number} radius - the vertical radius.
 * @param {number} [radiusX] - the horizontal radius, the same as radius when left out.
 * @returns {Path} the closed path.
 */
export function createEllipsePath(cx, cy, radius, radiusX = radius) {
    const k = CIRCLE_KAPPA;
    return [['M', cx + radiusX, cy], ['C', cx + radiusX, cy + radius * k, cx + radiusX * k, cy + radius, cx, cy + radius], ['C', cx - radiusX * k, cy + radius, cx - radiusX, cy + radius * k, cx - radiusX, cy],
        ['C', cx - radiusX, cy - radius * k, cx - radiusX * k, cy - radius, cx, cy - radius], ['C', cx + radiusX * k, cy - radius, cx + radiusX, cy - radius * k, cx + radiusX, cy], ['Z']];
}

/**
 * A square standing on a corner.
 * @param {number} x - the left edge of the square around it.
 * @param {number} y - the top edge of the square around it.
 * @param {number} size - the width and height.
 * @returns {Path} the closed path.
 */
export function createDiamondPath(x, y, size) {
    return [['M', x + size / 2, y], ['L', x + size, y + size / 2], ['L', x + size / 2, y + size], ['L', x, y + size / 2], ['Z']];
}

/**
 * An arc as cubic Béziers, one per quarter circle at most (angles in degrees, clockwise on screen).
 * @param {number} cx - the center, horizontally.
 * @param {number} cy - the center, vertically.
 * @param {number} radius - the radius.
 * @param {number} startAngle - where the arc starts.
 * @param {number} endAngle - where the arc ends.
 * @param {boolean} [isNewPart] - whether the arc starts with a move to its start (true) or goes on from the current point.
 * @returns {Path} the open path.
 */
export function createArcPath(cx, cy, radius, startAngle, endAngle, isNewPart = true) {
    const path = [];
    const segments = Math.ceil(Math.abs(endAngle - startAngle) / DEGREES_PER_SEGMENT);
    const step = (endAngle - startAngle) / segments * Math.PI / 180;
    let from = startAngle * Math.PI / 180;
    if (isNewPart) path.push(['M', cx + radius * Math.cos(from), cy + radius * Math.sin(from)]);
    for (let i = 0; i < segments; i++) {
        const to = from + step, handle = 4 / 3 * Math.tan(step / 4);
        path.push(['C', cx + radius * (Math.cos(from) - handle * Math.sin(from)), cy + radius * (Math.sin(from) + handle * Math.cos(from)),
            cx + radius * (Math.cos(to) + handle * Math.sin(to)), cy + radius * (Math.sin(to) - handle * Math.cos(to)), cx + radius * Math.cos(to), cy + radius * Math.sin(to)]);
        from = to;
    }
    return path;
}

/**
 * A line through points, closed or open.
 * @param {Array<number>} points - x and y of every point in turn.
 * @param {boolean} [isClosed] - whether the line goes back to its start.
 * @returns {Path} the path.
 */
export function createPolygonPath(points, isClosed = true) {
    return [['M', points[0], points[1]], ...Array.from({ length: points.length / 2 - 1 }, (_, i) => ['L', points[2 * i + 2], points[2 * i + 3]]), ...(isClosed ? [['Z']] : [])];
}

/**
 * Returns a path scaled and then moved.
 * @param {Path} path - the path.
 * @param {number} x - the horizontal shift.
 * @param {number} y - the vertical shift.
 * @param {number} scale - the factor of every coordinate.
 * @returns {Path} the new path (a Z command is shared with the old one).
 */
export function getPlacedPath(path, x, y, scale) {
    return path.map(command => (command[0] === 'Z' ? command : [command[0], ...command.slice(1).map((value, i) => (i % 2 ? y + value * scale : x + value * scale))]));
}

/**
 * Writes a number with up to three decimals, without trailing zeros.
 * @param {number} value - the number.
 * @returns {string} the number as text.
 */
export function formatNumber(value) {
    return (Math.round(value * NUMBER_PRECISION) / NUMBER_PRECISION).toString();
}

/**
 * Writes a path as SVG path data (also read by Path2D).
 * @param {Path} path - the path.
 * @returns {string} the path data, e.g. "M1 2L3 4Z".
 */
export function formatPathData(path) {
    return path.map(command => command[0] + (command.length > 1 ? command.slice(1).map(formatNumber).join(' ') : '')).join('');
}

/**
 * A built-in logo symbol on a 24 x 24 grid: lines drawn with a pen of width 2, and filled areas.
 * @typedef {Object} LogoSymbol
 * @property {Path} [stroke] - the lines.
 * @property {Path} [fill] - the filled areas.
 */

/**
 * The built-in logo symbols by name.
 * @type {Object<string, LogoSymbol>}
 */
export const SYMBOLS = {
    wifi: {
        stroke: [...createArcPath(12, 19, 13, -135, -45), ...createArcPath(12, 19, 8.5, -135, -45), ...createArcPath(12, 19, 4, -135, -45)],
        fill: createEllipsePath(12, 19, 1.8),
    },
    web: { stroke: [...createEllipsePath(12, 12, 9.5), ...createEllipsePath(12, 12, 9.5, 4), ['M', 2.5, 12], ['L', 21.5, 12]] },
    mail: { stroke: [...createRoundedRectPath(2.5, 5, 19, 14, 2.2), ...createPolygonPath([3, 6.5, 12, 13, 21, 6.5], false)] },
    phone: { stroke: [...createRoundedRectPath(6.5, 2, 11, 20, 2.4), ['M', 10.5, 18.5], ['L', 13.5, 18.5]] },
    chat: { stroke: [...createRoundedRectPath(2.5, 3.5, 19, 13, 3), ...createPolygonPath([7, 16.5, 5.5, 21, 11.5, 16.5], false)] },
    pin: { stroke: [...createArcPath(12, 9.5, 7, 150, 390), ['L', 12, 22], ['Z'], ...createEllipsePath(12, 9.5, 2.6)] },
    calendar: { stroke: [...createRoundedRectPath(3, 4.5, 18, 17, 2.2), ['M', 3, 10], ['L', 21, 10], ['M', 8, 2.5], ['L', 8, 6.5], ['M', 16, 2.5], ['L', 16, 6.5]] },
    user: { stroke: [...createEllipsePath(12, 8, 4.2), ['M', 4, 21.5], ['C', 4, 16.5, 7.5, 14, 12, 14], ['C', 16.5, 14, 20, 16.5, 20, 21.5]] },
    pay: { stroke: [...createRoundedRectPath(2, 5, 20, 14, 2.2), ['M', 2, 10], ['L', 22, 10], ['M', 6, 15], ['L', 10, 15]] },
    star: { fill: createPolygonPath([12, 1.8, 15, 8.4, 22.2, 9.2, 16.8, 14.1, 18.3, 21.3, 12, 17.7, 5.7, 21.3, 7.2, 14.1, 1.8, 9.2, 9, 8.4]) },
    heart: {
        fill: [['M', 12, 21], ['C', 5, 15.5, 2, 11.5, 2, 7.8], ['C', 2, 4.6, 4.5, 2.2, 7.5, 2.2], ['C', 9.5, 2.2, 11, 3.3, 12, 5.1], ['C', 13, 3.3, 14.5, 2.2, 16.5, 2.2],
            ['C', 19.5, 2.2, 22, 4.6, 22, 7.8], ['C', 22, 11.5, 19, 15.5, 12, 21], ['Z']],
    },
};
