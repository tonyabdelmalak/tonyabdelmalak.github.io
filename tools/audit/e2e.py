"""End-to-end interaction test of the live site, like a visitor would use it.
Usage: python3 tools/audit/e2e.py [https://tonyabdelmalak.com]
Checks: mobile menu, nav anchors, carousels, chat (open, send, real reply, close), resume download,
legacy redirects and hash routes, Detours index/post/next links and RSS, report charts render."""
import asyncio, sys, re, xml.dom.minidom, urllib.request
from playwright.async_api import async_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://tonyabdelmalak.com").rstrip("/")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh) site-e2e"}
results = []


def ok(name, cond, detail=""):
    results.append((name, bool(cond), detail))


def fetch(path):
    req = urllib.request.Request(BASE + path, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.headers.get("content-type", ""), r.read()


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])

        # Mobile menu
        m = await b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        errs = []
        m.on("pageerror", lambda e: errs.append(str(e)))
        await m.goto(BASE + "/", wait_until="networkidle")
        await m.click(".nav__toggle")
        await m.wait_for_timeout(400)
        vis = await m.is_visible("#nav-links a[href='/detours/']")
        ok("Mobile menu opens and shows Detours", vis)
        await m.click("#nav-links a[href='#experience']")
        await m.wait_for_timeout(2200)
        top = await m.evaluate("document.getElementById('experience').getBoundingClientRect().top")
        ok("Mobile menu link scrolls to Experience", -10 < top < 140, f"top={top:.0f}")
        ok("Mobile menu closes after tap", not await m.is_visible("#nav-links a[href='/detours/']") or
           await m.evaluate("document.querySelector('.nav__toggle').getAttribute('aria-expanded')") == "false")
        ok("No script errors on home (mobile)", not errs, "; ".join(errs[:2]))

        # Desktop anchors and carousels
        d = await b.new_page(viewport={"width": 1440, "height": 900})
        derrs = []
        d.on("pageerror", lambda e: derrs.append(str(e)))
        await d.goto(BASE + "/", wait_until="networkidle")
        hrefs = await d.evaluate("[...document.querySelectorAll('a[href^=\"#\"]')].map(a=>a.getAttribute('href')).filter(h=>h.length>1)")
        missing = [h for h in set(hrefs) if not await d.evaluate(f"!!document.getElementById({h[1:]!r})")]
        ok("Every in-page link has a target", not missing, ", ".join(missing))
        rails = await d.evaluate("document.querySelectorAll('[data-rail]').length")
        moved = 0
        for i in range(rails):
            r = d.locator("[data-rail]").nth(i)
            await r.scroll_into_view_if_needed()
            before = await r.evaluate("el=>el.querySelector('.rail__track,.rail, [data-track]')?.scrollLeft ?? el.scrollLeft")
            nxt = r.locator("button[aria-label*='ext'], [data-next]").first
            if await nxt.count():
                await nxt.click()
                await d.wait_for_timeout(700)
                after = await r.evaluate("el=>el.querySelector('.rail__track,.rail, [data-track]')?.scrollLeft ?? el.scrollLeft")
                moved += after > before
        ok(f"Carousel arrows move ({rails} carousels)", rails and moved == rails, f"{moved}/{rails}")

        # Chat end to end (real reply from the live chat service)
        await d.click(".portrait__chip")
        await d.wait_for_timeout(800)
        panel = await d.evaluate("!!document.querySelector('.cw-open') && document.querySelector('.cw-messages').getBoundingClientRect().height>0")
        ok("Chat opens from 'Chat with me'", panel)
        inp = d.locator("textarea.cw-input, input.cw-input, .cw-input textarea, .cw-input input").first
        await inp.fill("What do you build now?")
        await inp.press("Enter")
        reply = ""
        for _ in range(40):
            await d.wait_for_timeout(1000)
            reply = await d.evaluate("(()=>{const m=document.querySelector('.cw-messages');const k=m?[...m.children]:[];return k.length?k[k.length-1].innerText:''})()")
            if reply and "What do you build" not in reply and len(reply) > 40:
                break
        ok("Chat returns a real answer", len(reply) > 40 and "snag" not in reply.lower(), reply[:90].replace("\n", " "))
        ok("Chat answer has no em dash", "—" not in reply)
        await d.keyboard.press("Escape")
        ok("No script errors on home (desktop)", not derrs, "; ".join(derrs[:2]))

        # Hash routes for old demo links
        await d.goto(BASE + "/#interview-demo", wait_until="networkidle")
        await d.wait_for_timeout(900)
        ok("Old #interview-demo link lands on CareerPaver", "careerpaver" in d.url or
           abs(await d.evaluate("document.getElementById('careerpaver').getBoundingClientRect().top")) < 200, d.url)

        # Old page redirects
        await d.goto(BASE + "/recruitment-funnel.html", wait_until="networkidle")
        ok("Old report URL redirects to new report", "/reports/recruitment-funnel" in d.url, d.url)

        # Report charts render
        await d.goto(BASE + "/reports/recruitment-funnel.html", wait_until="networkidle")
        await d.wait_for_timeout(1500)
        charts = await d.evaluate("document.querySelectorAll('.js-plotly-plot svg.main-svg').length")
        ok("Report charts render", charts > 0, f"{charts} chart layers")

        # Detours flow
        await d.goto(BASE + "/detours/", wait_until="networkidle")
        n = await d.evaluate("document.querySelectorAll('.entries a.entry').length")
        ok("Detours index lists posts", n >= 3, f"{n} posts")
        await d.click(".entries a.entry >> nth=0")
        await d.wait_for_load_state("networkidle")
        h1 = await d.inner_text("h1")
        srcs = await d.evaluate("document.querySelectorAll('.article__sources a').length")
        ok("Detours post opens with sources", srcs > 0, f"{h1} ({srcs} sources)")
        more = await d.evaluate("document.querySelectorAll('.article__more a').length")
        ok("Detours post links to other posts", more >= 1)
        await b.close()

    st, ct, body = fetch("/assets/resume/Tony_Abdelmalak_Resume.pdf")
    ok("Resume downloads as a PDF", st == 200 and body[:4] == b"%PDF", f"{len(body)//1024} KB")
    st, ct, body = fetch("/detours/feed.xml")
    try:
        doc = xml.dom.minidom.parseString(body)
        items = len(doc.getElementsByTagName("item"))
        ok("RSS feed is valid", items >= 3, f"{items} items")
    except Exception as e:
        ok("RSS feed is valid", False, str(e))

    for name, good, detail in results:
        print(f"{'PASS' if good else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""))
    fails = sum(1 for r in results if not r[1])
    print(f"\n{len(results) - fails}/{len(results)} passed")
    sys.exit(1 if fails else 0)


asyncio.run(main())
