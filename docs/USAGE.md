# Using the QR Editor

The QR Editor makes static QR codes: the content is in the code itself, with no redirect and
no expiry date, so a code works as long as its content (for example the link) does. The
content and the design are one small text document; the code on the canvas is drawn from it,
checked by reading it back, and exported as SVG, PNG, JPEG, WebP, PDF or EPS. It also reads
QR codes from pictures and the camera, and makes many codes at once from a table.

Open it at https://qr.giit.ch/. It is free, needs no sign-up, and runs in your browser: your
documents stay there unless you send them somewhere yourself.

## What it can do

- Content types with a form each: link, text, WiFi, contact (vCard or MeCard), email, SMS,
  phone, location, calendar event, crypto payment (bitcoin, litecoin, dogecoin, ethereum),
  SEPA payment (EPC GiroCode) and Swiss QR bill.
- Design: colors and a linear or radial gradient, transparent background, seven module
  shapes, four eye frames and five eye balls with their own color, a built-in symbol or your
  own picture as logo, a caption above or below and a frame.
- A scan check after every change: the code is read back in the browser at normal size,
  small and blurred with less contrast; the badge above the code says whether it scans.
- Problems with their line: content too long, low contrast, light on dark, a quiet zone
  below 4 modules, a logo hiding more than the error correction repairs, unknown design
  keys, invalid values, and the checks of each content type (IBAN check digits, payment
  references, the WiFi password, link shorteners).
- Print size: from the scanning distance the smallest size, and the size of one module for a
  printed width.
- Reading codes from a picture (opened, dropped or pasted) or the camera.
- Many codes from a table at once.

## Getting started

1. **Choose** what the code holds under **New** or in the **Content** tab: a link, WiFi, a
   contact, an event, a payment … The form writes the content in the form phones read.
2. **Design** it in the **Design** tab, and look at the **Check** tab.
3. **Export** SVG, PDF or EPS for print, or PNG, JPEG or WebP.

The tabs **Content**, **Design** and **Check** are in the side panel. The button at the top right
of the work area opens it over the right of the QR code's stage, below the stage's bar, and closes
it again (Escape too); it is closed when the editor opens. On a phone it is the view **Edit**.

## The QR document

The code on the left is the whole QR document: optional design lines `key: value`, a line
`---`, then the content exactly as it goes into the code.

```
color: #1d2b53
modules: rounded
eye-frame: rounded
ecc: Q
caption: Guest WiFi
---
WIFI:T:WPA;S:Guest;P:sunny-day-42;;
```

Text without such a header is all content, so a pasted link is a valid document with the
default design. Lines starting with `#` in the header are comments. Unknown keys and invalid
values are kept and listed as problems, and the default is used instead. What the content is
(link, WiFi, contact …) is read from the content itself.

Design keys (all optional; default in brackets): `ecc` L, M, Q, H (M); `boost` yes, no
(yes); `version` auto or 1-40 (auto); `mask` auto or 0-7 (auto); `margin` 0-20 modules (4);
`color` (#000000); `color2` (none); `gradient` none, linear, radial (none); `angle` 0-360
(45); `background` a color or transparent (#ffffff); `modules` square, rounded, dots, soft,
diamond, bars-v, bars-h (square); `eye-frame` square, rounded, circle, leaf (square);
`eye-ball` square, rounded, circle, diamond, leaf (square); `eye-color` (the dark color);
`logo` none, a built-in symbol or a picture as a data URI (none); `logo-size` 5-30 percent
(20); `logo-clear` yes, no (yes); `caption` one line (none); `caption-position` below, above
(below); `frame` none, line, filled (none); `frame-color` (the dark color).

A Swiss QR bill is always drawn as its standard requires (black squares on white, error
correction M, the Swiss cross); design lines are then listed as ignored.

## Check

After every change the editor reads the drawn code back with a QR decoder in the browser, in
three conditions: normal, small and blurred with lowered contrast. The badge says "Scans -
read back exactly", "Scans only in good conditions" or "Does not scan". The **Check** tab
shows contrast, quiet zone, the logo against the error correction, and the print size. Codes
made by "Many codes from a table" are not scanned automatically.

## Reading codes

Open, drop or paste a picture (PNG, JPEG, GIF, WebP, BMP, SVG), or click **Read code** to
use the camera where the browser allows it. Light-on-dark codes are read too. The content
found becomes a new document. The picture and the camera image never leave the browser and
are not stored.

## Many codes from a table

**Export > Many codes from a table**: paste or open a CSV or TSV whose first row names the
columns, and write `{{column}}` in the content (also in the caption). The result is a ZIP
with one SVG or PNG per row (file names from a chosen column) or one PDF with one code per
page. Rows whose content does not fit are listed and left out. At most 5000 rows.

## Your documents

Your documents are kept only in your browser (in `localStorage`), not on a server, and stay
there after you close the page. **My documents** (the folder button at the top left) lists
every document of this browser: open, rename, duplicate, download (the `.qr` document; the
list shows a picture of each code) and delete them.

Clearing the browser's site data removes them, so download the ones you want to keep, or let
the editor send them to your own server: **Save to server** (the cloud button) sets up a
webhook, an address that gets every saved version (see [EMBEDDING.md](EMBEDDING.md#webhook)
for what it receives). Nothing is sent until you enter an address there.

**Opening files:** Open a `.qr` or text file with the button, by drop or by paste; a picture
with a QR code is read and its content becomes a new document.

## Export

**Export** offers **SVG**, **PNG** (64 to 8192 pixels, or a size in mm at a chosen dpi,
written into the file), **JPEG**, **WebP**, **PDF** and **EPS** (vectors, width in mm,
gradients as shadings), the content as text, the `.qr` document, or all of them in one ZIP;
**Copy** puts the code on the clipboard as a picture. SVG, PDF and EPS are scalable; a
picture logo and some PDF and EPS captions are embedded as pictures.

The download button in the bar and **Ctrl+S** (without a server) save the code as SVG. The
`.qr` document is downloaded in **My documents** and in **Export**.

## AI Assistant

Any AI can work with you: ChatGPT, Claude, Gemini, Copilot or the AI in your coding tool.
Nothing to install and no key needed. Click **AI Assistant**, then **Copy prompt**, paste it
into your AI and say what it should do. The prompt holds the instructions and the current
document.

The AI writes the complete QR document, or only the content.

The AI answers with a link that carries the document after the `#`; click it and the
document appears in your editor. **Undo** takes every change back. The links look like this:

- `https://qr.giit.ch/#b64=<base64url of the UTF-8 text>`
- `https://qr.giit.ch/#qr=<URL-encoded text>`
- `https://qr.giit.ch/#z=<base64url of the zlib-compressed text>` (shortest)
- `&file=new&name=<name>` makes a new document next to your others, `&file=<name>` changes
  that one; without `&file=` the open document changes.
- `&part=N&of=M&id=<name>` sends a long document in several links; the editor collects the
  parts.

A tab opened with such a link hands the document to the editor tab you used last. You can
also paste the AI's whole answer into the editor (Ctrl+V outside the code); links that a
terminal broke over several lines are joined. When the editor is embedded in another
website, links cannot reach it, so paste the answer there. A website that embeds the
editor may give its own instructions for how the AI answers, or show its own AI dialog
when you press the button; the dialog names the website and shows its instructions.

**Browser agents (WebMCP):** in browsers that offer WebMCP, the page registers tools for AI
agents that run in the page itself: `get_document`, `get_problems`, `set_content`,
`set_design`, `set_document`, `scan_check`, `undo`, and `list_files`, `open_file`,
`new_file` for your other documents. Every change is one step for Undo.

## Languages

The editor speaks English at `/`, German `/de/`, French `/fr/`, Italian `/it/`, Spanish
`/es/`, Portuguese `/pt/`, Dutch `/nl/`, Polish `/pl/`, Turkish `/tr/`, Russian `/ru/`,
Ukrainian `/uk/`, Chinese `/zh/`, Japanese `/ja/` and Korean `/ko/`. Opening
`https://qr.giit.ch/` leads to the language you picked before in a language menu, or else to
your browser's language. A language picked in the menu holds for every giit.ch site. The
prompt for the AI is always in English.

## Color theme

Light, dark or automatic (following your system): the theme switch in the bar sets it, and
the editor remembers your choice.

## Keyboard shortcuts

On macOS use Cmd instead of Ctrl. The **Help** dialog in the editor lists them as well.

| Keys | Action |
|---|---|
| Ctrl + Z / Y | Undo / redo |
| Ctrl + S | Save (download SVG, or to your server) |
| Ctrl + E | Export |
| Ctrl + O | My documents |
| Ctrl + V | Paste a picture with a QR code to read it |
| Alt + Z | Wrap long lines in the code |

## On your own website

The editor can be embedded in other websites with an iframe, opened in a window of its own
or used as a read-only viewer. See [EMBEDDING.md](EMBEDDING.md).
