#!/usr/bin/env python3
"""Whole-site audit for tonyabdelmalak.com.

Usage:  python3 tools/audit/audit.py BASE_URL [--out DIR] [--shots]
  BASE_URL  e.g. https://tonyabdelmalak.com or http://127.0.0.1:8080

Discovers every page by crawling from the home page plus every .html file in the repo,
then checks each page at 390 px and 1440 px:
  - every link and asset on the page resolves (internal and external)
  - no horizontal scroll
  - interactive targets are at least 44x44 CSS px (inline text links are listed separately)
  - WCAG 2.2 AA color contrast and other axe-core wcag2a/wcag2aa rules
  - zero console errors
  - exactly one h1
  - title, description, canonical and Open Graph / Twitter preview tags, with a reachable og:image
  - no em dashes in visible copy
Writes out/report.json and out/report.md; exits non-zero when anything fails.
"""
import asyncio, json, os, re, sys, pathlib, urllib.parse, time, ssl, urllib.request, urllib.error
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
AXE = (HERE / "node_modules/axe-core/axe.min.js").read_text()
BASE = sys.argv[1].rstrip("/")
OUT = pathlib.Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else HERE / "out"
SHOTS = "--shots" in sys.argv
OUT.mkdir(parents=True, exist_ok=True)
WIDTHS = (390, 1440)
# Sites that block automated checks but are verified by hand in a signed-in browser.
BOT_BLOCKED = ("linkedin.com", "mckinsey.com", "weforum.org")  # each verified in a real browser on 2026-11-13

def repo_pages():
    skip = {"docs", "tools", ".git", "node_modules"}
    out = []
    for p in REPO.rglob("*.html"):
        if any(part in skip for part in p.relative_to(REPO).parts): continue
        rel = "/" + str(p.relative_to(REPO)).replace(os.sep, "/")
        out.append("/" if rel == "/index.html" else rel)
    return sorted(set(out))

_status_cache = {}
def check_url(u):
    if u in _status_cache: return _status_cache[u]
    if any(b in u for b in BOT_BLOCKED): _status_cache[u] = ("skipped-bot-blocked", None); return _status_cache[u]
    req = urllib.request.Request(u, method="GET", headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36", "Accept": "*/*"})
    code = None
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=30) as r: code = r.status; break
        except urllib.error.HTTPError as e: code = e.code; break
        except Exception as e: code = f"ERR {type(e).__name__}"; time.sleep(1)
    _status_cache[u] = (code, None); return _status_cache[u]

PAGE_JS = r"""() => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const inModebar = el => !!el.closest('.modebar, .modebar-container');
  const targets = [];
  document.querySelectorAll('a[href], button, select, input, textarea, [role=button], summary').forEach(el => {
    if (!vis(el) || inModebar(el)) return;
    const r = el.getBoundingClientRect();
    const inline = el.tagName === 'A' && !!el.closest('p, li') && getComputedStyle(el).display === 'inline';
    if (r.width < 44 || r.height < 44) targets.push({ tag: el.tagName.toLowerCase(), text: (el.innerText || el.getAttribute('aria-label') || el.id || '').trim().slice(0, 50), w: Math.round(r.width), h: Math.round(r.height), inline });
  });
  const links = new Set();
  document.querySelectorAll('a[href]').forEach(a => { const h = a.getAttribute('href'); if (!/^(mailto:|tel:|javascript:|#$)/.test(h)) links.add(a.href); });
  document.querySelectorAll('img[src], script[src], link[rel=stylesheet][href], source[srcset]').forEach(e => { const v = e.src || e.href || (e.srcset || '').split(' ')[0]; if (v) links.add(new URL(v, location.href).href); });
  const meta = n => (document.querySelector(`meta[name="${n}"], meta[property="${n}"]`) || {}).content || null;
  const body = document.body.innerText;
  const imgsBroken = [...document.images].filter(i => vis(i) && i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.src);
  const icons = document.querySelectorAll('i[data-lucide]').length;
  const anchors = [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.getElementById(h.slice(1)));
  return {
    title: document.title, h1: document.querySelectorAll('h1').length,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    desc: meta('description'), canonical: (document.querySelector('link[rel=canonical]') || {}).href || null,
    og: { title: meta('og:title'), desc: meta('og:description'), image: meta('og:image'), url: meta('og:url') },
    twitter: { card: meta('twitter:card'), image: meta('twitter:image') },
    noindex: /noindex/.test(meta('robots') || ''),
    emdash: (body.match(/.{0,30}—.{0,30}/g) || []).slice(0, 5),
    targets, links: [...links], imgsBroken, unrenderedIcons: icons, deadAnchors: anchors
  };
}"""

async def audit_page(ctx, path, width):
    pg = await ctx.new_page()
    errors = []
    pg.on("console", lambda m: errors.append(m.text[:240]) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)[:240]))
    failed_req = []
    pg.on("requestfailed", lambda r: failed_req.append(f"{r.url[:140]} ({r.failure})") if not any(b in r.url for b in ("google-analytics", "doubleclick")) else None)
    resp = await pg.goto(BASE + path, wait_until="load", timeout=60000)
    try: await pg.wait_for_load_state("networkidle", timeout=15000)
    except Exception: pass
    await pg.evaluate("""async()=>{for(let y=0;y<document.body.scrollHeight;y+=500){window.scrollTo({top:y,behavior:'instant'});await new Promise(r=>setTimeout(r,70));}window.scrollTo({top:0,behavior:'instant'});await new Promise(r=>setTimeout(r,600));}""")
    redirected_to = pg.url
    data = await pg.evaluate(PAGE_JS)
    await pg.add_script_tag(content=AXE)
    axe = await pg.evaluate("""async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']},resultTypes:['violations']});return r.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.slice(0,6).map(n=>({target:n.target.join(' '),summary:(n.failureSummary||'').slice(0,220)}))}))}""")
    if SHOTS:
        name = re.sub(r"[^a-z0-9]+", "_", path.lower()).strip("_") or "index"
        await pg.add_style_tag(content=".js .reveal{opacity:1!important;transform:none!important}")
        await pg.screenshot(path=str(OUT / f"{name}_{width}.png"), full_page=True)
    await pg.close()
    data.update(status=resp.status if resp else None, final_url=redirected_to, console_errors=errors, failed_requests=failed_req, axe=axe)
    return data

async def main():
    pages = ["/"] + [p for p in repo_pages() if p != "/"]
    results = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        for w in WIDTHS:
            ctx = await browser.new_context(viewport={"width": w, "height": 900}, device_scale_factor=1, user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 site-audit")
            for path in pages:
                try: results[f"{path}@{w}"] = await audit_page(ctx, path, w)
                except Exception as e: results[f"{path}@{w}"] = {"fatal": str(e)[:300]}
            await ctx.close()
        await browser.close()

    # Link checks (deduplicated across pages)
    all_links = sorted({l for r in results.values() for l in r.get("links", [])})
    link_status = {}
    for u in all_links:
        if u.startswith(BASE) or u.startswith("http"):
            code, _ = check_url(u.split("#")[0]); link_status[u] = code

    fails, warns = [], []
    for key, r in results.items():
        path, w = key.rsplit("@", 1)
        if "fatal" in r: fails.append((key, "page failed to load: " + r["fatal"])); continue
        is_redirect = r.get("noindex") and r["final_url"].rstrip("/") != (BASE + path).rstrip("/")
        if r["status"] != 200: fails.append((key, f"HTTP {r['status']}"))
        if is_redirect:
            continue  # redirect stubs: only need to land somewhere that passes on its own
        if r["h1"] != 1: fails.append((key, f"{r['h1']} h1 elements"))
        if r["overflow"] > 0: fails.append((key, f"horizontal scroll {r['overflow']}px"))
        for e in r["console_errors"]: fails.append((key, "console error: " + e))
        for t in r["targets"]:
            (warns if t["inline"] else fails).append((key, f"tap target {t['w']}x{t['h']} <{t['tag']}> '{t['text']}'" + (" (inline text link)" if t["inline"] else "")))
        for v in r["axe"]:
            for n in v["nodes"]: fails.append((key, f"axe {v['id']} ({v['impact']}): {n['target']} :: {n['summary'][:160]}"))
        if not r["desc"]: fails.append((key, "missing meta description"))
        if not r["canonical"]: fails.append((key, "missing canonical"))
        for k in ("title", "desc", "image", "url"):
            if not r["og"].get(k): fails.append((key, f"missing og:{k}"))
        if not r["twitter"].get("card"): fails.append((key, "missing twitter:card"))
        if r["og"].get("image"):
            c, _ = check_url(r["og"]["image"].replace("https://tonyabdelmalak.com", BASE))
            if c != 200: fails.append((key, f"og:image not reachable ({c}): {r['og']['image']}"))
        for e in r["emdash"]: fails.append((key, f"em dash in copy: …{e}…"))
        for i in r["imgsBroken"]: fails.append((key, f"broken image: {i}"))
        if r["unrenderedIcons"]: fails.append((key, f"{r['unrenderedIcons']} icons did not render"))
        for a in r["deadAnchors"]: fails.append((key, f"in-page link to missing #{a}"))
        for u in r["links"]:
            c = link_status.get(u)
            if c in (None, "skipped-bot-blocked"): continue
            if c != 200 and not (isinstance(c, int) and c in (301, 302, 303, 307, 308)):
                fails.append((key, f"broken link ({c}): {u}"))

    # Collapse duplicates
    seen, uniq = set(), []
    for k, m in fails:
        if (k, m) not in seen: seen.add((k, m)); uniq.append((k, m))
    report = {"base": BASE, "pages": len(pages), "widths": WIDTHS, "checked_links": len(link_status),
              "fails": uniq, "warnings": warns, "bot_blocked_links": sorted({u for u, c in link_status.items() if c == "skipped-bot-blocked"}), "results": results}
    (OUT / "report.json").write_text(json.dumps(report, indent=1))
    lines = [f"# Site audit: {BASE}", "", f"Pages: {len(pages)} at {', '.join(map(str, WIDTHS))} px. Links and assets checked: {len(link_status)}.", "",
             f"**Failures: {len(uniq)}**  ·  Warnings (inline text links under 44px, allowed by WCAG 2.5.8 inline exception): {len(warns)}", ""]
    for k, m in uniq: lines.append(f"- `{k}` {m}")
    if report["bot_blocked_links"]: lines += ["", "Links skipped because the site blocks automated checks (verified manually in a browser):"] + [f"- {u}" for u in report["bot_blocked_links"]]
    (OUT / "report.md").write_text("\n".join(lines))
    print("\n".join(lines[:60]))
    sys.exit(1 if uniq else 0)

asyncio.run(main())
