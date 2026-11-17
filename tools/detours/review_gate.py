"""Detours review gate. A post publishes only with a passing second review of its exact text.

  python3 tools/detours/review_gate.py record <post.md> --verdict CLEAN [--rounds N] [--approved]
  python3 tools/detours/review_gate.py check  <post.md>

Verdicts: CLEAN, NO_MUST_FIX, FIXES_NEEDED, HOLD (see _detours/REVIEW.md).
The fingerprint covers the title, dek, slug, facts, sources and body. status, date and number are
left out because publish.py sets them. Any other edit after the review invalidates it.
"""
import datetime as dt, hashlib, json, pathlib, re, sys
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
REVIEWS = ROOT / "_detours/reviews"
VERDICTS = ("CLEAN", "NO_MUST_FIX", "FIXES_NEEDED", "HOLD")
SKIP = ("status", "date", "number")


def fingerprint(path):
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", pathlib.Path(path).read_text(), re.S)
    if not m:
        sys.exit(f"{path}: missing front matter")
    fm = yaml.safe_load(m.group(1)) or {}
    keep = {k: v for k, v in fm.items() if k not in SKIP}
    blob = json.dumps(keep, sort_keys=True, default=str) + "\n" + m.group(2).strip()
    return fm, hashlib.sha256(blob.encode()).hexdigest()


def record_path(fm):
    return REVIEWS / f"{fm['slug']}.json"


def mode():
    s = yaml.safe_load((ROOT / "_detours/settings.yml").read_text()) or {}
    return s.get("mode", "approval")


def check(path):
    """Return (ok, reason)."""
    fm, digest = fingerprint(path)
    rp = record_path(fm)
    if not rp.exists():
        return False, "no second review recorded"
    rec = json.loads(rp.read_text())
    if rec.get("sha256") != digest:
        return False, "the post changed after its review; review it again"
    v = rec.get("verdict")
    if v == "CLEAN":
        return True, "CLEAN"
    if v == "NO_MUST_FIX" and mode() == "approval" and rec.get("approved"):
        return True, "no must-fix, approved by Tony"
    return False, f"review verdict {v}" + ("" if v != "NO_MUST_FIX" else " needs Tony's approval in approval mode")


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ("record", "check"):
        sys.exit(__doc__)
    cmd, path = sys.argv[1], sys.argv[2]
    if cmd == "check":
        ok, why = check(path)
        print(f"{'PASS' if ok else 'BLOCKED'}: {path}: {why}")
        sys.exit(0 if ok else 1)
    if "--verdict" not in sys.argv:
        sys.exit("record needs --verdict")
    verdict = sys.argv[sys.argv.index("--verdict") + 1].upper()
    if verdict not in VERDICTS:
        sys.exit(f"verdict must be one of {', '.join(VERDICTS)}")
    rounds = int(sys.argv[sys.argv.index("--rounds") + 1]) if "--rounds" in sys.argv else 1
    fm, digest = fingerprint(path)
    REVIEWS.mkdir(exist_ok=True)
    rec = {"slug": fm["slug"], "sha256": digest, "verdict": verdict, "rounds": rounds,
           "approved": "--approved" in sys.argv, "recorded": dt.date.today().isoformat()}
    record_path(fm).write_text(json.dumps(rec, indent=2) + "\n")
    print(f"Recorded {verdict} for {fm['slug']}")


if __name__ == "__main__":
    main()
