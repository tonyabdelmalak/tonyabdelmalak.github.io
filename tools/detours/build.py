"""Build the Detours column from _detours/posts/*.md.

  python3 tools/detours/build.py            # published posts only (status: published)
  python3 tools/detours/build.py --preview  # include drafts (local preview, never commit)
  python3 tools/detours/build.py --og       # also render link-preview images (needs Playwright + Chrome)

Writes detours/index.html, detours/<slug>/index.html, detours/feed.xml and, with --og,
assets/img/detours/<slug>-og.png. Every post must pass tools/detours/audit.py first.
"""
import datetime as dt, html, json, pathlib, re, subprocess, sys
import markdown, yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
SITE = "https://tonyabdelmalak.com"
V = "20261114e"
NAME = "Detours"
TAGLINE = "Notes from a career that didn't go in a straight line."
INTRO = ("Pharma sales, then more than a decade in recruiting and HR, then building AI products. "
         "None of it went in a straight line. These are the lessons from the turns, with the data that says "
         "a path like this is more normal than it feels.")
PREVIEW = "--preview" in sys.argv


def load_posts():
    posts = []
    for f in sorted((ROOT / "_detours/posts").glob("*.md")):
        m = re.match(r"^---\n(.*?)\n---\n(.*)$", f.read_text(), re.S)
        fm, body = yaml.safe_load(m.group(1)), m.group(2).strip()
        if fm.get("status") != "published" and not PREVIEW:
            continue
        fm["body_md"] = body
        fm["html"] = markdown.markdown(body, extensions=["smarty"], output_format="html5")
        fm["html"] = fm["html"].replace("<h2>", '<h2 class="article__h2">')
        fm["words"] = len(re.findall(r"\b\w+\b", body))
        fm["minutes"] = max(1, round(fm["words"] / 230))
        d = fm.get("date")
        fm["date"] = d if isinstance(d, dt.date) else (dt.date.fromisoformat(str(d)) if d else dt.date.today())
        fm["url"] = f"/detours/{fm['slug']}/"
        posts.append(fm)
    posts.sort(key=lambda p: (p["date"], p.get("number", 0)), reverse=True)
    for i, p in enumerate(sorted(posts, key=lambda p: (p["date"], p.get("number", 0)))):
        p["no"] = i + 1
    return posts


def e(s):
    return html.escape(str(s), quote=True)


def nice(d):
    return d.strftime("%B %-d, %Y")


def head(title, desc, url, og, kind="website", extra=""):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{e(title)}</title>
  <meta name="description" content="{e(desc)}">
  <link rel="canonical" href="{SITE}{url}">
  <meta name="theme-color" content="#001e42">
  <meta property="og:type" content="{kind}">
  <meta property="og:site_name" content="Tony Abdelmalak">
  <meta property="og:title" content="{e(title)}">
  <meta property="og:description" content="{e(desc)}">
  <meta property="og:url" content="{SITE}{url}">
  <meta property="og:image" content="{SITE}{og}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e(title)}">
  <meta name="twitter:description" content="{e(desc)}">
  <meta name="twitter:image" content="{SITE}{og}">
  <link rel="alternate" type="application/rss+xml" title="{NAME} by Tony Abdelmalak" href="{SITE}/detours/feed.xml">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" href="/assets/img/favicon.png">
  <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500..700;1,9..144,500..700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script>document.documentElement.classList.add("js")</script>
  <link rel="stylesheet" href="/assets/css/site.css?v={V}">{extra}
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="nav" role="banner">
    <div class="container nav__inner">
      <a class="nav__brand" href="/">Tony Abdelmalak</a>
      <button class="nav__toggle" type="button" aria-expanded="false" aria-controls="nav-links" aria-label="Open menu"><i data-lucide="menu"></i></button>
      <nav aria-label="Primary">
        <ul class="nav__links" id="nav-links">
          <li><a class="nav__link" href="/#about">About</a></li>
          <li><a class="nav__link" href="/#products">Products</a></li>
          <li><a class="nav__link" href="/#experience">Experience</a></li>
          <li><a class="nav__link is-active" href="/detours/">Detours</a></li>
          <li><a class="nav__link" href="/#analytics">Analytics</a></li>
          <li><a class="nav__link" href="/#skills">Skills</a></li>
          <li><a class="nav__link" href="https://www.linkedin.com/in/tony-abdelmalak" target="_blank" rel="noopener">LinkedIn</a></li>
          <li class="nav__mobile-cta"><a class="btn btn--teal" href="/assets/resume/Tony_Abdelmalak_Resume.pdf" target="_blank" rel="noopener"><i data-lucide="file-down"></i>Download Resume</a></li>
        </ul>
      </nav>
      <a class="btn btn--teal btn--sm nav__cta" href="/assets/resume/Tony_Abdelmalak_Resume.pdf" target="_blank" rel="noopener"><i data-lucide="file-down"></i>Download Resume</a>
    </div>
  </header>
  <main id="main">
"""


FOOT = f"""  </main>
  <footer class="footer">
    <div class="container footer__inner">
      <p>&copy; <span data-year>2026</span> Tony Abdelmalak · Los Angeles</p>
      <ul class="footer__links">
        <li><a href="/">Home</a></li>
        <li><a href="/detours/">Detours</a></li>
        <li><a href="/detours/feed.xml">RSS</a></li>
        <li><a href="https://www.linkedin.com/in/tony-abdelmalak" target="_blank" rel="noopener">LinkedIn</a></li>
      </ul>
    </div>
  </footer>
  <script src="https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js" defer></script>
  <script src="/assets/js/site.js?v={V}" defer></script>
  <link rel="stylesheet" href="/chat-widget/assets/chat/widget.css?v=20261113b">
  <script defer src="/chat-widget/assets/chat/widget.js?v=20261113b" data-autostart></script>
</body>
</html>
"""

AUTHOR = """      <aside class="author" aria-label="About the author">
        <picture><source srcset="/assets/img/tony-headshot.webp" type="image/webp"><img src="/assets/img/tony-headshot.jpg" width="96" height="96" alt="Tony Abdelmalak" loading="lazy"></picture>
        <div>
          <p class="author__name">Tony Abdelmalak</p>
          <p>Pharma sales, then more than a decade in recruiting and HR at NBCUniversal, HBO, Sony Pictures and Quibi. Now I design and build <a href="https://reflectiv-ai.com" target="_blank" rel="noopener">ReflectivAI</a>, <a href="https://careerpaverai.com" target="_blank" rel="noopener">CareerPaver</a> and <a href="https://lumiraconnect.com" target="_blank" rel="noopener">Lumira</a>.</p>
          <div class="author__actions"><button class="btn btn--teal btn--sm" type="button" data-open-chat><i data-lucide="message-circle"></i>Chat with me</button><a class="btn btn--outline btn--sm" href="https://www.linkedin.com/in/tony-abdelmalak" target="_blank" rel="noopener"><i data-lucide="linkedin"></i>Follow on LinkedIn</a></div>
        </div>
      </aside>
"""


def og_path(p):
    return f"/assets/img/detours/{p['slug']}-og.png"


def post_page(p, prev, nxt):
    desc = p["dek"]
    ld = {"@context": "https://schema.org", "@type": "BlogPosting", "headline": p["title"], "description": desc,
          "datePublished": p["date"].isoformat(), "url": SITE + p["url"], "image": SITE + og_path(p),
          "author": {"@type": "Person", "name": "Tony Abdelmalak", "url": SITE + "/"},
          "isPartOf": {"@type": "Blog", "name": NAME, "url": SITE + "/detours/"}}
    srcs = "".join(f'<li><a href="{e(s["url"])}" target="_blank" rel="noopener">{e(s["label"])}</a></li>' for s in p["sources"])
    nav = ""
    if prev or nxt:
        nav = '<nav class="article__more" aria-label="More Detours">'
        if nxt: nav += f'<a class="card" href="{nxt["url"]}"><div class="card__body"><span class="card__kicker">Newer · No. {nxt["no"]}</span><h4>{e(nxt["title"])}</h4><span class="card__foot">Read <i data-lucide="arrow-right"></i></span></div></a>'
        if prev: nav += f'<a class="card" href="{prev["url"]}"><div class="card__body"><span class="card__kicker">Earlier · No. {prev["no"]}</span><h4>{e(prev["title"])}</h4><span class="card__foot">Read <i data-lucide="arrow-right"></i></span></div></a>'
        nav += "</nav>"
    extra = f'\n  <script type="application/ld+json">{json.dumps(ld)}</script>'
    return (head(f"{p['title']} | {NAME} by Tony Abdelmalak", desc, p["url"], og_path(p), "article", extra) + f"""    <article class="article">
      <header class="report-hero article__hero"><div class="container article__wrap">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="/detours/"><i data-lucide="arrow-left"></i>All Detours</a></nav>
        <p class="eyebrow">{NAME} · No. {p['no']}</p>
        <h1>{e(p['title'])}</h1>
        <p class="article__dek">{e(desc)}</p>
        <p class="article__meta"><time datetime="{p['date'].isoformat()}">{nice(p['date'])}</time> · {p['minutes']} min read</p>
      </div></header>
      <div class="article__body container article__wrap">
{p['html']}
        <div class="article__sources"><h2>Sources</h2><ul>{srcs}</ul></div>
{AUTHOR}        {nav}
      </div>
    </article>
""" + FOOT)


def index_page(posts):
    items = "".join(f"""        <li><a class="entry" href="{p['url']}"><span class="entry__no">No. {p['no']}</span><span class="entry__main"><span class="entry__title">{e(p['title'])}</span><span class="entry__dek">{e(p['dek'])}</span><span class="entry__meta"><time datetime="{p['date'].isoformat()}">{nice(p['date'])}</time> · {p['minutes']} min read</span></span><i data-lucide="arrow-right"></i></a></li>
""" for p in posts)
    return head(f"{NAME}: notes from a career that didn't go in a straight line | Tony Abdelmalak",
                TAGLINE + " A weekly column by Tony Abdelmalak.", "/detours/", "/assets/img/detours/detours-og.png") + f"""    <section class="report-hero detours-hero">
      <div class="container">
        <p class="eyebrow">A weekly column</p>
        <h1>{NAME}</h1>
        <p class="detours-hero__tag">{TAGLINE}</p>
        <p>{INTRO}</p>
        <p class="detours-hero__actions"><a class="btn btn--ghost-light btn--sm" href="/detours/feed.xml"><i data-lucide="rss"></i>RSS feed</a><a class="btn btn--ghost-light btn--sm" href="https://www.linkedin.com/in/tony-abdelmalak" target="_blank" rel="noopener"><i data-lucide="linkedin"></i>Follow on LinkedIn</a></p>
      </div>
    </section>
    <section class="section section--white">
      <div class="container detours-list">
        <h2 class="sr-only">All posts</h2>
        <ol class="entries">
{items}        </ol>
{AUTHOR}      </div>
    </section>
""" + FOOT


def feed(posts):
    items = "".join(f"""  <item>
    <title>{e(p['title'])}</title>
    <link>{SITE}{p['url']}</link>
    <guid isPermaLink="true">{SITE}{p['url']}</guid>
    <pubDate>{dt.datetime.combine(p['date'], dt.time(16, 0)).strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate>
    <description>{e(p['dek'])}</description>
  </item>
""" for p in posts)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>{NAME} by Tony Abdelmalak</title>
  <link>{SITE}/detours/</link>
  <atom:link href="{SITE}/detours/feed.xml" rel="self" type="application/rss+xml"/>
  <description>{e(TAGLINE)}</description>
  <language>en-us</language>
{items}</channel>
</rss>
"""


def render_og(posts):
    import asyncio
    from playwright.async_api import async_playwright
    cards = [("detours-og.png", "A weekly column", NAME, TAGLINE)] + [
        (f"{p['slug']}-og.png", f"{NAME} · No. {p['no']}", p["title"], "Tony Abdelmalak · tonyabdelmalak.com") for p in posts]
    out = ROOT / "assets/img/detours"; out.mkdir(parents=True, exist_ok=True)
    async def run():
        async with async_playwright() as pw:
            b = await pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
            pg = await b.new_page(viewport={"width": 1200, "height": 630})
            for fn, kick, title, sub in cards:
                await pg.set_content(f"""<html><head><link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter:wght@500;600&display=swap" rel="stylesheet"></head>
<body style="margin:0;width:1200px;height:630px;background:radial-gradient(900px 500px at 85% 10%,#0e4f5c 0%,#001e42 60%);color:#fff;font-family:Inter;display:flex;flex-direction:column;justify-content:space-between;padding:72px 80px;box-sizing:border-box">
<div style="color:#5eead4;font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:22px">{kick}</div>
<div style="font-family:Fraunces;font-size:{76 if len(title) < 40 else 62}px;line-height:1.08;letter-spacing:-.02em;max-width:1000px">{html.escape(title)}</div>
<div style="font-size:24px;color:#cbd5e1">{html.escape(sub)}</div></body></html>""", wait_until="networkidle")
                await pg.screenshot(path=str(out / fn))
            await b.close()
    asyncio.run(run())


def main():
    r = subprocess.run([sys.executable, str(ROOT / "tools/detours/audit.py")], capture_output=True, text=True)
    if r.returncode:
        sys.exit("Audit failed, nothing built:\n" + r.stdout)
    posts = load_posts()
    base = ROOT / "detours"
    keep = {p["slug"] for p in posts}
    if base.exists():
        for d in base.iterdir():
            if d.is_dir() and d.name not in keep:
                for f in d.iterdir(): f.unlink()
                d.rmdir()
    base.mkdir(exist_ok=True)
    chrono = sorted(posts, key=lambda p: p["no"])
    for i, p in enumerate(chrono):
        prev = chrono[i - 1] if i > 0 else None
        nxt = chrono[i + 1] if i + 1 < len(chrono) else None
        (base / p["slug"]).mkdir(exist_ok=True)
        (base / p["slug"] / "index.html").write_text(post_page(p, prev, nxt))
    (base / "index.html").write_text(index_page(posts))
    (base / "feed.xml").write_text(feed(posts))
    if "--og" in sys.argv:
        render_og(chrono)
    print(f"Built {len(posts)} post(s){' (preview: drafts included)' if PREVIEW else ''}")


if __name__ == "__main__":
    main()
