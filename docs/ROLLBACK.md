# Rollback plan

## Baseline (before the 2026-11 refresh)
- Site: commit `c567f05f41ad084b5880e71122603dd4c1b42aad`, kept as branch `pre-refresh-20261113` (this session's git proxy blocks tag pushes, so the marker is a branch pointing at the same commit).
- Chat worker `my-chat-agent`: original active version `89845427-17a1-4770-98af-0793a4167965` (used a revoked Groq key, so rolling back to it brings back the error). Known-good after the fix: `05f2fa63-0d8b-4d8e-b2e4-7fb01d49c18a`.

## Site (GitHub Pages builds from `main`)
Every deploy is one merge commit on `main`. To undo the latest deploy:
```
git checkout main && git pull
git revert -m 1 <merge-commit-sha>    # creates a commit that restores the previous tree exactly
git push origin main                   # Pages rebuilds in about a minute
```
Emergency full reset to the pre-refresh site: `git revert -m 1` each refresh merge, newest first, or open a PR from `pre-refresh-20261113`.

## Chat worker
Cloudflare dashboard → Workers & Pages → my-chat-agent → Deployments → `...` on the version to restore → **Rollback**. Secrets (GROQ_API_KEY etc.) are per version, so roll back only to versions created after 2026-11-14 00:38 UTC, when the new key was set.

The bot's facts and voice live in `chat-widget/assets/chat/system.md` and `about-tony.md` on `main` (the worker fetches them from raw GitHub, cached for 5 minutes), so a site revert also reverts the bot's knowledge.
