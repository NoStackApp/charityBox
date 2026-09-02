---
name: hula-approve
description: "Approve (step 2 of 2): merge the verified PR and clean everything up — branches, worktrees, and your local main. Use when the user approves the work or asks to merge, complete, or close a PR."
disable-model-invocation: true
argument-hint: "[issue-number]"
allowed-tools: Bash Read
---

You are an expert PR merger for the HubLaunch project. You handle two scenarios automatically:

- **Local session merge**: A `/hula-fix` session exists with a local worktree — commit, push, merge, then clean up.
- **Remote-only merge**: No local session/worktree (e.g. the PR was created remotely by the implementation agent via `/hula-launch`, by another contributor, or a previous session was cleaned up) — merge the PR directly via GitHub.

You detect which path to take automatically. The user never needs to specify.

## Instructions

Your job is to:

1. **Detect merge path** — check for local fix session + worktree, or fall back to remote-only
2. **If local session exists**: commit/push changes, merge PR, clean up worktree + session
3. **If remote-only**: merge PR directly via `hula approve`
4. **Report results**

The main working tree is **never modified** — all local operations happen in the fix worktree (if one exists).

User input: $ARGUMENTS

## Workflow

### Step 1: Determine Issue Number

**Priority 1: Check chat history**

- Look for `<!-- hula-fix-session: {...} -->` from previous `/hula-fix` command
- Parse JSON to get: `issueNumber`, `worktreePath`, `prBranch`

**Priority 2: Check user input**

- Look for explicit issue number in the `/hula-approve` invocation (e.g. `/hula-approve 42` or `/hula-approve #42`)
- Look for pattern: `YizYah/<repo>#\d+` or `#\d+` in user input

**Priority 3: Check tracked issues**

- Run `hula view` to list tracked issues
- If only one tracked issue has an open PR, use it automatically
- If multiple, ask user to select

**If no issue found**:

```
❌ No issue number found.

Usage:
- /hula-approve (auto-detect from fix session or tracked issues)
- /hula-approve 42 (explicit issue number)
```

Stop execution here. Do not proceed.

### Step 2: Detect Merge Path

Once you have the issue number, determine which merge path to use:

**Check 1: Look for session file**

- Check if `.hublaunch/.fix-sessions/issue-<N>.json` exists
- If found, parse it to get `worktreePath` and `prBranch`

**Check 2: Verify worktree exists (only if session was found)**

```bash
git worktree list --porcelain | grep "<worktreePath>"
```

**Decision logic:**

| Session file exists? | Worktree exists? | Path                                                   |
| -------------------- | ---------------- | ------------------------------------------------------ |
| Yes                  | Yes              | **Path A: Local session merge**                        |
| Yes                  | No               | **Path B: Remote-only merge** (clean up stale session) |
| No                   | N/A              | **Path B: Remote-only merge**                          |

Display the detected path:

- Path A: `ℹ️  Local fix session found — will commit, push, merge, and clean up worktree.`
- Path B: `ℹ️  No local session — will merge PR directly on GitHub.`

---

## Path A: Local Session Merge

Follow this path when a fix session AND its worktree both exist.

### Step A1: Check for Changes in Worktree

Run inside the worktree:

```bash
cd <worktreePath>
git status --porcelain
```

**If output is empty**: skip Step A2, proceed directly to Step A3 (the script handles the no-changes case gracefully).

Display: "ℹ️ No changes to commit, proceeding to merge..."

**If output has changes**: proceed to Step A2.

### Step A2: Ask About Running Tests

Detect test command from `package.json` (look for: `test`, `typecheck`, `lint`).

```
You have uncommitted changes ready to commit.

Would you like to run tests before pushing? (y/n)

Suggested test command: npm test
```

**If yes**: run tests inside the worktree (`cd <worktreePath> && npm test`).

- If tests fail: show error and ask if they want to proceed anyway.

**If no**: proceed to Step A3.

### Step A3: Commit, Push, Merge, and Clean Up (Script)

Generate a commit message based on the issue number, files changed, and nature of changes, then run the local-merge script — it handles commit, push, merge, worktree removal, and session cleanup in one terminal approval:

```bash
hula script approve-local -- <issue-number> "<worktreePath>" "fix(#42): <generated-message>"
```

The script outputs JSON with `status`, `committed`, `filesChanged`, `worktreeRemoved`, and `sessionCleaned`.

Parse the JSON output:
- If `status` is `"error"`, display the `message` and stop. The session is preserved so you can retry.
- If `status` is `"success"`, proceed to Step A4.

Display based on output:
- If `committed` is `true`:
  ```
  ✅ Changes committed: "<commitMessage>"
  🚀 Pushed to remote
  ```
- If `filesChanged` is `0`:
  ```
  ℹ️  No changes to commit, proceeding to merge...
  ```
- Always display:
  ```
  🔀 Merged PR for issue #42 ✅
  🧹 Removed fix worktree: <worktreePath>
  🧹 Cleaned up session file
  ```

### Step A4: Delete Local Branch

After the script completes successfully, delete the local branch:

```bash
git branch -D <prBranch>
```

- If the above fails (branch still held by worktree ref), it was removed with the worktree — skip silently.

Display:

```
🧹 Deleted local branch: <prBranch>
```

Or if already gone:

```
ℹ️  Local branch already removed with worktree
```

### Step A5: Success Summary

```
✨ Merge completed successfully!

Summary:
- Committed and pushed changes from worktree ✅
- Merged PR for issue #42 ✅
- Closed issue #42 ✅
- Removed fix worktree ✅
- Deleted local branch: <prBranch> ✅

Main working tree was never modified. You're ready for the next task!
```

---

## Path B: Remote-Only Merge

Follow this path when no local fix session/worktree exists. This is the common path when:

- The implementation agent (Claude Code via `/hula-launch`) created and worked on the PR remotely
- Another contributor submitted the PR
- A previous `/hula-fix` session was already cleaned up
- The user ran the legacy `/hula-create` flow

### Step B1: Remote-Only Merge and Cleanup (Script)

Run the remote-merge script — it merges the PR directly on GitHub and cleans up any stale session file in one terminal approval:

```bash
hula script approve-remote -- <issue-number>
```

The script outputs JSON with `status`, `issueNumber`, `sessionCleaned`, and `localUpdated`.

The script captures the `hula approve` CLI output and streams it to your terminal,
so the **specific reason and remediation** for any skipped local update appears
above the JSON line. Read it — that's the source of truth for what happened.

Parse the JSON output:
- If `status` is `"error"`, display the `message` and stop.
- If `status` is `"success"`, proceed through the display below, then Step B2a.

Display:
- If `sessionCleaned` is `true`: `🧹 Cleaned up stale session file`
- Based on the `localUpdated` field:
  - If `localUpdated` is `true`:
    ```
    ✓ Local main updated to latest origin
    ```
  - If `localUpdated` is `false`:
    ```
    ⚠️  Could not update local main (uncommitted changes, different branch, or git config issue)
    See the output above for the specific reason and how to fix it.
    ```

### Step B2a: About Local Main Update

The local main branch may not be fast-forwarded after the remote merge if:

- Your project root has uncommitted changes (skipped to avoid disrupting your work)
- Your project root is checked out on a different branch (not the default)
- The git repository has a non-standard/multi-worktree configuration
- `git pull --ff-only` could not fast-forward (e.g. network issue or diverged history)

This is non-critical — the PR is already merged on GitHub. When skipped, the CLI
output above shows the exact reason and the command to run to fix it.

### Step B2b: Delete Local Branch (if applicable)

Check whether the branch exists locally:

```bash
git branch --list <prBranch>
```

**If the branch exists locally:**

1. Check current branch:
   ```bash
   git rev-parse --abbrev-ref HEAD
   ```
2. If currently on the branch, detect default branch and switch first:
   ```bash
   gh repo view --json defaultBranchRef --jq ".defaultBranchRef.name"
   git checkout <defaultBranch>
   ```
3. Delete the local branch:
   ```bash
   git branch -D <prBranch>
   ```
   Display: `🧹 Deleted local branch: <prBranch>`

**If the branch does not exist locally:**

Display: `ℹ️  No local branch to clean up`

### Step B3: Success Summary

Tailor the summary to what actually happened — in particular, the local main
line depends on the `localUpdated` field from Step B1.

```
✨ Merge completed successfully!

Summary:
- Merged PR for issue #42 on GitHub ✅
- Closed issue #42 ✅
- Deleted local branch: <prBranch> ✅  (or: No local branch to clean up)
- [IF localUpdated == true]  Local main updated to latest origin ✅
- [IF localUpdated == false] ⚠️  Local main was NOT updated — see the reason above.

No local worktree was involved — PR was merged directly on GitHub.
```

---

## Error Handling

### Merge Conflicts

```
❌ Merge conflict detected!

The PR has conflicts with the base branch.

Options:
1. Resolve conflicts via GitHub PR web UI
2. If local worktree exists: resolve in worktree at <worktreePath>
3. Run /hula-approve again after resolving
```

### CI Checks Failing

```
⚠️  CI checks are failing for this PR.

Failing checks: <list>

Options:
1. Wait for checks to pass
2. Investigate failures on GitHub
3. Proceed anyway? (y/n)
```

### Commit Fails (Path A only)

```
❌ Failed to commit changes: <error>

Ensure git user.name and user.email are configured.
```

### Push Fails (Path A only)

```
❌ Failed to push changes: <error>

Try: cd <worktreePath> && git push
```

### Merge Command Fails

```
❌ Failed to merge PR: <error>

Check the PR on GitHub: <PR-URL>
```

For Path A: `Session preserved — run /hula-approve again after resolving.`
For Path B: `Run /hula-approve again after resolving.`

## Important Notes

### Adaptive Path Detection

The merge command automatically detects whether to use the local worktree path or remote-only path. Users do not need to specify which mode to use. The detection is based on:

1. Presence of `.hublaunch/.fix-sessions/issue-<N>.json`
2. Whether the worktree at the recorded path still exists

This covers all scenarios:

- `/hula-fix` → `/hula-approve` on the same machine (Path A)
- The implementation agent created the PR on GitHub via `/hula-launch` (Path B)
- Another contributor's PR (Path B)
- Previous fix session already cleaned up (Path B)

### Worktree Cleanup on Success (Path A)

The fix worktree is removed after a successful merge. This:

- Frees disk space
- Removes the now-merged branch reference
- Keeps the list of active worktrees clean

On failure, the worktree is preserved so you can:

- Fix issues and retry `/hula-approve`
- Manually clean up with: `git worktree remove "<path>" --force`
- Or: `hula worktree cleanup`

### Session File Lifecycle

- Created by `/hula-fix`
- Preserved if `/hula-approve` fails (so you can retry)
- Deleted after successful merge OR cleaned up if stale (worktree missing)

## Session File Format

`.hublaunch/.fix-sessions/issue-42.json`:

```json
{
  "issueNumber": 42,
  "worktreePath": "<worktreePath>",
  "prBranch": "fix/issue-42-button-color",
  "localName": "fix button color",
  "startedAt": "2025-12-22T14:30:00.000Z"
}
```

## Success Criteria

- ✅ Automatically detects local session vs remote-only merge path
- ✅ Path A: Changes committed and pushed from within the fix worktree
- ✅ Path A: Tests run if user requests (and changes exist)
- ✅ Path A: Fix worktree removed after successful merge
- ✅ Path A: Session file cleaned up
- ✅ Path A: Local branch deleted after worktree removal
- ✅ Path B: PR merged directly on GitHub without any local branch/worktree operations
- ✅ Path B: Stale session files cleaned up if present
- ✅ Path B: Local branch deleted if it existed locally
- ✅ Path B: Local main update status reported accurately (updated, or skipped with reason)
- ✅ PR merged successfully (both paths)
- ✅ Issue closed automatically (both paths)
- ✅ Main working tree never modified (both paths)
- ✅ Graceful error handling for conflicts, CI failures, pending reviews
