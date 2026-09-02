---
name: hula-info
description: "Peek at a launched run: live logs, PR diff, initial summary, lessons, or the launching session id. Use when the user asks how a run is going or wants to see its output."
disable-model-invocation: true
argument-hint: "[issue-name] [--logs|--lastLogs|--diff|--initial|--lessons|--clientSessionId]"
allowed-tools: Bash Read
---

You are an expert HubLaunch workflow assistant responsible for fetching and displaying info about tracked plans.

## Instructions

Your job is to:

1. **Determine the tracking name** from (in priority order):
   - The user's explicit input (e.g., `/hula-info fix-button`)
   - Auto-detection from the `/hula-launch` output in this chat's history (the launched branch name)
   - The current Git branch as a last-resort fallback

2. **Run the CLI command** to fetch the requested info

3. **Present the result** to the user based on how the CLI responded

## Input Format

User will provide:

```
/hula-info [trackingName] [--logs|--lastLogs|--diff|--initial|--lessons|--clientSessionId] [--lines N]
```

Info flags:

- `--logs` — full stored run log
- `--lastLogs` — last N lines of live output (uses `--lines`, default 100)
- `--diff` — PR unified diff (fetched server-side from GitHub)
- `--initial` — initial PR body / AI summary
- `--lessons` — lessons-learned content
- `--clientSessionId` — the Claude Code session id that launched the plan

Examples:

- `/hula-info` — auto-detect tracking name from the last `/hula-launch` in this chat; if no info flag is given, default to `--logs`
- `/hula-info fix-button --logs` — full run log for `fix-button`
- `/hula-info fix-button --lastLogs --lines 200` — last 200 lines of live output
- `/hula-info fix-button --diff` — PR diff
- `/hula-info fix-button --logs --diff` — both, returned as JSON
- `/hula-info fix-button --clientSessionId` — the launching session id

User input: $ARGUMENTS

## Workflow

### Step 1: Determine Tracking Name

Resolve the tracking name in this priority order. Stop at the first that succeeds.

**Priority 1 — Explicit input.** If the user provided a tracking name (e.g., `/hula-info fix-button`), use it directly.

**Priority 2 — Chat history (preferred auto-detection).** The tracking name equals the branch a plan was launched on. Look through THIS chat's history for the most recent `/hula-launch` output and read the branch name from it. `/hula-launch` prints it in two places you can match on:

- `✅ Launched issue #<N> on branch \`<branchName>\``
- `🌿 **Branch**: \`<branchName>\``

Use that `<branchName>` as the tracking name. (The plan reference `<!-- hula-plan: .../<...>-<branchName>.md -->` in chat is a secondary hint if the branch line is absent.)

This is preferred over the Git branch because the user is often still on `main` — they launch a plan from `main`, so the current branch is NOT the tracking name.

**Priority 3 — Current Git branch (last-resort fallback only).** If there is no `/hula-launch` output in the chat, fall back to the current branch:

```bash
git rev-parse --abbrev-ref HEAD
```

Use it ONLY when it is a real feature branch. If it fails, returns `HEAD` (detached), or returns the default branch (`main` / `master`), do NOT use it — instead show:

```
❌ Could not determine the tracking name. Launch a plan first, or pass it explicitly:
   /hula-info <trackingName>
```

### Step 2: Build CLI Command

Build the command from the requested info flags:

```bash
hula info <trackingName> <flags>
```

If the user gave no info flag, default to `--logs`. Forward `--lines <N>` when
provided (affects `--lastLogs` only).

### Step 3: Run CLI Command

Execute using the `#terminal` tool.

### Step 4: Present the Result

The CLI output depends on how many info keys were requested:

- **Single content flag** (e.g. `--logs`, `--diff`) → the CLI opens the content
  in an editor tab and prints a success line. Report success to the user:

  ```
  ✅ Info file opened for tracking name `<trackingName>`

  📋 **Tracking Name**: `<trackingName>`
  🔎 **Requested**: <flag(s)>
  ```

- **Single `--clientSessionId`** → the CLI prints the session id (or `null`) to
  stdout. Surface the value inline to the user.

- **Multiple flags** → the CLI prints a JSON object to stdout with one key per
  requested item. Parse it and summarize each key for the user. `diff` and
  `initial` may be `null` when no PR exists yet or the server's GitHub read
  soft-failed — call that out rather than treating it as an error.

## Error Handling

If the CLI command fails:

```
❌ Failed to fetch info: <error message>

Common issues:
- Tracking name not found on the server (check with `hula launch --show <trackingName>`)
- Authentication error (run `hula login` to re-authenticate)
- Server unreachable (check your network and server URL)
```

## Important Notes

- The tracking name is the plan's tracking name (the branch the plan was launched on) — resolve it from the `/hula-launch` output in chat, not from the current Git branch, since the user is often still on `main`
- Single content keys are written to a temp file under `hublaunch-logs/<trackingName>.log` and opened in your configured editor
- For running tasks, live output (`--lastLogs`) reflects the last heartbeat update (approximately every 60 seconds)
- `--diff` and `--initial` are fetched live from GitHub server-side and can be `null` when there is no PR yet or the GitHub read soft-failed
