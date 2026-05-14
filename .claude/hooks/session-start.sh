#!/bin/bash
# At session start, remind Claude to check open PRs via MCP GitHub tools.
# Outputs a system-level reminder that Claude sees at the top of each session.

cat <<'MSG'
SESSION START CHECKLIST — merlinman5/omegachess

1. Check open pull requests using mcp__github__list_pull_requests (owner: merlinman5, repo: omegachess, state: open).
2. For each open PR, check CI status using mcp__github__pull_request_read (method: get_status) and unresolved review comments using mcp__github__pull_request_read (method: get_review_comments).
3. Report the results concisely:
   - ✅ PR is CI-green with no unresolved review comments → flag as "READY TO MERGE"
   - ❌ CI failing → note which checks failed
   - 💬 Has unresolved review comments → note how many
4. If any PR is ready to merge, offer to merge it.

Do this check now, before responding to the user's first message.
MSG
