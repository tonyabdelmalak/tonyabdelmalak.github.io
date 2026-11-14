"""Detours guardrail audit. Usage: python3 tools/detours/audit.py [post.md ...]
Fails (exit 1) on: em/en dashes, AI-giveaway phrases, stock lines, numbers not traceable to the
story bank or a cited source's `figures`, unknown story-bank fact ids, missing sources, wrong length,
off-limits topics. Run on every draft before it can be published."""
import re, sys, glob, pathlib, yaml
ROOT = pathlib.Path(__file__).resolve().parents[2]
BANK = (ROOT / "_detours/story-bank.md").read_text()
BANK_IDS = set(re.findall(r"^- ([SCT]\d+)\.", BANK, re.M))
BANNED = ["leverage", "unlock", "delve", "fast-paced", "game-changer", "game changer", "tapestry", "testament to",
          "navigate the landscape", "in today's", "let's dive", "dive in", "buckle up", "here's the kicker",
          "it's not just", "not only that", "embark", "journey of a lifetime", "synergy", "in my years recruiting",
          "as an ai", "i'm excited to share", "humbled", "thrilled to announce", "at the end of the day",
          "trust the process", "everything happens for a reason", "level up", "crushing it", "hustle"]
OFF_LIMITS = ["glaxo", "gsk", "husband", "partner and i", "my partner", "wife", "kids", "children", "revenue",
              "investor", "funding", "salary was", "users signed", "customers", "diagnos", "therapy"]
NUM = re.compile(r"(?<![\w.])\d+(?:,\d{3})*(?:\.\d+)?%?")
def check(path):
    txt = pathlib.Path(path).read_text()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", txt, re.S)
    if not m: return [f"{path}: missing front matter"]
    fm, body = yaml.safe_load(m.group(1)), m.group(2)
    errs, low = [], body.lower()
    full = (fm.get("title", "") + " " + fm.get("dek", "") + " " + body)
    for ch, name in (("—", "em dash"), ("–", "en dash")):
        if ch in full: errs.append(f"{name} found")
    for w in BANNED:
        if w in full.lower(): errs.append(f"AI-giveaway phrase: '{w}'")
    for w in OFF_LIMITS:
        if re.search(r"\b" + re.escape(w), full.lower()): errs.append(f"off-limits topic: '{w}'")
    for k in ("title", "dek", "slug", "facts", "sources"):
        if not fm.get(k): errs.append(f"front matter missing '{k}'")
    for fid in fm.get("facts") or []:
        if fid not in BANK_IDS: errs.append(f"unknown story-bank id {fid}")
    figures = set()
    for s in fm.get("sources") or []:
        if not str(s.get("url", "")).startswith("https://"): errs.append(f"source without https url: {s}")
        figures |= {str(f) for f in s.get("figures", [])}
    for f in figures:
        if f.lower() not in full.lower(): errs.append(f"source figure '{f}' listed but not used")
    for n in NUM.findall(full):
        bare = n.rstrip("%")
        if n in figures or bare in figures: continue
        if re.search(r"(?<![\d.])" + re.escape(bare) + r"(?!\d|\.\d)", BANK): continue
        if n in ("1", "2"): continue  # list numbering
        errs.append(f"number '{n}' not in story bank or source figures")
    words = len(re.findall(r"\b\w+\b", body))
    if not 350 <= words <= 900: errs.append(f"length {words} words (want 350 to 900)")
    if not body.rstrip().endswith("?"): errs.append("should close with a real question")
    if len(re.findall(r"^\s*[-*] ", body, re.M)) > 5: errs.append("too many bullets for a column")
    return [f"{path}: {e}" for e in errs]
if __name__ == "__main__":
    files = sys.argv[1:] or sorted(glob.glob(str(ROOT / "_detours/posts/*.md")))
    errs = [e for f in files for e in check(f)]
    print("\n".join(errs) if errs else f"Detours audit passed: {len(files)} post(s)")
    sys.exit(1 if errs else 0)
