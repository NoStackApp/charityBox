---
name: hula-schedule
description: Run or schedule autonomous actions on the server (e.g. a nightly harden audit) — author, list, update, or cancel them in plain language. Use for recurring or one-off background actions.
disable-model-invocation: true
argument-hint: <action | description | list | show <id> | run now <id> | cancel <id> | update ...> [on <entry-point>] [outcome pr|plan|feedback] [schedule <when>] [pr-policy always|skip-if-open|close-previous]
allowed-tools: Bash Read Write Edit
---

You are an expert HubLaunch workflow assistant. You turn the user's free-form
request into the right `hula schedule` operation — running or scheduling an
action, authoring a new action file from a description, or managing existing
runs and schedules — running everything through wrapper scripts and confirming
any cron expression before sending it.

## Step 0: Intent routing

Classify `$ARGUMENTS` (and recent chat context) into exactly one mode:

- **`run-existing`** — the input names an existing action:
  - contains a `/`, ends in `.md`, or is an `https://` URL → `--action-path`.
  - is a bare word naming a built-in (e.g. `harden`) → `--built-in`.
- **management verb** — the input begins with or clearly expresses one of:
  - `list` / "list runs" / "list schedules" → **`list`**
  - `show <id>` → **`show`**
  - `run now <id>` / "run <id> now" → **`run-now`**
  - `cancel <id>` / `delete <id>` / `pause <id>` → **`cancel/delete`**
    (there is no pause/resume — "pause" means cancel).
  - `update …` → **`update-skill-file`** or **`update-cron`** (see below).
- **`create-from-description`** — anything else: a plain-language description of
  what the action should do.

**Ambiguity rule (mandatory):** If the input could be either an existing action
or a description (e.g. a single word like `harden` that might be a built-in name
OR a thing to do), **ask the user which they intend** before proceeding. Never
guess between "run an existing action" and "create a new one". Likewise, if an
`update` request does not clearly indicate the skill file vs the cron, ask which.

---

## Mode: run-existing (unchanged behavior)

### Step 1: Extract arguments

- **Action selector (exactly one):** `--built-in <name>` or `--action-path <path>`.
- **Entry point (optional):** `--entry-point <path>` — the file, directory, or
  URL the action targets (e.g. `src/`). Phrases like "on src/", "against the src
  directory", or "target lib/" indicate the entry point.
- **Outcome type (optional, default `pr`):** `--outcome-type <pr|plan|feedback>`.
  Map "open a PR" / "pull request" → `pr`; "make a plan" / "planning" → `plan`;
  "just feedback" / "review" / "report" → `feedback`. If the user names
  something else, ask which of `pr|plan|feedback` they mean.
- **Schedule (optional):** a human phrase or a raw cron string (see Cron table).
- **PR policy (optional, default `always`):** `--pr-policy <policy>` — controls
  what happens when a PR from a previous run of the *same action* is still open.
  This matters most for recurring schedules, which otherwise pile up near-identical
  PRs. Map the user's intent:
  - "close the old one(s)" / "replace the previous PR" → `close-previous`
  - "don't open a new one" / "reuse the existing PR" / "skip if already open" → `skip-if-open`
  - "always open a new PR" / no mention → `always` (default — omit the flag)
  For recurring schedules, `skip-if-open` is the sensible recommendation; only
  include the flag when the user expresses a deduplication intent.

### Step 2: Resolve the schedule (see Cron table below) and confirm it.

### Step 3: Stop conditions

- If neither a built-in name nor an action path can be determined, stop with:
  ```
  ❌ Action required. Usage: /hula-schedule <built-in name | action path | description | list | show <id> | run now <id> | cancel <id> | update ...>
  ```
- If BOTH a built-in name and an action path are detected, stop and ask which
  one they intend (the CLI rejects both).

### Step 4: Run the wrapper script

Run exactly one Bash command. Use `--built-in` OR `--action-path`, never both:

```bash
hula script schedule-run -- --built-in <name> [--entry-point <path>] [--outcome-type <type>] [--schedule "<cron>"] [--pr-policy <always|skip-if-open|close-previous>]
```

or, for a custom action file:

```bash
hula script schedule-run -- --action-path <path> [--entry-point <path>] [--outcome-type <type>] [--schedule "<cron>"] [--pr-policy <always|skip-if-open|close-previous>]
```

Pass only the flags you resolved. Quote the cron expression. Only include
--pr-policy when the user expressed a deduplication intent (see Step 1). Then
report the result (see **Reporting run/schedule results**).

---

## Mode: create-from-description

The user described what they want done but did not supply an existing action.

**Read `hula instructions skill-creation` and follow it exactly.** In
summary it has you: ask clarifying questions first (then STOP), confirm the
action name, resolve+confirm any cron, write a free-form instruction markdown
file to `.hublaunch/skills/<YYYY-MM-DD-HH:MM-slug>.md`, **publish it to
origin/main BEFORE running** via
`hula script schedule-manage -- --publish-skill <path>` (abort if
that returns `status:"error"`), then run/schedule it with
`hula script schedule-run -- --action-path <path> …`, and report the
created file path plus the run/schedule result.

---

## Mode: list

Run via the management wrapper:

- `list` (no qualifier) → show **both** recent runs and active schedules:
  ```bash
  hula script schedule-manage -- --list
  hula script schedule-manage -- --list-schedules
  ```
- "list runs" → only `--list`. "list schedules" → only `--list-schedules`.

Display the `cliOutput` from each result.

## Mode: show

```bash
hula script schedule-manage -- --show <runId>
```

Display the `cliOutput`.

## Mode: run-now

```bash
hula script schedule-manage -- --run-now <scheduleId>
```

Report the new run id (`runId`) from the JSON, falling back to `cliOutput`.

## Mode: cancel/delete (with guarded file removal)

1. Cancel the schedule:
   ```bash
   hula script schedule-manage -- --cancel-schedule <scheduleId>
   ```
2. If the cancelled schedule referenced an `actionPath` under
   `.hublaunch/skills/`, **ask the user whether to also delete that file.**
3. If they opt in, FIRST verify no other active schedule still uses it:
   ```bash
   hula script schedule-manage -- --list-schedules
   ```
   - If another active schedule references the same `actionPath`, **refuse** and
     report which schedule id(s) still use it. Leave the file on the branch.
   - Otherwise delete it:
     ```bash
     hula script schedule-manage -- --delete-skill <actionPath>
     ```

## Mode: update-skill-file

The user wants to change *what the action does* (its instructions), not the
schedule.

1. Locate the action file: from the schedule's `actionPath`
   (via `--list-schedules`), or a path the user names. It must be under
   `.hublaunch/skills/`.
2. Apply the requested change to the working-tree copy with `Edit` (or rewrite
   it with `Write` for a large change), keeping the free-form template format.
3. Re-publish it:
   ```bash
   hula script schedule-manage -- --publish-skill <actionPath>
   ```
4. No schedule change is needed. Inform the user that the **next scheduled run
   will use the updated content** (the server re-reads the file on every fire).

## Mode: update-cron

The user wants to change *when* a schedule fires. The server has no
update-schedule endpoint, so cancel + recreate on the same action:

1. Read the existing schedule's `actionPath` (or `builtIn`), `entryPoint`, and
   `outcomeType` via:
   ```bash
   hula script schedule-manage -- --list-schedules
   ```
2. Resolve the new cron and **confirm the readback** (see Cron table).
3. Cancel the old schedule, then recreate with the new cron on the **same**
   action:
   ```bash
   hula script schedule-manage -- --cancel-schedule <old-id>
   hula script schedule-run -- --action-path <same-path> [--entry-point <path>] [--outcome-type <type>] --schedule "<new-cron>"
   ```
   (Use `--built-in <name>` instead of `--action-path` if the schedule used a
   built-in.)
4. Report the new schedule id.

---

## Cron table (used by run/schedule and update-cron)

Translate a recurring phrase to a 5-field cron expression (case-insensitive,
tolerant of minor wording):

| Phrase | Cron |
| --- | --- |
| "every hour" / "hourly" | `0 * * * *` |
| "every 15 minutes" | `*/15 * * * *` |
| "every 30 minutes" | `*/30 * * * *` |
| "every day" / "daily" / "every night" / "nightly" | `0 3 * * *` |
| "every morning" | `0 9 * * *` |
| "every weekday" / "weekdays" (at 8am) | `0 8 * * 1-5` |
| "every Monday" (at 9am) | `0 9 * * 1` |
| "weekly" (Sunday midnight) | `0 0 * * 0` |
| "monthly" (1st, midnight) | `0 0 1 * *` |

Rules:

- If the user specifies an explicit time (e.g. "every day at 9pm"), adjust the
  hour/minute fields accordingly (`0 21 * * *`).
- If the user supplies a raw 5-field cron string, accept it as-is.
- **Always** print the resolved cron with a plain-English readback and confirm
  before sending, e.g.:
  ```
  Schedule → 0 3 * * * (every day at 3:00 AM)
  ```
  There is no client-side cron validation — confirmation is mandatory.
- If a phrase cannot be confidently mapped, ask the user to rephrase or supply a
  raw cron expression. Do NOT send an unverified guess.
- If no schedule is mentioned, the action runs once (omit `--schedule`).

---

## Reporting run/schedule results

Every wrapper prints a single JSON object to stdout. On any `status:"error"`,
display `❌ <message>` and stop.

- run (`kind:"run"`):
  ```
  ✅ Execute action queued

  🔖 **Run ID**: <runId>
  🔗 **PR**: <prUrl>   (omit this line if prUrl is empty)

  Check status with: /hula-schedule show <runId>
  ```
- schedule (`kind:"schedule"`):
  ```
  ✅ Schedule created

  🔖 **Schedule ID**: <scheduleId>
  ⏰ **Cron**: <cronExpr>

  Manage with: /hula-schedule list · /hula-schedule run now <scheduleId> · /hula-schedule cancel <scheduleId>
  ```

If an identifier is empty, fall back to showing the `cliOutput` field.

## Important Notes

- Do NOT pre-check credentials. The CLI resolves the LLM provider credential
  (claude | openai | openrouter) and GitHub token from flags/config/env and
  reports a clear error if any are missing; the wrappers surface it.
- Do NOT echo secrets.
- Generated action files live under `.hublaunch/skills/` and are committed to
  `origin/main` via a temporary worktree — never on the user's current branch.
- Never run `hula schedule` before a `--publish-skill` succeeds.
- Slack/webhook notifications are sent automatically when `updateNotificationUrl` is configured in `.hublaunch/hublaunch.config.js` — no extra flag needed in the skill. The CLI reads it from config on every run and forwards it to the server.
