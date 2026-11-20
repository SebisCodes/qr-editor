"""Browser test of the QR editor (Playwright, Google Chrome).

    php -S 127.0.0.1:8107 -t src src/php/router.php          (in the project folder)
    python tests/gui_test.py

Checks the document (design lines, ---, content), the code drawn from it and
read back (scan check), the Content, Design and Check tabs writing into the
code with one undo step each, the problems, editing the caption in place,
reading a code from a picture, every export format, many codes from a table,
AI links, WebMCP tools, My documents, the viewer and the phone layout."""

import base64
import io
import os
import struct
import sys
import urllib.parse
import zipfile

from playwright.sync_api import sync_playwright

URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8107/')
failures = []
FAKE_MCP = "window.tools = []; document.modelContext = { registerTool(t) { window.tools.push(t); } }; if (navigator.clipboard) navigator.clipboard.writeText = t => { window.__p = t; return Promise.resolve(); };"


def check_that(cond, what):
    """Prints one check and notes it when it fails.

    Args:
        cond (bool): whether the check passed.
        what (str): what was checked.

    Returns:
        None: the result is printed and failures are collected.
    """
    print(('ok    ' if cond else 'FAIL  ') + what)
    if not cond:
        failures.append(what)


def get_state(page, expr):
    """Returns an expression evaluated on the editor state (S is window.qrEditor.state).

    Args:
        page (Page): the editor page.
        expr (str): a JavaScript expression over S.

    Returns:
        Any: its value.
    """
    return page.evaluate(f'() => {{ const S = qrEditor.state; return {expr}; }}')


def set_code(page, text, wait=700):
    """Changes the document as one undo step and waits for it to be drawn.

    Args:
        page (Page): the editor page.
        text (str): the new QR document.
        wait (int): milliseconds to wait afterwards.

    Returns:
        None: the editor holds the new document.
    """
    page.evaluate('t => qrEditor.change(t)', text)
    page.wait_for_timeout(wait)


def get_scan_level(page):
    """Waits for the scan check and returns its result.

    Args:
        page (Page): the editor page.

    Returns:
        str | None: "good", "fair" or "fail", None without a code.
    """
    page.wait_for_function('() => !!qrEditor.state.scan || !qrEditor.state.layout', timeout=8000)
    return get_state(page, 'S.scan && S.scan.level')


def get_blob(page, fmt):
    """Returns the file the Export dialog makes for a format.

    Args:
        page (Page): the editor page.
        fmt (str): the format (svg, pdf, eps, png, jpeg, webp, txt, qr).

    Returns:
        bytes: the file.
    """
    data = page.evaluate("""async f => { const b = await qrEditor.exp.createBlob(f); const u = new Uint8Array(await b.arrayBuffer());
        let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); }""", fmt)
    return base64.b64decode(data)


def run_tool(page, name, args):
    """Runs a WebMCP tool the editor registered.

    Args:
        page (Page): the editor page.
        name (str): the tool name.
        args (dict): its arguments.

    Returns:
        Any: what the tool returns.
    """
    return page.evaluate('([n, a]) => window.tools.find(t => t.name === n).execute(a)', [name, args])


def get_problems(page):
    """Returns the problems of the open document.

    Args:
        page (Page): the editor page.

    Returns:
        list[str]: "kind: message" for each problem.
    """
    return get_state(page, 'S.problems.map(p => p.kind + ": " + p.msg)')


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    ctx.add_init_script(FAKE_MCP)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(URL)
    page.evaluate('localStorage.clear()')
    page.reload()
    page.wait_for_timeout(800)

    # --- The welcome example ---
    check_that(get_state(page, 'S.name') == 'Guest WiFi', 'the first visit opens the welcome example')
    check_that(get_state(page, 'S.type') == 'wifi' and get_state(page, 'S.content') == 'WIFI:T:WPA;S:Guest;P:sunny-day-42;;', 'the content after --- is read as WiFi')
    check_that(get_scan_level(page) == 'good', 'the welcome example scans in all three conditions')
    check_that(not [p for p in get_problems(page) if not p.startswith('info')], 'the welcome example has no problems')
    check_that(page.locator('#qr-view svg path').count() >= 4 and page.locator('#qr-view svg text').count() == 1, 'the code is drawn with its caption')
    check_that(page.locator('#scan-badge[data-state="good"]').count() == 1, 'the badge says the code scans')
    check_that(page.locator('#hl .k').count() >= 10 and page.locator('#hl .d').count() == 1, 'the code is highlighted (keys, the --- line)')

    # --- Text without a header is all content ---
    set_code(page, 'https://example.com/a')
    check_that(get_state(page, '[S.doc.header, S.type, S.content]') == [False, 'link', 'https://example.com/a'], 'text without --- is all content (a link)')
    set_code(page, 'color: #ff0000\nfoo: 1\necc: X\n---\nhello\n---\nworld\n')
    check_that(get_state(page, 'S.content') == 'hello\n---\nworld', 'the content is everything after the first ---, without the final line break')
    p = get_problems(page)
    check_that(any('Unknown key "foo"' in x for x in p) and any('"ecc: X" is not valid' in x for x in p), 'unknown keys and invalid values are listed')
    check_that(get_state(page, 'S.problems.find(p => p.msg.includes("foo")).line') == 1, 'a problem has the line of its key')

    # --- Design tab writes its own line, one undo step ---
    set_code(page, 'color: #1d2b53\n---\nhttps://example.com\n')
    page.click('[data-itab=design]')
    page.click('.choice[data-key="modules"][data-val="dots"]')
    page.wait_for_timeout(400)
    check_that(get_state(page, 'S.code') == 'color: #1d2b53\nmodules: dots\n---\nhttps://example.com\n', 'a shape writes its line at the end of the header')
    page.click('.choice[data-key="eye-frame"][data-val="circle"]')
    page.wait_for_timeout(300)
    page.click('#btn-undo')
    page.wait_for_timeout(300)
    check_that('eye-frame' not in get_state(page, 'S.code') and 'modules: dots' in get_state(page, 'S.code'), 'undo takes back one design change')
    page.fill('#d-color', '#123456')
    page.wait_for_timeout(300)
    check_that('color: #123456' in get_state(page, 'S.code'), 'typing a color writes it into its line')
    page.select_option('#d-ecc', 'H')
    page.wait_for_timeout(300)
    check_that('ecc: H' in get_state(page, 'S.code'), 'error correction is written')
    page.click('.choice[data-key="logo"][data-val="star"]')
    page.wait_for_timeout(500)
    check_that('logo: star' in get_state(page, 'S.code'), 'a built-in logo is written')
    page.check('#d-transparent')
    page.wait_for_timeout(300)
    check_that('background: transparent' in get_state(page, 'S.code') and any('Transparent background' in x for x in get_problems(page)), 'transparent background, with a note')
    page.click('#d-reset')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.code') == 'https://example.com\n', 'Reset the design removes every design line')
    page.click('#btn-undo')
    page.wait_for_timeout(300)
    check_that('logo: star' in get_state(page, 'S.code'), 'undo brings the design back')

    # --- Content tab: forms write the content in its canonical form ---
    set_code(page, 'WIFI:T:WPA;S:Home;P:password1;;')
    page.click('[data-itab=content]')
    page.wait_for_timeout(200)
    page.fill('#f-ssid', 'My;Net "5G"')
    page.wait_for_timeout(1000)
    check_that(get_state(page, 'S.content') == 'WIFI:T:WPA;S:My\\;Net \\"5G\\";P:password1;;', 'the WiFi form escapes ; and " in the network name')
    hist = get_state(page, 'S.history.length')
    page.click('#btn-undo')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.content') == 'WIFI:T:WPA;S:Home;P:password1;;', 'typing in a form is one undo step')
    page.select_option('#f-auth', 'nopass')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.content') == 'WIFI:T:nopass;S:Home;;' and page.locator('#f-password').is_disabled(), 'an open network has no password; the field is disabled, not hidden')
    page.select_option('#content-type', 'link')
    page.wait_for_timeout(400)
    check_that(get_state(page, '[S.type, S.content]') == ['link', 'https://example.com'], 'choosing another kind starts it with an example')
    page.fill('#f-url', 'https://bit.ly/3abc')
    page.wait_for_timeout(900)
    check_that(any('link shortener' in x for x in get_problems(page)), 'a link shortener is flagged')
    page.fill('#f-url', 'http://example.com')
    page.wait_for_timeout(900)
    check_that(any('uses http://' in x for x in get_problems(page)), 'http:// is flagged')

    # --- Payments ---
    page.click('#btn-new')
    page.click('[data-new=swiss]')
    page.wait_for_timeout(900)
    check_that(get_state(page, 'S.type') == 'swiss' and get_scan_level(page) == 'good', 'the Swiss QR bill template scans')
    check_that(not [x for x in get_problems(page) if x.startswith('error')], 'the Swiss QR bill template is valid (QR-IBAN with QR reference)')
    check_that(get_state(page, 'S.layout.items.some(i => i.fill === "#000000") && S.enc.ecc') == 'M', 'the Swiss QR bill is drawn black with error correction M')
    set_code(page, get_state(page, 'S.code').replace('210000000003139471430009017', '210000000003139471430009018'))
    check_that(any('check digit of the QR reference' in x for x in get_problems(page)), 'a wrong QR reference check digit is an error')
    set_code(page, get_state(page, 'S.code').replace('210000000003139471430009018', '210000000003139471430009017').replace('\nCHF\n', '\nEUR\n'))
    check_that(any('From 14 November 2026' in x for x in get_problems(page)), 'EUR with a QR-IBAN is refused (IG 2.4)')
    set_code(page, '---\nBCD\n002\n1\nSCT\n\nRed Cross\nDE89370400440532013001\nEUR25.00\n\n\nDonation\n')
    check_that(any('check digits of the IBAN' in x for x in get_problems(page)), 'a wrong IBAN is an error (SEPA)')
    set_code(page, 'ecc: H\n---\nBCD\n002\n1\nSCT\n\nRed Cross\nDE89370400440532013000\nEUR25.00\n\n\nDonation\n')
    check_that(get_state(page, 'S.enc.ecc') == 'M' and any('error correction M' in x for x in get_problems(page)), 'a SEPA code keeps error correction M')

    # --- Checks of the design ---
    set_code(page, 'color: #bbbbbb\n---\nhttps://example.com\n', 1200)
    check_that(any(x.startswith('error: Contrast') for x in get_problems(page)), 'too little contrast is an error')
    set_code(page, 'margin: 1\n---\nhttps://example.com\n', 1200)
    check_that(any('quiet zone of 1' in x for x in get_problems(page)), 'a quiet zone below 2 modules is an error')
    set_code(page, 'logo: heart\nlogo-size: 30\necc: L\nboost: no\n---\nhttps://example.com/a-longer-address-for-the-test\n', 1500)
    p = get_problems(page)
    check_that(any('The logo hides about' in x for x in p), 'a logo larger than the error correction can repair is reported')
    check_that(get_scan_level(page) in ('fail', 'fair'), 'the scan check notices the oversized logo')
    set_code(page, 'background: #000000\ncolor: #ffffff\n---\nhttps://example.com\n', 1200)
    check_that(any('Light code on a dark background' in x for x in get_problems(page)) and get_scan_level(page) == 'good', 'a light-on-dark code is read and noted')
    set_code(page, '---\n' + 'x' * 3000 + '\n')
    check_that(any('too long' in x for x in get_problems(page)) and page.locator('#qr-empty').is_visible(), 'content that does not fit is reported')

    # --- Caption in place ---
    set_code(page, 'caption: Hello\n---\nhttps://example.com\n')
    page.click('#qr-view svg text')
    page.wait_for_timeout(200)
    check_that(page.locator('.title-edit').count() == 1, 'clicking the caption edits it in place')
    page.keyboard.press('Escape')
    box = page.locator('#qr-view svg text').bounding_box()
    page.mouse.click(box['x'] + box['width'] - 1, box['y'] + box['height'] / 2)
    check_that(page.evaluate("document.querySelector('.title-edit').selectionStart") == 5, 'a click at the end of the caption puts the cursor at its end')
    page.keyboard.press('Escape')
    page.mouse.click(box['x'] + 1, box['y'] + box['height'] / 2)
    check_that(page.evaluate("document.querySelector('.title-edit').selectionStart") == 0, 'a click at its start puts the cursor at the start')
    page.keyboard.press('Control+A')
    page.keyboard.type('Scan for the menu')
    page.keyboard.press('Enter')
    page.wait_for_timeout(400)
    check_that(get_state(page, 'S.code') == 'caption: Scan for the menu\n---\nhttps://example.com\n', 'Enter writes the caption line')
    page.click('#qr-view svg text')
    page.keyboard.type('xyz')
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)
    check_that('xyz' not in get_state(page, 'S.code'), 'Escape cancels the edit')

    # --- Export ---
    set_code(page, 'color: #1d2b53\ncolor2: #2c55c9\ngradient: linear\nmodules: rounded\nlogo: pin\necc: H\ncaption: Grüezi – 你好\nframe: filled\n---\nhttps://example.com/export\n', 1200)
    svg = get_blob(page, 'svg').decode()
    check_that(svg.startswith('<svg') and 'linearGradient' in svg and 'Grüezi – 你好' in svg, 'SVG with gradient and caption')
    pdf = get_blob(page, 'pdf')
    check_that(pdf.startswith(b'%PDF-1.4') and b'/ShadingType 2' in pdf and pdf.rstrip().endswith(b'%%EOF'), 'PDF with a vector gradient')
    eps = get_blob(page, 'eps')
    check_that(eps.startswith(b'%!PS-Adobe-3.0 EPSF-3.0') and b'shfill' in eps, 'EPS with a vector gradient')
    page.click('#btn-export')
    page.check('input[name="ex-format-choice"][value="png"]')
    page.fill('#ex-px', '600')
    page.fill('#ex-dpi', '150')
    page.wait_for_timeout(200)
    png = get_blob(page, 'png')
    i = png.find(b'pHYs')
    w = struct.unpack('>I', png[16:20])[0]
    check_that(png.startswith(b'\x89PNG') and w == 600 and i > 0 and struct.unpack('>I', png[i + 4:i + 8])[0] == round(150 / 0.0254), 'PNG at the chosen width with its dpi')
    check_that(get_blob(page, 'jpeg')[:3] == b'\xff\xd8\xff' and get_blob(page, 'webp')[8:12] == b'WEBP', 'JPEG and WebP')
    check_that(get_blob(page, 'qr').decode() == get_state(page, 'S.code') and get_blob(page, 'txt').decode() == 'https://example.com/export', 'the .qr document and the content as text')
    with page.expect_download() as d:
        page.click('#ex-zip')
    with zipfile.ZipFile(d.value.path()) as zf:
        check_that(len(zf.namelist()) == 6, 'all formats as ZIP')
    page.keyboard.press('Escape')

    # --- Reading a code from a picture ---
    b64png = base64.b64encode(png).decode()
    n_before = page.evaluate('qrEditor.store.list().length')
    ok = page.evaluate("""async b => { const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return qrEditor.readPicture(new File([u], 'code.png', { type: 'image/png' }), 'code.png'); }""", b64png)
    page.wait_for_timeout(500)
    check_that(ok and get_state(page, 'S.content') == 'https://example.com/export' and page.evaluate('qrEditor.store.list().length') == n_before + 1, 'a picture is read: its content becomes a new document')
    ok = page.evaluate("""async () => { const c = document.createElement('canvas'); c.width = c.height = 200; c.getContext('2d').fillRect(20, 20, 50, 50);
        const b = await new Promise(r => c.toBlob(r)); return qrEditor.readPicture(b, 'empty.png'); }""")
    check_that(ok is False, 'a picture without a code is reported')

    # --- Many codes from a table ---
    set_code(page, 'caption: {{name}}\n---\nhttps://example.com/{{slug}}\n')
    page.click('#btn-export')
    page.check('input[name="ex-format-choice"][value="batch"]')
    page.fill('#ex-batch-csv', 'name,slug\nShop,shop\nBlog,blog\n"Big, team",team\n')
    page.wait_for_timeout(200)
    check_that('3 rows' in page.locator('#ex-batch-info').inner_text(), 'the table is read: 3 rows, placeholders found')
    with page.expect_download() as d:
        page.click('#ex-download')
    with zipfile.ZipFile(d.value.path()) as zf:
        names = sorted(zf.namelist())
        check_that(names == ['Big, team.svg', 'Blog.svg', 'Shop.svg'], 'a ZIP with one SVG per row, named from a column')
        check_that('Big, team' in zf.read('Big, team.svg').decode(), 'the caption is filled per row')
    page.select_option('#ex-batch-format', 'pdf')
    with page.expect_download() as d:
        page.click('#ex-download')
    data = open(d.value.path(), 'rb').read()
    check_that(b'/Count 3' in data, 'one PDF with a page per row')
    page.keyboard.press('Escape')

    # --- AI links ---
    doc = 'color: #2c55c9\n---\nhttps://example.com/from-ai\n'
    page.goto(URL + '#qr=' + urllib.parse.quote(doc) + '&file=new&name=From%20AI')
    page.wait_for_timeout(1200)
    check_that(get_state(page, '[S.name, S.code]') == ['From AI', doc], 'an AI link (#qr=) makes a new document')
    b = base64.urlsafe_b64encode('https://example.com/b64'.encode()).decode().rstrip('=')
    page.goto(URL + '#b64=' + b)
    page.wait_for_timeout(1200)
    check_that(get_state(page, 'S.content') == 'https://example.com/b64', 'an AI link (#b64=) with only the content changes the open document')
    page.click('#btn-undo')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.content') == 'https://example.com/from-ai', 'undo takes the AI change back')
    page.click('#btn-ai')
    page.click('#ai-copy')
    page.wait_for_timeout(300)
    prompt = page.evaluate("window.__p || document.getElementById('ai-prompt-text').value || ''")
    check_that('THE QR DOCUMENT' in prompt and 'https://example.com/b64' not in prompt and 'from-ai' in prompt, 'the prompt explains the QR document and holds the open one')
    page.keyboard.press('Escape')

    # --- WebMCP ---
    names = page.evaluate('window.tools.map(t => t.name)')
    check_that(set(names) >= {'get_document', 'get_problems', 'set_content', 'set_design', 'set_document', 'scan_check', 'undo', 'list_files', 'open_file', 'new_file'}, 'the WebMCP tools are offered')
    r = run_tool(page, 'set_content', {'content': 'tel:+41521234567'})
    check_that(get_state(page, 'S.type') == 'phone' and 'Phone' in r, 'set_content sets the content')
    r = run_tool(page, 'set_design', {'key': 'modules', 'value': 'soft'})
    check_that('modules: soft' in get_state(page, 'S.code'), 'set_design writes a design line')
    r = run_tool(page, 'scan_check', {})
    check_that('scans reliably' in r, 'scan_check reports the result')
    check_that('tel:+41521234567' in run_tool(page, 'get_document', {}), 'get_document returns the document')

    # --- My documents ---
    page.click('#btn-files')
    page.wait_for_timeout(300)
    check_that(page.locator('#files-grid .qr-picture svg').count() >= 3, 'My documents shows each code as its picture')
    page.keyboard.press('Escape')

    # --- Viewer ---
    v = ctx.new_page()
    v.goto(URL + '?viewer=1#qr=' + urllib.parse.quote('caption: Viewer\n---\nhttps://example.com/v'))
    v.wait_for_timeout(1200)
    check_that(v.locator('#qr-view svg').is_visible() and not v.locator('.code-pane').is_visible() and not v.locator('.inspector').is_visible(), 'the viewer shows only the code')
    v.close()

    # --- Stored settings with a German tab name ---
    m = ctx.new_page()
    m.goto(URL)
    m.evaluate("localStorage.setItem('qreditor.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('qreditor.v1') || '{}'), itab: 'pruefen' }))")
    m.reload()
    m.wait_for_timeout(1200)
    check_that(m.get_attribute('[data-itab=check]', 'aria-selected') == 'true', 'a stored German tab name opens its tab under the English name')
    check_that(m.evaluate("JSON.parse(localStorage.getItem('qreditor.v1')).itab") == 'check', 'the settings are stored again with the English tab name')
    m.close()

    # --- Phone ---
    page.set_viewport_size({'width': 360, 'height': 760})
    page.wait_for_timeout(300)
    check_that(page.locator('.views').is_visible(), 'phone: Code / QR code / Edit tabs')
    check_that(page.evaluate('document.documentElement.scrollWidth') <= 361, 'phone: no sideways scrolling')
    page.click('[data-pane=properties]')
    page.click('[data-itab=design]')
    check_that(page.evaluate('document.documentElement.scrollWidth') <= 361 and page.locator('#design-body').is_visible(), 'phone: the design panel fits')
    heights = page.evaluate("[...document.querySelectorAll('#design-body .choice')].map(b => b.offsetHeight)")
    check_that(len(set(heights)) == 1, 'phone: all shape and logo buttons have one height')

    check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
    browser.close()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
