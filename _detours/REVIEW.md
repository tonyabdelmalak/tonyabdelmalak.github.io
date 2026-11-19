# Detours: the second review

Every Detours post gets an independent second review before Tony sees it and before it can publish.
The reviewer is separate from whoever drafted the post. It gets only the files below and this
checklist, never the drafter's notes or reasoning. Its job is to find problems, not to approve.

`tools/detours/publish.py` will not publish a post unless `tools/detours/review_gate.py` holds a
passing review for the exact text being published. Any edit after the review, even one word, means
the post must be reviewed again.

## What the reviewer reads

- The draft in `_detours/posts/`
- `_detours/RULES.md` and this file
- `_detours/story-bank.md` (the only allowed personal facts)
- The newest brief in `_detours/research/`
- Every published post in `_detours/posts/` (for voice and repeats)

It opens every source link itself. It never trusts the draft or the brief on a figure.

## Checklist

A. **True.** List every personal claim in the title, dek and body: role, employer, date, number,
event, decision, feeling, belief, scene, quote. Match each to a story-bank id. Must-fix: anything
not in the bank, anything that goes beyond its bank line (added emotion, detail, dialogue, people,
places, timing), anything that merges two facts into a new one, anything off limits under RULES.md.

B. **Figures.** Open each source. Confirm the exact figure is on the page and the post describes it
the same way: same population, measure, time period and unit, no rounding, no combining, no cause
the source does not claim. Confirm the link resolves and is the final URL, and the source is recent
(news within 90 days, research within 2 years unless it is the standard source). Confirm a fair
counterpoint is there when the data has one.

C. **Accurate.** Names and spellings (ReflectivAI, CareerPaver, Lumira, Apple, App Store, every
employer), dates, date math and timing words ("this week", "this month") checked against the publish
date. Every link returns 200.

D. **Launch-safe.** Check the launch constraints below against the publish date. Must-fix: anything
that announces an app before its launch, scoops a planned announcement, or calls an app available
when it is not.

E. **In Tony's voice.** Compare with the published posts and the voice notes below. Flag em or en
dashes; AI tells (the RULES.md list, "here's the thing", "the truth is", "let that sink in", stacked
rhetorical questions, tidy triplets, "not X, but Y", inspirational filler); stacked opinion tags ("my
read", "in my view", "my view is") used more than once; lines that are cheesy, preachy, salesy,
defensive or self-congratulatory; more than one joke; phrasing or angles reused from earlier posts.

F. **Impact.** Would a reader in any field, whether they are struggling or doing well, feel something
and take something away? Flag lines that are abstract or bland ("I don't feel anything when I read
it"), pronouns a reader could misread ("They come from the same place" after a list of people),
headings that don't say what the section is about, and a closing question that repeats wording
from the paragraph above or does not follow from the post.

G. **Shape.** 450 to 750 words; title 2 to 8 words; dek is one sentence; opens with a moment or a
question, not a statistic or definition; two or three `##` subheads; follows the format named in its queue line (only a Turn is built on
a new story-bank fact; other formats use his experience in one or two lines at most); one practical
takeaway usable this week; ends with one real question; no sign-off or call to action; lists only
for steps.

H. **Proofread.** Spelling, grammar, punctuation, repeated words within a few lines, clunky
sentences, tense consistency, front matter (status: draft, `facts:` matches what is used, every
number listed in a source's `figures:`).

## Voice notes (from Tony's own edits)

- He writes plainly and warmly, in short sentences, and sounds like a calm professional talking.
- His own phrases: "walk in ready", "the conversations that matter", "researching what to say and
  practicing saying it are two different things", "dipped a toe in, dabbled a little", "all in".
- He rejected: "My read is that they share one thread" and "Across both of my careers" (not how he
  talks), "They come from the same place" (ambiguous), "They're the tools I wish I'd had" on its own
  (flat; say what the tools let someone do).
- Concrete beats abstract: name what the reader can do (rehearse the questions and the pushback, get
  feedback without judgment) instead of describing a feeling in general terms.
- Use a word once where it matters most; don't repeat a strong word (pivot, adapt) in one section.

## Launch constraints (update when a launch happens)

- ReflectivAI: announced on the App Store Thu Nov 19, 2026. Before then, no App Store mention.
- CareerPaver: not announced or described as on the App Store until its own launch (planned Dec 8,
  2026, only if its search check passes).
- Lumira: never described as available until Tony says it has launched.
- Current plan: the "App Store Launch Rollout (Final)" doc. When in doubt, leave the App Store out.

## Output

- **Verdict:** CLEAN, FIXES NEEDED or HOLD (HOLD only if the post cannot stand once unsupported
  content is removed).
- **Findings,** numbered, each with severity (must-fix, should-fix, taste), the text quoted in 15
  words or fewer, the reason, and an exact replacement.
- **Claims map:** every sentence with a fact or number, its source (story-bank id or URL), verified
  yes or no.
- **For Tony to eyeball:** at most 3 judgment calls only he can make, or nothing.

## Recording the result

After the final round, record it against the exact text:

    python3 tools/detours/review_gate.py record _detours/posts/NN-slug.md --verdict CLEAN --rounds 2

- `CLEAN` lets the post publish in either mode.
- `NO_MUST_FIX` (findings left, none must-fix) can publish only in approval mode, and only with
  `--approved` once Tony has approved that exact text.
- `HOLD` or `FIXES_NEEDED` never publishes.
