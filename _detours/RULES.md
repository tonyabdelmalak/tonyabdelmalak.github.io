# Detours: writing and publishing rules

Detours is Tony Abdelmalak's weekly column on tonyabdelmalak.com/detours:
"Notes from a career that didn't go in a straight line." It pays it forward: real lessons from his
path (pharma sales, recruiting and HR, people analytics, building AI products), backed by published
data that shows a nonlinear path is normal. It must sound like Tony: real, professional, warm.
Never cheesy, corny, preachy or fluffy.

## Facts (hard rules, enforced by tools/detours/audit.py)

1. Personal facts come only from `_detours/story-bank.md`. List the ids you used in `facts:`.
   If a detail is not in the story bank, it does not go in the post. No invented scenes, quotes,
   people, conversations, dates, places, feelings or anecdotes.
2. Opinions and lessons are allowed when framed as Tony's view ("my read", "what I'd tell you").
3. Every statistic comes from a credible, current, linkable source (government data, peer-reviewed
   research, LinkedIn Economic Graph, major research firms, reputable outlets). Open each source in a
   browser and confirm the exact figure is on the page. Put every number you use in that source's
   `figures:` list. Never round, combine or reinterpret a figure. Use the source's final URL after redirects.
4. Include a fair counterpoint when the data has one (for example, a stigma that still exists).
5. Off limits: anything not public on his LinkedIn or confirmed in the story bank, other employers,
   family, relationships, health, money, funding, revenue, user numbers, internal product decisions.

## Voice

- First person, plain and direct. Short sentences. Concrete over abstract.
- Calm confidence. Warm, never defensive. Light, dry humor at most once.
- No em dashes or en dashes. No AI tells ("leverage", "unlock", "delve", "in today's", "game changer",
  "it's not just X, it's Y", "here's the kicker", "embark", "testament"). No hashtags, no emoji.
- Vary how career references are phrased. Never reuse a stock line such as "In my years recruiting".
- No hype about the products. Mention one only when it is the natural end of the thread, once.

## Shape (every post)

- 450 to 750 words. A title of 2 to 8 words. A one-sentence dek.
- Open with the moment or question, not with a definition or a statistic.
- One personal turn from the story bank, told honestly.
- One or two published figures that show the path is normal, with the fair counterpoint.
- One practical takeaway the reader can use this week.
- Close with one real question to the reader. No sign-off, no call to action.
- Two or three `##` subheads. Lists only when they are steps.

## Research brief

Before drafting, read the newest file in `_detours/research/`. Prefer its verified figures. You may still add a figure you verify yourself the same way.

## Topics

Take the next unused topic from `_detours/queue.md`, then mark it used with the post number.
Never repeat an angle already published; read the existing posts first.

## Publishing

`_detours/settings.yml` sets `mode`:
- `approval`: draft, audit, show Tony the full draft in the session, and publish only after he
  types approval in that session. Apply his edits word for word, re-run the audit, then publish.
  Do not commit a draft to the public repo before he approves it.
- `auto`: draft, audit, publish, then send Tony the link. Hold and notify him instead if the audit
  fails twice, a source cannot be verified, or a needed fact is missing from the story bank.

Publish with `python3 tools/detours/publish.py <post-file>`, then deploy as one merge with the
tested revert, and run `python3 tools/audit/audit.py https://tonyabdelmalak.com` after it is live.

Commit messages: plain and short. No Co-Authored-By, Claude-Session or any other mention of Claude, AI or a tool, in commits, pull requests or anywhere in the repo.
