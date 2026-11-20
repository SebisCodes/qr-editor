/**
 * Reading QR codes with the camera: the dialog asks the browser for the
 * camera only when it opens, reads the frames with jsQR in this page and
 * stops the camera when it closes. Nothing is recorded or sent.
 *
 * open() runs these steps:
 *   1. open the dialog and say that the camera starts;
 *   2. ask the browser for the camera (a request that arrives after the dialog closed is stopped at once);
 *   3. read the frames until one holds a QR code, then close the dialog and hand over its text.
 */

import { openDialog } from './dialogs.js?v=5';
import { readPixels } from './check.js?v=4';

const DIALOG_ID = 'scan';
const VIDEO_ID = 'scan-video';
const STATUS_ID = 'scan-status';
const PICTURE_BUTTON_ID = 'scan-picture';
const MAX_FRAME_SIDE = 900;              // frames are scaled down to this many pixels on their longer side
const FRAME_INTERVAL_MS = 120;
const HAVE_CURRENT_DATA = 2;             // HTMLMediaElement.readyState from which a frame can be drawn
const PERMISSION_DENIED = 'NotAllowedError';
const CAMERA_CONSTRAINTS = { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };

/**
 * What the editor hands to createScanner().
 * @typedef {Object} ScannerOptions
 * @property {function(string): void} [showToast] - shows a short message; the scanner reports in its own dialog and does not use it.
 * @property {function(string): string} translate - returns an on-screen text in the page's language.
 * @property {function(string): void} receiveText - takes the text of a code read from the camera.
 * @property {function(): void} pickPicture - lets the user choose a picture to read.
 */

/**
 * What createScanner() gives back to the editor.
 * @typedef {Object} Scanner
 * @property {function(): Promise<void>} open - opens the dialog and starts the camera.
 * @property {function(): void} stop - stops the camera.
 */

/**
 * Sets up the camera dialog. Like every initializeX, it sets up an area and returns its API.
 * @param {ScannerOptions} options - the editor's functions the scanner uses.
 * @param {function(string): string} options.translate - returns an on-screen text in the page's language.
 * @param {function(string): void} options.receiveText - takes the text of a code read from the camera.
 * @param {function(): void} options.pickPicture - lets the user choose a picture to read.
 * @returns {Scanner} open and stop.
 */
export function createScanner({ translate, receiveText, pickPicture }) {
    const dialog = document.getElementById(DIALOG_ID);
    const video = document.getElementById(VIDEO_ID);
    const status = document.getElementById(STATUS_ID);
    let stream = null, timer = 0, latestRequest = 0;   // latestRequest: the number of the latest camera request
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    dialog.addEventListener('close', stop);
    document.getElementById(PICTURE_BUTTON_ID).addEventListener('click', () => { dialog.close(); pickPicture(); });
    return { open, stop };

    /**
     * Opens the dialog and starts the camera, or says why there is none. A command that returns a
     * Promise so the caller can wait for the camera.
     * @returns {Promise<void>} settles when the camera runs or the reason is shown.
     */
    async function open() {
        status.textContent = translate('Starting the camera…');
        openDialog(dialog);
        if (!navigator.mediaDevices?.getUserMedia) { status.textContent = translate('This browser gives no camera to the page - choose a picture instead.'); return; }
        const request = ++latestRequest;
        try {
            await startCamera(request);
        } catch (error) {
            status.textContent = getCameraErrorText(error);
        }
    }

    /**
     * Asks the browser for the camera, shows its picture and starts reading frames.
     * A camera that arrives for an older request or after the dialog closed is stopped at once.
     * @param {number} request - the number of this camera request.
     * @returns {Promise<void>} settles when the camera runs (a command that returns a Promise so the caller can wait).
     * @throws {Error} when the browser refuses the camera or has none.
     */
    async function startCamera(request) {
        const mediaStream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if (request !== latestRequest || !dialog.open) { stopTracks(mediaStream); return; }
        if (stream) stopTracks(stream);
        stream = mediaStream;
        video.srcObject = stream;
        await video.play();
        status.textContent = translate('Hold the QR code in front of the camera.');
        readFrame();
    }

    /**
     * Returns the message for a camera that could not be started.
     * @param {Error} error - what getUserMedia() or play() threw.
     * @returns {string} the translated message.
     */
    function getCameraErrorText(error) {
        return error && error.name === PERMISSION_DENIED
            ? translate('The camera is not allowed - allow it in the browser (inside another website the page must allow it too), or choose a picture.')
            : translate('No camera found - choose a picture instead.');
    }

    /**
     * Reads the current frame; hands over the text of a code found in it, or tries again a little later.
     * @returns {void}
     */
    function readFrame() {
        if (!stream) return;
        if (video.readyState >= HAVE_CURRENT_DATA && video.videoWidth) {
            const result = readPixels(getFramePixels());
            if (result) { stop(); dialog.close(); receiveText(result.text); return; }
        }
        timer = setTimeout(readFrame, FRAME_INTERVAL_MS);
    }

    /**
     * Returns the pixels of the current frame, scaled down to at most MAX_FRAME_SIDE pixels on its
     * longer side (drawn on the scanner's own canvas, which nothing else reads).
     * @returns {ImageData} the pixels of the frame.
     */
    function getFramePixels() {
        const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return context.getImageData(0, 0, canvas.width, canvas.height);
    }

    /**
     * Stops the camera; a camera request still under way is stopped as soon as it arrives.
     * @returns {void}
     */
    function stop() {
        latestRequest++;
        clearTimeout(timer);
        if (stream) stopTracks(stream);
        stream = null;
        video.srcObject = null;
    }
}

/**
 * Stops every track of a camera stream.
 * @param {MediaStream} mediaStream - the stream to stop.
 * @returns {void}
 */
function stopTracks(mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
}
