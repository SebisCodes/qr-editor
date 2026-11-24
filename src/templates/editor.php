<?php
/**
 * The editor page: markup and keys of the shared language packs (src/php/page.php).
 */
?>
<!DOCTYPE html>
<html <?= build_html_attributes() ?>>
<head>
<meta charset="utf-8">
<!-- The same policy as the server header (.htaccess), in case the header is ever missing; frame-ancestors only works as a header. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'self'; form-action 'self'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= get_text('title') ?></title>
<meta name="description" content="<?= get_text('description') ?>">
<meta name="author" content="Sebastian Grünwald, Grünwald Innovation">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#2c55c9">
<link rel="canonical" href="<?= escape_html(get_page_url()) ?>">
<?= build_hreflang_links() ?>
<meta property="og:type" content="website">
<meta property="og:locale" content="<?= get_page_locale() ?>">
<meta property="og:site_name" content="QR Editor">
<meta property="og:title" content="<?= get_text('og_title') ?>">
<meta property="og:description" content="<?= get_text('og_description') ?>">
<meta property="og:url" content="<?= escape_html(get_page_url()) ?>">
<meta property="og:image" content="https://qr.giit.ch/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/img/logo.svg">
<link rel="stylesheet" href="/css/style.css?v=10">
<script src="/js/lang-menu.js?v=1" defer></script>
<script src="/js/theme.js?v=7" data-editor-page></script>
<script type="application/ld+json"><?= get_json_ld('jsonld') ?></script>
</head>
<body>

<header class="header">
    <div class="header-brand">
        <a class="back-to-editors" href="<?= escape_html(get_site_url('https://editors.giit.ch/')) ?>" title="All giit editors" aria-label="All giit editors"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></a>
        <a class="brand" href="<?= escape_html(get_language_path(get_template_language(), '')) ?>" aria-label="QR Editor - home">
            <img src="/img/logo.svg" alt="" width="28" height="28">
            <h1>QR Editor <span>online</span></h1>
        </a>
        <a class="by-giit" href="https://giit.ch/"><img src="/img/giit.svg" alt="" width="16" height="18">by giit.ch</a>
    </div>
    <div class="toolbar file" role="toolbar" aria-label="File">
        <button type="button" class="button with-symbol file-button" id="btn-files" title="My documents (Ctrl+O)" aria-label="My documents"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span id="file-name" class="file-title" data-no-i18n></span><svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <span class="menu-anchor">
            <button type="button" class="button with-symbol" id="btn-new" title="New QR code" aria-haspopup="menu" aria-expanded="false" aria-controls="new-menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span class="txt">New</span></button>
            <span id="new-menu" class="menu" role="menu" aria-label="New" hidden>
                <button type="button" role="menuitem" data-new="link"><b>Link</b><span>A web address - opens the page</span></button>
                <button type="button" role="menuitem" data-new="wifi"><b>WiFi</b><span>Join the network without typing the password</span></button>
                <button type="button" role="menuitem" data-new="contact"><b>Contact</b><span>vCard or MeCard - saves name, phone and email</span></button>
                <button type="button" role="menuitem" data-new="event"><b>Event</b><span>Adds a date to the calendar</span></button>
                <button type="button" role="menuitem" data-new="email"><b>Email</b><span>Address, subject and text</span></button>
                <button type="button" role="menuitem" data-new="sms"><b>SMS</b><span>Number and message</span></button>
                <button type="button" role="menuitem" data-new="phone"><b>Phone</b><span>Calls a number</span></button>
                <button type="button" role="menuitem" data-new="location"><b>Location</b><span>Opens a place in the map app</span></button>
                <button type="button" role="menuitem" data-new="epc"><b>SEPA payment</b><span>EPC GiroCode for banking apps in the euro area</span></button>
                <button type="button" role="menuitem" data-new="swiss"><b>Swiss QR bill</b><span>The QR code of a Swiss payment slip</span></button>
                <button type="button" role="menuitem" data-new="crypto"><b>Crypto payment</b><span>Bitcoin, Ethereum and others</span></button>
                <button type="button" role="menuitem" data-new="text"><b>Text</b><span>Any text</span></button>
                <button type="button" role="menuitem" data-new="example"><b>The welcome example</b><span>A designed WiFi code with logo and caption</span></button>
            </span>
        </span>
        <button type="button" class="button" id="btn-open" title="Open a .qr file, or read a QR code from a picture (you can also drag it into the window or paste it)">Open file…</button>
        <input type="file" id="file" accept=".qr,.txt,text/plain,image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml" multiple hidden>
        <button type="button" class="button with-symbol" id="btn-scan" title="Read a QR code with the camera"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/></svg><span class="txt">Read code</span></button>
        <span class="divider" aria-hidden="true"></span>
        <button type="button" class="button with-symbol" id="btn-undo" title="Undo the last change (Ctrl+Z)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg><span class="txt">Undo</span></button>
        <button type="button" class="button with-symbol" id="btn-redo" title="Redo the change you just undid (Ctrl+Y)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg><span class="txt">Redo</span></button>
    </div>
    <div class="toolbar output" role="toolbar" aria-label="Output">
        <span class="languages" data-languages><?= build_language_menu(get_text('language')) ?></span>
        <div class="schema" role="radiogroup" aria-label="Color theme">
            <button type="button" role="radio" data-theme-set="light" aria-checked="false" title="Light theme" aria-label="Light theme"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
            <button type="button" role="radio" data-theme-set="dark" aria-checked="false" title="Dark theme" aria-label="Dark theme"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg></button>
            <button type="button" role="radio" data-theme-set="auto" aria-checked="true" title="Same as your system setting" aria-label="Automatic theme (system setting)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></button>
        </div>
        <button type="button" class="button with-symbol ai-button" id="btn-ai" title="Let any AI write in this editor"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.9L19 9.5l-5.2 1.7L12 16l-1.8-4.8L5 9.5l5.2-1.6z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg><span class="txt">AI Assistant</span></button>
        <button type="button" class="button symbol" id="btn-sync" title="Save to your own server and embed the editor in your website" aria-label="Save to server"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5"/><path d="M12 12v8m-3-3 3 3 3-3"/></svg></button>
        <button type="button" class="button" id="btn-help" title="How it works and keyboard shortcuts (?)">Help</button>
        <button type="button" class="button" id="btn-download" title="Save the QR code as an SVG picture (Ctrl+S)">Download SVG</button>
        <button type="button" class="button primary save" id="btn-save" hidden>Save</button>
        <button type="button" class="button primary" id="btn-export" title="SVG, PNG, PDF, EPS, many codes from a table (Ctrl+E)">Export…</button>
    </div>
</header>

<nav class="views" role="tablist" aria-label="View">
    <button type="button" role="tab" data-pane="code" aria-selected="false">Code</button>
    <button type="button" role="tab" data-pane="drawing" aria-selected="true">QR code</button>
    <button type="button" role="tab" data-pane="properties" aria-selected="false">Edit</button>
</nav>

<main id="work" class="workspace" data-show="drawing">
    <section class="pane code-pane" aria-label="QR document">
        <div class="pane-header">
            <b>Code</b>
            <span id="code-status" class="muted"></span>
            <span class="right">
                <button type="button" class="button small" id="btn-wrap" aria-pressed="false" title="Wrap long lines in the view - each line of the code stays one line (Alt+Z)">Wrap</button>
                <button type="button" class="button small with-symbol" id="btn-copy" title="Copy the QR document to the clipboard" aria-label="Copy code"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg><span class="txt">Copy</span></button>
            </span>
        </div>
        <div id="code-error" class="error problems" hidden role="status"></div>
        <div class="editor">
            <div class="gutter" aria-hidden="true" data-no-i18n><div id="gutter"></div></div>
            <div class="code-field" id="code-layers">
                <div class="layer marks" id="marks" aria-hidden="true" data-no-i18n></div>
                <pre class="layer hl" id="hl" aria-hidden="true"></pre>
                <textarea id="code" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="QR document: design lines, a line ---, then the content"></textarea>
            </div>
        </div>
    </section>

    <div id="splitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="Drag to change the width of the code area" title="Drag to change the width" tabindex="0"></div>

    <section class="pane draw-pane" aria-label="QR code">
        <div class="pane-header qr-header">
            <button type="button" id="scan-badge" class="scan-badge" data-state="wait" title="Show the details of the scan check"><span class="dot" aria-hidden="true"></span><span id="scan-text">Checking…</span></button>
            <span id="qr-info" class="muted qr-info"></span>
        </div>
        <div class="stage qr-stage" id="stage">
            <div id="qr-view" class="qr-view" data-no-i18n></div>
            <p id="qr-empty" class="empty-hint" hidden>Type the content below the line --- in the code, or choose a type under Edit.</p>
        </div>
    </section>

    <button type="button" class="tool panel-toggle" id="btn-panel" aria-controls="side-panel" aria-expanded="false" title="Show or hide the side panel" aria-label="Side panel"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg></button>

    <aside class="pane inspector" id="side-panel" aria-label="Edit">
        <div class="pane-header tabs" role="tablist">
            <button type="button" role="tab" data-itab="content" aria-selected="true" title="What the code holds: link, WiFi, contact, payment …">Content</button>
            <button type="button" role="tab" data-itab="design" aria-selected="false" title="Colors, shapes, logo, caption and frame">Design</button>
            <button type="button" role="tab" data-itab="check" aria-selected="false" title="Scan check, contrast, print size">Check</button>
        </div>
        <div id="content-body" class="inspector-body"></div>
        <div id="design-body" class="inspector-body" hidden></div>
        <div id="check-body" class="inspector-body" hidden></div>
    </aside>
</main>

<div id="ai-receive" class="receive" role="status" hidden>
    <div class="receive-box"><img src="/img/logo.svg" alt="" width="40" height="40"><h2></h2><p></p>
        <div class="receive-buttons"><button type="button" class="button primary" data-here>Open it here</button></div>
    </div>
</div>

<div id="toast" class="toast" role="status" aria-live="polite"></div>
<div class="storage-hint" aria-hidden="true"><span>Drop a .qr file or a picture with a QR code here</span></div>

<dialog id="export" class="dialog" aria-labelledby="ex-title">
    <form method="dialog" class="dialog-header"><h2 id="ex-title">Export</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <div class="ex-row">
            <label class="field"><span>File name</span><input id="ex-name" spellcheck="false"></label>
            <label class="field"><span>Format</span>
                <select id="ex-format">
                    <optgroup label="Vector (print, any size)">
                        <option value="svg">SVG picture</option>
                        <option value="pdf">PDF</option>
                        <option value="eps">EPS (for print shops)</option>
                    </optgroup>
                    <optgroup label="Picture">
                        <option value="png">PNG</option>
                        <option value="jpeg">JPEG</option>
                        <option value="webp">WebP</option>
                    </optgroup>
                    <optgroup label="Text">
                        <option value="txt">The content as text</option>
                        <option value="qr">QR document (.qr)</option>
                    </optgroup>
                    <optgroup label="Many codes">
                        <option value="batch">Many codes from a table</option>
                    </optgroup>
                </select>
            </label>
        </div>
        <div class="ex-row ex-size only-picture">
            <label class="field"><span>Width in pixels</span><input id="ex-px" type="number" min="64" max="8192" step="1" value="1024" inputmode="numeric"></label>
            <label class="field"><span>Resolution (dpi)</span><input id="ex-dpi" type="number" min="72" max="1200" step="1" value="300" inputmode="numeric"></label>
        </div>
        <div class="ex-row ex-size only-measure">
            <label class="field"><span>Width in mm</span><input id="ex-mm" type="number" min="5" max="2000" step="0.5" value="50" inputmode="decimal"></label>
            <p class="muted ex-measure-info" id="ex-measure-info"></p>
        </div>
        <div class="ex-batch only-batch">
            <div class="ex-row">
                <label class="field"><span>Each code as</span>
                    <select id="ex-batch-format"><option value="svg">SVG files in a ZIP</option><option value="png">PNG files in a ZIP</option><option value="pdf">One PDF, one code per page</option></select>
                </label>
                <label class="field"><span>File names from</span><select id="ex-batch-name"></select></label>
            </div>
            <label class="field"><span>Table (CSV or TSV, first row = column names)</span><textarea id="ex-batch-csv" rows="5" spellcheck="false" placeholder="name,url&#10;Shop,https://example.com/shop&#10;Blog,https://example.com/blog" data-no-i18n></textarea></label>
            <div class="ex-batch-buttons"><button type="button" class="button small" id="ex-batch-open">Open a table…</button><input type="file" id="ex-batch-file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden><span id="ex-batch-info" class="muted"></span></div>
        </div>
        <textarea id="ex-text" class="ex-text" readonly spellcheck="false" aria-label="Result" data-no-i18n></textarea>
        <div class="dialog-footer">
            <span id="ex-info" class="muted"></span>
            <button type="button" class="button" id="ex-zip" title="SVG, PNG, PDF, EPS and the .qr document in one ZIP">All formats (ZIP)</button>
            <button type="button" class="button" id="ex-copy">Copy</button>
            <button type="button" class="button primary" id="ex-download">Download</button>
        </div>
    </div>
</dialog>

<dialog id="scan" class="dialog scan-dialog" aria-labelledby="scan-title">
    <form method="dialog" class="dialog-header"><h2 id="scan-title">Read a QR code</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <div class="scan-picture"><video id="scan-video" playsinline muted></video><span class="scan-frame" aria-hidden="true"></span></div>
        <p id="scan-status" class="muted scan-status" role="status">Starting the camera…</p>
        <p class="muted">The camera image is read in your browser only - nothing is recorded or sent.</p>
        <div class="dialog-footer"><span class="muted"></span><button type="button" class="button" id="scan-picture">Choose a picture…</button></div>
    </div>
</dialog>

<dialog id="files" class="dialog files" aria-labelledby="files-title">
    <form method="dialog" class="dialog-header"><h2 id="files-title">My documents</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <div class="files-toolbar">
            <input id="files-search" type="search" placeholder="Search by name" aria-label="Search your documents" spellcheck="false">
            <button type="button" class="button" id="files-import" title="Open a .qr file or a picture with a QR code as a new document">Open file…</button>
            <button type="button" class="button primary" id="files-new">New document</button>
        </div>
        <ul id="files-grid" class="file-grid"></ul>
        <p class="muted">Click a document to open it. They are stored only in this browser - nothing is uploaded. Clearing the browser's site data removes them, so download the ones you want to keep.</p>
        <div class="dialog-footer"><span id="files-info" class="muted"></span><button type="button" class="button" id="files-zip" title="Download every document as a .qr file in one ZIP">Download all (ZIP)</button></div>
    </div>
</dialog>

<dialog id="ask" class="dialog question" aria-labelledby="ask-title">
    <div class="dialog-header"><h2 id="ask-title"></h2></div>
    <div class="dialog-content"><p id="ask-text"></p>
        <div class="dialog-footer"><span class="muted"></span><button type="button" class="button" id="ask-cancel">Cancel</button><button type="button" class="button primary" id="ask-ok">OK</button></div>
    </div>
</dialog>

<dialog id="ai" class="dialog ai-dialog" aria-labelledby="ai-title">
    <form method="dialog" class="dialog-header"><h2 id="ai-title">AI Assistant</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <p>Any AI can work with you - ChatGPT, Claude, Gemini, Copilot.</p>
        <ul id="ai-status" class="ai-status" aria-label="Connected AI"></ul>
        <ol class="steps">
            <li>Click <b>Copy prompt</b>.</li>
            <li>Paste it into your AI and say what the code should hold or how it should look.</li>
            <li id="ai-step-link">The AI answers with a link: click it, or paste the whole answer below. <b>Undo</b> takes it back.</li>
        </ol>
        <div id="ai-remote" class="ai-remote" hidden>
            <p><b>Connected to <span id="ai-remote-host" data-no-i18n></span>:</b> the AI sends its result there, and it opens here. <span id="ai-key-exp" class="muted"></span></p>
            <details id="ai-remote-details" hidden><summary>What <span data-no-i18n></span> tells the AI</summary><pre id="ai-remote-prompt" class="ai-remote-prompt" data-no-i18n></pre></details>
        </div>
        <fieldset class="ai-target">
            <legend>The AI should</legend>
            <label><input type="radio" name="ai-target" value="change" checked><span><b>Change “<span id="ai-cur" data-no-i18n></span>”</b></span></label>
            <label><input type="radio" name="ai-target" value="new"><span><b>Make a new document</b></span></label>
        </fieldset>
        <label class="field ai-insert"><span id="ai-paste-label">The AI's answer (or press Ctrl+V anywhere):</span><textarea id="ai-paste" rows="2" spellcheck="false" placeholder="https://qr.giit.ch/#…"></textarea></label>
        <p class="muted" id="ai-privacy">The QR document travels in the link after the “#”, which no server sees. What you paste into your AI is handled by its provider.</p>
        <textarea id="ai-prompt-text" class="ai-prompt-text" rows="6" readonly hidden aria-label="The prompt - copy it with Ctrl+C"></textarea>
        <div class="dialog-footer"><span class="muted"></span><button type="button" class="button primary" id="ai-copy">Copy prompt</button></div>
    </div>
</dialog>

<dialog id="sync" class="dialog" aria-labelledby="sync-title">
    <form method="dialog" class="dialog-header"><h2 id="sync-title">Save to your server</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <p>The editor can send each saved version to your own server (a <b>webhook</b>), so your work is kept where you want it. Nothing is sent until you enter an address here.</p>
        <div class="sync-fields">
            <label class="field"><span>Webhook address</span><input id="sync-url" type="url" placeholder="https://example.com/api/qr" spellcheck="false" autocomplete="off"></label>
            <label class="field"><span>Token <small>(optional, sent as "Authorization: Bearer …"; kept until this tab is closed)</small></span><input id="sync-token" type="password" spellcheck="false" autocomplete="off"></label>
        </div>
        <label class="box sync-choice"><input type="checkbox" id="sync-auto"> Send automatically a few seconds after each change (otherwise only when you click <b>Save</b> or press Ctrl+S)</label>
        <label class="box sync-choice"><input type="checkbox" id="sync-doc"> Only for “<span id="sync-docname" data-no-i18n></span>” (other documents use the general address)</label>
        <details class="sync-help">
            <summary>What your server receives</summary>
            <p class="muted">A POST request with JSON (your server must allow CORS from https://qr.giit.ch):</p>
            <pre class="code-example">{ "editor": "qr", "event": "save", "id": "…", "name": "Guest WiFi",
  "content": "color: #1d2b53\n---\nWIFI:T:WPA;S:Guest;P:sunny-day-42;;",
  "updated": "2026-01-15T09:30:00.000Z" }</pre>
        </details>
        <details class="sync-help">
            <summary>Embed the editor in your website</summary>
            <pre class="code-example">&lt;iframe src="https://qr.giit.ch/?embed=1" allow="clipboard-write; camera" style="width:100%;height:80vh;border:0"&gt;&lt;/iframe&gt;
&lt;script&gt;
const frame = document.querySelector('iframe');
addEventListener('message', e =&gt; {
  if (e.origin !== 'https://qr.giit.ch' || e.source !== frame.contentWindow) return;
  if (e.data.type === 'qreditor:ready')
    frame.contentWindow.postMessage({ type: 'qreditor:load', name: 'Shop',
      content: 'https://example.com/shop' }, 'https://qr.giit.ch');
  if (e.data.type === 'qreditor:save') saveOnYourServer(e.data.content);
});
&lt;/script&gt;</pre>
            <p class="muted">Also possible: <code>?src=&lt;URL of a .qr file&gt;</code> opens a file, <code>&amp;webhook=&lt;URL&gt;</code> saves this document there. The editor can also open in a window of its own (<code>?embed=window</code>), and your page can hand it its own AI prompt and a session key so the AI sends its result to your server (<code>qreditor:ai</code>, <code>qreditor:key-request</code>) - see "Use the editor on your own website" below the editor. Details are in <a href="/llms.txt">llms.txt</a>.</p>
        </details>
        <div class="dialog-footer"><span id="sync-status" class="muted"></span><button type="button" class="button" id="sync-test">Send now</button><button type="button" class="button primary" id="sync-ok">Save setting</button></div>
    </div>
</dialog>

<dialog id="help" class="dialog" aria-labelledby="help-title">
    <form method="dialog" class="dialog-header"><h2 id="help-title">Help</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content shortcuts">
        <h3>How it works</h3>
        <ol class="steps">
            <li><b>Choose what the code holds</b> under <b>New</b> or in the <b>Content</b> tab: a link, WiFi, a contact, an event, a payment … The form writes the content in the form phones read.</li>
            <li><b>Design it</b> in the <b>Design</b> tab: colors and gradient, the shape of the modules and of the three eyes, a logo, a caption and a frame.</li>
            <li>The <b>code</b> on the left is the whole QR document: design lines <code>key: value</code>, a line <code>---</code>, then the content exactly as it goes into the code. You can type there too; every change is one step for Undo.</li>
            <li><b>Check</b>: after every change the editor reads the code back - normal, small and blurred. The badge above the code says whether it scans; the <b>Check</b> tab shows contrast, quiet zone, the logo against the error correction and the print size.</li>
            <li>Click the <b>caption</b> under the code to change it right there.</li>
            <li><b>Export</b> makes SVG, PDF and EPS (vectors for print), PNG, JPEG or WebP up to 8192 pixels wide, and <b>many codes at once</b> from a table: write <code>{{column}}</code> in the content, paste the table, download a ZIP or one PDF.</li>
            <li><b>Read a code</b>: open, drop or paste a picture, or click <b>Read code</b> for the camera. The content becomes a new document.</li>
        </ol>
        <h3>Keyboard shortcuts</h3>
        <dl>
            <dt><kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Y</kbd></dt><dd>Undo / redo</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>S</kbd></dt><dd>Save (download SVG, or to your server)</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>E</kbd></dt><dd>Export</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>O</kbd></dt><dd>My documents</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>V</kbd></dt><dd>Paste a picture with a QR code to read it</dd>
            <dt><kbd data-no-i18n>Alt</kbd> + <kbd>Z</kbd></dt><dd>Wrap long lines in the code</dd>
        </dl>
    </div>
</dialog>

<div class="page-text">
<?= get_html('page_text') ?>
</div>

<?php include __DIR__ . '/footer.php'; ?>

<script type="module" src="/js/app.js?v=21"></script>
</body>
</html>
