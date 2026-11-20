"""The content formats against their standards (Playwright, Google Chrome; the
modules run in the page as the editor uses them).

    php -S 127.0.0.1:8107 -t src src/php/router.php          (in the project folder)
    python tests/payload_test.py

IBAN check digits and lengths, the QR reference (modulo 10 recursive) and the
creditor reference (ISO 11649) with the example numbers of the SIX
Implementation Guidelines, WiFi escaping as ZXing reads it, vCard and MeCard
escaping, iCalendar all-day events, BIP21 / EIP-681 amounts, the EPC and Swiss
QR bill payloads (element order, no line break after the last element, limits),
detection of every type, the document format (header, ---, content) and that
every type, built by its form, survives the round trip through the drawn code
(jsQR reads back exactly the content)."""
import os
import sys

from playwright.sync_api import sync_playwright

URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8107/')
failures = []


def check_that(condition, what):
    """Print one result line and note a failure.

    Args:
        condition (bool): whether the check holds.
        what (str): what is checked, as printed.

    Returns:
        None: the result is printed and a failure is added to failures.
    """
    print(('ok    ' if condition else 'FAIL  ') + what)
    if not condition:
        failures.append(what)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(500)
    page.evaluate("""async () => {
        window.P = await import('/js/payload.js?v=5');
        window.PC = await import('/js/payload-check.js?v=2');
        window.B = await import('/js/payload-bank.js?v=2');
        window.D = await import('/js/qrdoc.js?v=4');
        window.R = await import('/js/render.js?v=4');
        window.C = await import('/js/check.js?v=4');
    }""")

    def run_script(script, argument=None):
        """Run JavaScript in the test page and return its result.

        Args:
            script (str): the expression or function to run.
            argument (object): the argument handed to a function, None for none.

        Returns:
            object: the result, as Playwright converts it.
        """
        return page.evaluate(script, argument)

    # --- IBAN and references ---
    check_that(run_script("B.getIbanProblem('CH44 3199 9123 0008 8901 2')") == '', 'IBAN: the SIX example QR-IBAN is valid')
    check_that(run_script("B.getIbanProblem('DE89370400440532013000')") == '' and run_script("B.getIbanProblem('GB82WEST12345698765432')") == '', 'IBAN: DE and GB examples are valid')
    check_that('check digits' in run_script("B.getIbanProblem('DE89370400440532013001')"), 'IBAN: a wrong digit is found')
    check_that('22 characters' in run_script("B.getIbanProblem('DE8937040044053201300')"), 'IBAN: a wrong length for the country is found')
    check_that(run_script("B.isQrIban('CH4431999123000889012')") is True and run_script("B.isQrIban('CH9300762011623852957')") is False, 'QR-IBAN: QR-IID 30000-31999')
    check_that(run_script("B.getQrReferenceProblem('210000000003139471430009017')") == '', 'QR reference: the SIX example is valid')
    check_that(run_script("B.buildQrReference('21000000000313947143000901')") == '210000000003139471430009017', 'QR reference: the check digit is computed (modulo 10 recursive)')
    check_that('check digit' in run_script("B.getQrReferenceProblem('210000000003139471430009018')"), 'QR reference: a wrong check digit is found')
    check_that(run_script("B.getCreditorReferenceProblem('RF18 5390 0754 7034')") == '' and run_script("B.buildCreditorReference('539007547034')") == 'RF18539007547034', 'creditor reference: ISO 11649 example valid and computed')
    check_that('check digits' in run_script("B.getCreditorReferenceProblem('RF19539007547034')"), 'creditor reference: wrong check digits are found')

    # --- WiFi ---
    w = run_script("P.buildContent('wifi', { ssid: 'a;b,c:d\"e\\\\f', auth: 'WPA', password: 'p;w', hidden: true })")
    check_that(w == 'WIFI:T:WPA;S:a\\;b\\,c\\:d\\"e\\\\f;P:p\\;w;H:true;;', 'WiFi: \\ ; , : " are escaped, hidden is H:true')
    check_that(run_script("JSON.stringify(P.parseContent('wifi', arguments[0]))".replace('arguments[0]', repr(w))) == '{"ssid":"a;b,c:d\\"e\\\\f","auth":"WPA","password":"p;w","hidden":true,"rawT":"WPA"}', 'WiFi: parsed back exactly')
    check_that(run_script("P.buildContent('wifi', { ssid: 'Open', auth: 'nopass' })") == 'WIFI:T:nopass;S:Open;;', 'WiFi: an open network has no P:')
    check_that(any('T:SAE' in x['msg'] for x in run_script("PC.getContentProblems('wifi', 'WIFI:T:SAE;S:x;P:password1;;')")), 'WiFi: T:SAE is read but flagged')
    check_that(run_script("P.parseContent('wifi', 'WIFI:S:Cafe;;').auth") == 'nopass', 'WiFi: without T the network is open')

    # --- Contacts ---
    v = run_script("P.buildContent('contact', { format: 'vcard', first: 'Anna', last: 'Muster', org: 'A, B; C', note: 'line1\\nline2' })")
    check_that('ORG:A\\, B\\; C' in v and 'NOTE:line1\\nline2' in v and v.startswith('BEGIN:VCARD\nVERSION:3.0\nN:Muster;Anna;;;\nFN:Anna Muster'), 'vCard 3.0: N, FN and escaping of , ; and line breaks')
    check_that(run_script("P.parseContent('contact', arguments[0]).org".replace('arguments[0]', repr(v))) == 'A, B; C', 'vCard: parsed back')
    m = run_script("P.buildContent('contact', { format: 'mecard', first: 'Anna', last: 'Muster', email: 'a@example.com', note: 'x;y' })")
    check_that(m == 'MECARD:N:Muster,Anna;EMAIL:a@example.com;NOTE:x\\;y;;', 'MeCard: N:Last,First, escaping, ends with ;;')

    # --- Email, SMS, phone, location ---
    check_that(run_script("P.buildContent('email', { to: 'a@example.com', subject: 'Hello & bye', body: 'x y' })") == 'mailto:a@example.com?subject=Hello%20%26%20bye&body=x%20y', 'mailto: percent-encoded subject and body')
    check_that(run_script("P.parseContent('email', 'MATMSG:TO:a@example.com;SUB:Hi;BODY:Text;;').subject") == 'Hi', 'MATMSG is read')
    check_that(run_script("P.buildContent('sms', { number: '+41 79 123', message: 'Hi: you' })") == 'SMSTO:+4179123:Hi: you', 'SMSTO:number:text')
    check_that(run_script("P.parseContent('sms', 'sms:+4179?body=Hello%20there').message") == 'Hello there', 'sms: with body is read')
    check_that(run_script("P.buildContent('phone', { number: '+41 (52) 123 45 67' })") == 'tel:+41521234567', 'tel: digits and +')
    check_that(run_script("P.buildContent('location', { lat: '47.6779', lon: '8.6152' })") == 'geo:47.6779,8.6152', 'geo:lat,lon (RFC 5870)')

    # --- Events ---
    e = run_script("P.buildContent('event', { title: 'A, B', allday: true, start: '2026-12-31', end: '2027-01-01' })")
    check_that('DTSTART;VALUE=DATE:20261231' in e and 'DTEND;VALUE=DATE:20270102' in e and 'SUMMARY:A\\, B' in e, 'all-day event: DTEND is the day after the last day')
    check_that(run_script("JSON.stringify(P.parseContent('event', arguments[0]))".replace('arguments[0]', repr(e))) == '{"title":"A, B","allday":true,"start":"2026-12-31","end":"2027-01-01","location":"","description":""}', 'all-day event: parsed back')

    # --- Crypto ---
    check_that(run_script("P.convertToWei('1.5')") == '1500000000000000000' and run_script("P.convertFromWei('2.014e18')") == '2.014', 'EIP-681: ether to wei and scientific notation back, without rounding')
    check_that(run_script("P.buildContent('crypto', { coin: 'bitcoin', address: 'bc1qxyz', amount: '0.001', label: 'A B' })") == 'bitcoin:bc1qxyz?amount=0.001&label=A%20B', 'BIP21: amount and label')

    # --- EPC ---
    epc = run_script("P.buildContent('epc', { name: 'Red Cross', iban: 'DE89 3704 0044 0532 0130 00', amount: '12.5', text: 'Donation' })")
    check_that(epc == 'BCD\n002\n1\nSCT\n\nRed Cross\nDE89370400440532013000\nEUR12.50\n\n\nDonation', 'EPC: element order, EUR with two decimals, no line after the last element')
    check_that(run_script(f"PC.getContentProblems('epc', {epc!r}).length") == 0, 'EPC: valid')
    check_that(any('Either a reference or a message' in x['msg'] for x in run_script("PC.getContentProblems('epc', 'BCD\\n002\\n1\\nSCT\\n\\nX\\nDE89370400440532013000\\n\\n\\nRF18539007547034\\ntext')")), 'EPC: reference and text together are refused')
    check_that(any('331' in x['msg'] for x in run_script("PC.getContentProblems('epc', 'BCD\\n002\\n1\\nSCT\\n\\nX\\nDE89370400440532013000\\nEUR1.00\\n\\n\\n' + 'ä'.repeat(160))")), 'EPC: more than 331 bytes is refused')

    # --- Swiss QR bill ---
    sw = run_script("""P.buildContent('swiss', { iban: 'CH4431999123000889012', name: 'Robert Schneider AG', street: 'Rue du Lac', house: '1268', zip: '2501', city: 'Biel', country: 'CH',
        amount: '1949.75', currency: 'CHF', reftype: 'QRR', reference: '210000000003139471430009017', message: 'Order', dname: 'Pia Rutschmann', dstreet: 'Marktgasse', dhouse: '28', dzip: '9400', dcity: 'Rorschach', dcountry: 'CH' })""")
    lines = sw.split('\n')
    check_that(len(lines) == 31 and lines[0:3] == ['SPC', '0200', '1'] and lines[4] == 'S' and lines[27] == 'QRR' and lines[30] == 'EPD' and not sw.endswith('\n'), 'Swiss QR bill: 31 elements in order, S address, ends with EPD, no line break after it')
    check_that(lines[11:18] == [''] * 7 and lines[18] == '1949.75' and lines[20] == 'S', 'Swiss QR bill: ultimate creditor empty, amount, debtor address type S')
    check_that(run_script(f"PC.getContentProblems('swiss', {sw!r}).length") == 0, 'Swiss QR bill: valid')
    bad = sw.replace('\nS\nRobert', '\nK\nRobert')
    check_that(any('structured (S)' in x['msg'] for x in run_script(f"PC.getContentProblems('swiss', {bad!r})")), 'Swiss QR bill: the combined address type K is refused (IG 2.3)')
    bad = sw.replace('CH4431999123000889012', 'CH9300762011623852957')
    check_that(any('needs a QR-IBAN' in x['msg'] for x in run_script(f"PC.getContentProblems('swiss', {bad!r})")), 'Swiss QR bill: a QR reference with a normal IBAN is refused')
    bad = sw.replace('\nQRR\n210000000003139471430009017', '\nNON\n')
    check_that(any('needs a QR reference' in x['msg'] for x in run_script(f"PC.getContentProblems('swiss', {bad!r})")), 'Swiss QR bill: a QR-IBAN without QR reference is refused')
    bad = sw.replace('\nOrder\n', '\nOrder 😀\n')
    check_that(any('Latin characters' in x['msg'] for x in run_script(f"PC.getContentProblems('swiss', {bad!r})")), 'Swiss QR bill: characters outside the allowed set are refused')

    # --- Detection ---
    det = run_script("""['https://x.ch', 'WIFI:S:x;;', 'BEGIN:VCARD', 'MECARD:N:x;;', 'mailto:a@example.com', 'MATMSG:TO:a;;', 'SMSTO:1:x', 'tel:1', 'geo:1,2',
        'BEGIN:VEVENT', 'bitcoin:x', 'ethereum:0x1', 'BCD\\n002', 'SPC\\n0200', 'Hello', 'https://x.ch\\nmore'].map(content => P.getContentType(content))""")
    check_that(det == ['link', 'wifi', 'contact', 'contact', 'email', 'email', 'sms', 'phone', 'location', 'event', 'crypto', 'crypto', 'epc', 'swiss', 'text', 'text'], 'every type is detected from its content')

    # --- The document ---
    check_that(run_script("D.parseDoc('a: 1\\n---\\nx\\n').content") == 'x' and run_script("D.parseDoc('a: 1\\n---\\nx\\n\\n').content") == 'x\n', 'only one final line break is not content')
    check_that(run_script("D.parseDoc('# note\\n\\ncolor: #F00\\n---\\nx').design.color") == '#ff0000', 'comments and blank lines in the header; #rgb is expanded')
    check_that(run_script("D.setContent('https://x.ch', 'k: v\\n---\\ny')") == '---\nk: v\n---\ny', 'content that looks like a header gets an empty header in front')
    check_that(run_script("D.setKey('color: #000000\\nlogo: wifi\\n---\\nx\\n', 'logo', '')") == 'color: #000000\n---\nx\n', 'an empty value removes the key line')

    # --- Every type survives the drawn code ---
    rt = run_script("""async () => {
        const S = (await import('/js/samples.js?v=3')).STARTERS;
        const out = {};
        for (const [type, content] of Object.entries(S)) {
            const rebuilt = P.buildContent(type, P.parseContent(type, content));
            const d = { ...D.DEFAULTS };
            const enc = R.createQrCode(rebuilt, type === 'swiss' || type === 'epc' ? { ...d, ecc: 'M', boost: 'no' } : d);
            const L = R.createLayout(enc, type === 'swiss' ? R.getEffectiveDesign(d, true) : d);
            const sc = await C.checkScan(L, rebuilt);
            out[type] = [P.getContentType(rebuilt) === type, sc.level];
        }
        return out;
    }""")
    check_that(all(v[0] for v in rt.values()), 'each form builds content of its own type: ' + ', '.join(k for k, v in rt.items() if not v[0]))
    check_that(all(v[1] == 'good' for v in rt.values()), 'each type reads back exactly from the drawn code: ' + ', '.join(f'{k}={v[1]}' for k, v in rt.items()))

    check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
    browser.close()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
