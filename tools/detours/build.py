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
V = "20261114f"
NAME = "Detours"
TAGLINE = "Notes from a career that didn't go in a straight line."
INTRO = ("Pharma sales, then more than a decade in recruiting and HR, then building AI products. "
         "None of it went in a straight line. These are the lessons from the turns, with the data that says "
         "a path like this is more normal than it feels.")
PREVIEW = "--preview" in sys.argv
SETTINGS = yaml.safe_load((ROOT / "_detours/settings.yml").read_text()) or {}
NEWS = bool(SETTINGS.get("newsletter_enabled")) or "--preview-signup" in sys.argv
ENDPOINT = SETTINGS.get("signup_endpoint", "")


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


def subscribe_block(source, heading="Get Detours by email", lede="One email a week: a real moment from my path, one published number, and one thing you can use. Free. Unsubscribe anytime."):
    if not NEWS:
        return ""
    return f"""      <section class="subscribe" id="subscribe" aria-labelledby="sub-{source}">
        <div class="subscribe__copy"><h2 id="sub-{source}">{heading}</h2><p>{lede}</p>
          <p class="subscribe__gift"><i data-lucide="gift"></i>Sign up and get the Detour Kit: my two-sentence gap answer, how to talk about contract roles, and my rules for using AI honestly.</p></div>
        <form class="subscribe__form" action="{e(ENDPOINT)}" method="post" data-subscribe>
          <input type="hidden" name="source" value="{e(source)}">
          <div class="subscribe__hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
          <label class="subscribe__field"><span>First name</span><input type="text" name="first_name" autocomplete="given-name" maxlength="40"></label>
          <label class="subscribe__field"><span>Email</span><input type="email" name="email" autocomplete="email" required maxlength="254"></label>
          <button class="btn btn--teal" type="submit"><i data-lucide="mail"></i>Subscribe</button>
          <p class="subscribe__msg" role="status" aria-live="polite"></p>
          <p class="subscribe__fine">I'll send a quick email to confirm. No spam, and I never share your address.</p>
        </form>
      </section>
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
{subscribe_block("post-" + p["slug"])}{AUTHOR}        {nav}
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
        <p class="detours-hero__actions">{'<a class="btn btn--teal btn--sm" href="#subscribe"><i data-lucide="mail"></i>Get it by email</a>' if NEWS else ''}<a class="btn btn--ghost-light btn--sm" href="/detours/feed.xml"><i data-lucide="rss"></i>RSS feed</a><a class="btn btn--ghost-light btn--sm" href="https://www.linkedin.com/in/tony-abdelmalak" target="_blank" rel="noopener"><i data-lucide="linkedin"></i>Follow on LinkedIn</a></p>
      </div>
    </section>
    <section class="section section--white">
      <div class="container detours-list">
        <h2 class="sr-only">All posts</h2>
        <ol class="entries">
{items}        </ol>
{subscribe_block("detours-index")}{AUTHOR}      </div>
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


NOINDEX = '\n  <meta name="robots" content="noindex">'


def simple_page(slug, title, eyebrow, body, noindex=True, desc=None):
    desc = desc or title
    return head(f"{title} | {NAME}", desc, f"/detours/{slug}/", "/assets/img/detours/detours-og.png", "website", NOINDEX if noindex else "") + f"""    <article class="article">
      <header class="report-hero article__hero"><div class="container article__wrap">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="/detours/"><i data-lucide="arrow-left"></i>All Detours</a></nav>
        <p class="eyebrow">{eyebrow}</p>
        <h1>{e(title)}</h1>
      </div></header>
      <div class="article__body container article__wrap">
{body}
{AUTHOR}      </div>
    </article>
""" + FOOT


def kit_page():
    f = ROOT / "_detours/kit.md"
    if not f.exists():
        return None
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", f.read_text(), re.S)
    fm, body = yaml.safe_load(m.group(1)), m.group(2).strip()
    html_body = markdown.markdown(body, extensions=["smarty"], output_format="html5").replace("<h2>", '<h2 class="article__h2">')
    return simple_page("kit", fm["title"], "The Detour Kit", html_body + "\n" + subscribe_block("kit", "Not subscribed yet?", "Get one Detours post a week by email. Free, and you can leave anytime."), noindex=True, desc=fm["dek"])


EMAIL_P = 'style="margin-top:0;margin-bottom:16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#1e293b"'


def email_html(p):
    h = p["html"]
    h = re.sub(r'<h2 class="article__h2">', '<h2 style="margin-top:28px;margin-bottom:10px;font-family:Georgia,\'Times New Roman\',serif;font-size:21px;line-height:28px;color:#001e42;font-weight:normal">', h)
    h = h.replace("<p>", f"<p {EMAIL_P}>")
    h = re.sub(r"<(ol|ul)>", r'<\1 style="margin-top:0;margin-bottom:16px;padding-left:22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:26px;color:#1e293b">', h)
    h = h.replace("<li>", '<li style="margin-bottom:6px">')
    h = re.sub(r'<a href="', '<a style="color:#0f766e;text-decoration:underline" href="', h)
    url = SITE + p["url"]
    srcs = "".join(f'<li style="margin-bottom:4px"><a style="color:#475569;text-decoration:underline" href="{e(s["url"])}">{e(s["label"])}</a></li>' for s in p["sources"])
    return (f'<p style="margin-top:0;margin-bottom:6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:#0f766e">{NAME} · No. {p["no"]}</p>'
            f'<h1 style="margin-top:0;margin-bottom:8px;font-family:Georgia,\'Times New Roman\',serif;font-size:28px;line-height:34px;color:#001e42;font-weight:normal">{e(p["title"])}</h1>'
            f'<p style="margin-top:0;margin-bottom:22px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:26px;color:#475569">{e(p["dek"])}</p>'
            + h +
            f'<p {EMAIL_P}><a style="color:#0f766e;text-decoration:underline;font-weight:bold" href="{url}">Read it on the site</a> or reply and tell me your answer. I read every reply.</p>'
            f'<p style="margin-top:24px;margin-bottom:6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:#64748b">Sources</p>'
            f'<ul style="margin-top:0;margin-bottom:0;padding-left:18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#475569">{srcs}</ul>')


def email_text(p):
    body = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", p["body_md"]).replace("## ", "")
    srcs = "\n".join(f"- {s['label']}: {s['url']}" for s in p["sources"])
    return f"{NAME} No. {p['no']}\n{p['title']}\n{p['dek']}\n\n{body}\n\nRead it on the site: {SITE}{p['url']}\n\nSources\n{srcs}"


def refresh_home(posts):
    """Keep the 'Latest from Detours' block on the home page in step with the published posts."""
    home = ROOT / "index.html"
    s = home.read_text()
    start, end = "<!-- detours:latest -->", "<!-- /detours:latest -->"
    if start not in s or PREVIEW:
        return
    pub = sorted(posts, key=lambda p: p["no"], reverse=True)[:3]
    items = "".join(f'<li><a href="{p["url"]}"><span>No. {p["no"]}</span>{html.escape(p["title"])}</a></li>' for p in pub)
    email_btn = '<a class="btn btn--teal btn--sm" href="/detours/#subscribe"><i data-lucide="mail"></i>Get it by email</a>' if NEWS else ""
    inner = ('\n        <div class="detours-latest reveal"><div><p class="eyebrow">Detours, a weekly column</p>'
             '<p class="detours-latest__lede">The story behind each turn, with the data that says a path like this is normal.</p>'
             f'<p class="detours-latest__actions"><a class="btn btn--outline btn--sm" href="/detours/"><i data-lucide="book-open"></i>Read Detours</a>{email_btn}</p></div>'
             f'<ol class="detours-latest__list">{items}</ol></div>\n        ')
    s = re.sub(re.escape(start) + r".*?" + re.escape(end), lambda _: start + inner + end, s, count=1, flags=re.S)
    home.write_text(s)


def main():
    r = subprocess.run([sys.executable, str(ROOT / "tools/detours/audit.py")], capture_output=True, text=True)
    if r.returncode:
        sys.exit("Audit failed, nothing built:\n" + r.stdout)
    posts = load_posts()
    base = ROOT / "detours"
    keep = {p["slug"] for p in posts} | {"thanks", "welcome", "unsubscribed", "kit", "email"}
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
    pages = {
        "thanks": ("Check your inbox", "One more step",
                   "<p>I just sent you an email. Click the button inside to confirm, and the Detour Kit will be on its way.</p><p>Nothing there in a minute or two? Check your spam or promotions folder, and add detours@tonyabdelmalak.com to your contacts so the weekly email lands where you'll see it.</p>"),
        "welcome": ("You're in", "Welcome to Detours",
                    f"<p>Thanks for confirming. Your welcome email with the Detour Kit is on its way.</p><p>While you're here, the posts so far are below. And if you want more in between, I post on LinkedIn most weeks.</p><p><a class=\"btn btn--teal\" href=\"/detours/kit/\"><i data-lucide=\"gift\"></i>Open the Detour Kit</a> <a class=\"btn btn--outline\" href=\"https://www.linkedin.com/in/tony-abdelmalak\" target=\"_blank\" rel=\"noopener\"><i data-lucide=\"linkedin\"></i>Follow on LinkedIn</a></p>"
                    + "<ul>" + "".join(f'<li><a href=\"{p["url"]}\">{e(p["title"])}</a></li>' for p in posts) + "</ul>"),
        "unsubscribed": ("You're unsubscribed", "Detours",
                         "<p>You won't get Detours emails anymore. No hard feelings, and thanks for reading.</p><p>The column stays free on the site whenever you want it: <a href=\"/detours/\">tonyabdelmalak.com/detours</a>.</p>"),
    }
    for slug, (title, eyebrow, body) in pages.items():
        (base / slug).mkdir(exist_ok=True)
        (base / slug / "index.html").write_text(simple_page(slug, title, eyebrow, body))
    kit = kit_page() if (SETTINGS.get("kit_live") or PREVIEW) else None
    if kit:
        (base / "kit").mkdir(exist_ok=True)
        (base / "kit" / "index.html").write_text(kit)
    elif (base / "kit" / "index.html").exists():
        (base / "kit" / "index.html").unlink()
    (base / "newsletter.json").write_text(json.dumps({
        "enabled": bool(SETTINGS.get("newsletter_enabled")), "weekly_send": bool(SETTINGS.get("weekly_send")),
        "postal_address": SETTINGS.get("postal_address") or ""}))
    if posts and not PREVIEW:
        latest = max(posts, key=lambda p: p["no"])
        (base / "email").mkdir(exist_ok=True)
        (base / "email" / "latest.json").write_text(json.dumps({
            "number": latest["no"], "slug": latest["slug"], "subject": f"Detours No. {latest['no']}: {latest['title']}",
            "dek": latest["dek"], "html": email_html(latest), "text": email_text(latest)}))
    refresh_home(posts)
    if "--og" in sys.argv:
        render_og(chrono)
    print(f"Built {len(posts)} post(s){' (preview: drafts included)' if PREVIEW else ''}")


if __name__ == "__main__":
    main()
