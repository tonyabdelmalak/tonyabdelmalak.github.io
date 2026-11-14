"""Publish one or more Detours posts and wire them into the site.

  python3 tools/detours/publish.py _detours/posts/04-....md [--date 2026-11-19]

1. Sets status: published, the publish date and the next post number.
2. Runs the guardrail audit and builds the column (pages, RSS, link-preview images).
3. Adds the Detours link to the nav of the home page and report pages (once).
4. Refreshes the "Latest from Detours" list on the home page.
5. Refreshes the Detours list in AI Tony's knowledge base so the chat can point to posts.
Deploy afterwards as one merge with the tested revert (see docs/ROLLBACK.md).
"""
import datetime as dt, pathlib, re, subprocess, sys, html
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
POSTS = ROOT / "_detours/posts"


def front(path):
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", path.read_text(), re.S)
    return yaml.safe_load(m.group(1)), m.group(1), m.group(2)


def set_key(raw, key, val):
    if re.search(rf"^{key}:.*$", raw, re.M):
        return re.sub(rf"^{key}:.*$", f"{key}: {val}", raw, count=1, flags=re.M)
    return raw + f"\n{key}: {val}"


def published():
    out = []
    for f in sorted(POSTS.glob("*.md")):
        fm, _, _ = front(f)
        if fm.get("status") == "published":
            out.append(fm)
    return sorted(out, key=lambda p: p["number"], reverse=True)


def replace_block(text, start, end, inner):
    pat = re.compile(re.escape(start) + r".*?" + re.escape(end), re.S)
    return pat.sub(lambda _: start + inner + end, text, count=1)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    date = dt.date.today().isoformat()
    if "--date" in sys.argv:
        date = sys.argv[sys.argv.index("--date") + 1]
        args = [a for a in args if a != date]
    if not args:
        sys.exit(__doc__)
    nums = [p["number"] for p in published()]
    nxt = max(nums, default=0) + 1
    for a in args:
        f = (ROOT / a) if not pathlib.Path(a).is_absolute() else pathlib.Path(a)
        fm, raw, body = front(f)
        raw = set_key(raw, "status", "published")
        raw = set_key(raw, "date", date)
        if fm.get("status") != "published" or not fm.get("number"):
            raw = set_key(raw, "number", fm.get("number") if fm.get("number") and fm["number"] >= nxt else nxt)
            nxt += 1
        f.write_text(f"---\n{raw}\n---\n{body}")
    for cmd in (["tools/detours/audit.py"], ["tools/detours/build.py", "--og"]):
        r = subprocess.run([sys.executable, *cmd], cwd=ROOT, capture_output=True, text=True)
        print(r.stdout.strip())
        if r.returncode:
            sys.exit(r.stderr or "failed: " + " ".join(cmd))

    posts = published()
    nav_li = '<li><a class="nav__link" href="/detours/">Detours</a></li>'
    for page in [ROOT / "index.html", *sorted((ROOT / "reports").glob("*.html"))]:
        s = page.read_text()
        m = re.search(r'<ul class="nav__links".*?</ul>', s, re.S)
        if m and 'href="/detours/"' not in m.group(0):
            li = re.search(r'( *)<li><a class="nav__link[^"]*" href="/?#analytics">', m.group(0))
            if li:
                block = m.group(0).replace(li.group(0), li.group(1) + nav_li + "\n" + li.group(0), 1)
                s = s.replace(m.group(0), block, 1)
                page.write_text(s)

    home = ROOT / "index.html"
    s = home.read_text()
    start, end = "<!-- detours:latest -->", "<!-- /detours:latest -->"
    if start not in s:
        anchor = "        </ol>\n      </div>\n    </section>\n\n    <section class=\"section section--white\" id=\"experience\""
        if anchor not in s:
            sys.exit("Could not find the career map to attach the Detours list")
        s = s.replace(anchor, "        </ol>\n        " + start + end + "\n      </div>\n    </section>\n\n    <section class=\"section section--white\" id=\"experience\"", 1)
    items = "".join(f'<li><a href="/detours/{p["slug"]}/"><span>No. {p["number"]}</span>{html.escape(p["title"])}</a></li>' for p in posts[:3])
    inner = ('\n        <div class="detours-latest reveal"><div><p class="eyebrow">Detours, a weekly column</p>'
             '<p class="detours-latest__lede">The story behind each turn, with the data that says a path like this is normal.</p>'
             f'<a class="btn btn--outline btn--sm" href="/detours/"><i data-lucide="book-open"></i>Read Detours</a></div>'
             f'<ol class="detours-latest__list">{items}</ol></div>\n        ')
    home.write_text(replace_block(s, start, end, inner))

    kb = ROOT / "chat-widget/assets/chat/system.md"
    k = kb.read_text()
    ks, ke = "<!-- detours:kb -->", "<!-- /detours:kb -->"
    lines = "\n".join(f'- "{p["title"]}" (No. {p["number"]}): https://tonyabdelmalak.com/detours/{p["slug"]}/ ({p["dek"]})' for p in posts[:8])
    block = ("\n## Detours (my weekly column)\nI write a weekly column called Detours: notes from a career that didn't go in a straight line, "
             "at https://tonyabdelmalak.com/detours/. When a question touches one of these, point to the post. "
             "Only describe a post using its title and summary below.\n" + lines + "\n")
    if ks not in k:
        k = k.rstrip() + "\n\n" + ks + ke + "\n"
    kb.write_text(replace_block(k, ks, ke, block))
    print(f"Published. Latest: No. {posts[0]['number']} {posts[0]['title']}")


if __name__ == "__main__":
    main()
