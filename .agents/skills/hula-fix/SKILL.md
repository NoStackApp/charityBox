---
name: hula-fix
description: Fix gaps or bugs on a PR branch in an isolated worktree — your working tree is never touched. Use when the user describes a problem to fix on a PR.
disable-model-invocation: true
argument-hint: <problem description> or <owner/repo#N> <problem description>
allowed-tools: Bash Read
---

You are an expert code fixer for the HubLaunch project, responsible for applying fixes to issues in isolated Git worktrees while the main working tree remains untouched.

## Instructions

Your job is to:

1. **Auto-detect issue number** from chat history (or accept explicit issue #)
2. **Fetch issue details** if this is a fresh chat
3. **Validate** the issue is tracked and has a PR
4. **Create or reuse an isolated worktree** (path determined by config, output by setup script)
5. **Store session info** in `.hublaunch/.fix-sessions/issue-<N>.json`
6. **Apply fixes** inside the worktree using full chat context
7. **Auto-commit and push** from within the worktree

The main working tree is **never modified** — all file edits happen inside the worktree.

## Input Format

```
/hula-fix <problem-description>
```

Or with explicit issue number (for fresh chat/new machine):
```
/hula-fix YizYah/hub-launch#42 <problem-description>
```

Examples:
- `/hula-fix the button color is wrong` (uses issue from chat history)
- `/hula-fix YizYah/hub-launch#42 the validation is broken` (explicit issue #)

User input: $ARGUMENTS

## Workflow

### Step 1: Detect Issue Number

**Priority 1: Check user input for explicit issue number**
- Look for pattern: `YizYah/hub-launch#\d+` or `#\d+` in user input
- If found, extract and use this issue number

**Priority 2: Check chat history for automatic detection**
- Look for previous `/hula-launch` output in THIS chat (also recognize legacy `/hula-create` output)
- Parse text like: "Launched issue YizYah/hub-launch#42" or "Created issue YizYah/hub-launch#42"
- Also check HTML comment: `<!-- hula-issue: 42 -->` (emitted by both `/hula-launch` and `/hula-create`)

**If no issue found**:
```
❌ No issue number found. Please provide one:

Usage: /hula-fix YizYah/hub-launch#42 <problem-description>

Example: /hula-fix YizYah/hub-launch#42 the button validation is broken
```

Stop execution here. Do not proceed.

### Step 2: Setup Worktree and Session (Script)

Run the setup script — it handles issue lookup, validation, worktree creation, and session file writing in one terminal approval:

```bash
hula script fix-setup -- <issue-number>
```

The script outputs JSON with `status`, `issueTitle`, `prBranch`, `worktreePath`, and `sessionFile`.

Parse the JSON output:
- If `status` is `"error"`, display the `message` and stop.
- If `status` is `"success"`, extract `worktreePath` and `prBranch` for later steps.

Display based on output:
```
📋 Issue #42: <issueTitle>
🌳 Fix worktree ready at: <worktreePath>
```

Also emit in chat output:
```
<!-- hula-fix-session: {"issueNumber": 42, "worktreePath": "<worktreePath>", "prBranch": "<prBranch>"} -->
```

### Step 7: Clarify Problem if Needed

If the problem description is vague or unclear, ask:
```
I need more details about what to fix:

1. What specific behavior is wrong?
2. What should the correct behavior be?
3. Are there any error messages?
4. Which file or component is affected?
```

Wait for user response before proceeding.

### Step 8: Apply Fixes

**IMPORTANT**: All edits must target files inside the worktree path.

Switch your working context:
```bash
cd <worktreePath>
```

Where `<worktreePath>` is the path returned by `hula script fix-setup` in Step 2.

Apply fixes using the edit tool, making sure file paths are relative to (or inside) the worktree directory.

**Best Practices**:
- Make minimal, surgical changes
- Follow existing code patterns
- Consider edge cases

Progress display:
```
🔧 Analyzing codebase for <problem>...
📝 Found issue in: src/path/to/file.ts
✏️  Applying fix...
✅ Fix applied successfully
```

### Step 9: Auto-Commit and Push (Script)

Generate a commit message based on the issue number, files changed, and nature of changes, then run the commit script (one terminal approval):

```bash
hula script fix-commit -- <issue-number> "fix(#42): <generated-message>"
```

The script outputs JSON with `status`, `commitMessage`, and `filesChanged`.

Parse the JSON output:
- If `status` is `"error"`, display the `message` and stop.
- If `message` is `"Nothing to commit"`, display:
  ```
  ℹ️  Nothing to commit.
  ```
- If `status` is `"success"` and changes were committed, display:
  ```
  ✅ Changes committed: "<commitMessage>"
  🚀 Pushed to remote
  ```

### Step 10: Next Steps

```
✅ Fixes applied and pushed successfully!

Worktree: <worktreePath>
Branch:   <pr-branch>

Next steps:
- Review the changes in the PR
- Run tests if needed
- When ready to merge: /hula-approve
```

## Error Handling

| Scenario | Error Message |
|----------|---------------|
| No issue in chat/input | "No issue number found. Please provide one: `/hula-fix YizYah/hub-launch#42 <problem>`" |
| Issue not tracked | "Issue #X is not tracked. Run: hula track <issue-number>" |
| No PR for issue | "No PR found for issue #X. Run: hula checkout <issue-number>" |
| Worktree creation fails | "Failed to create worktree: <error>. Check that the PR branch exists." |
| Commit fails | "Failed to commit changes: <error>" |
| Push fails | "Failed to push changes: <error>. Retry with: git push (inside worktree)" |

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

## Important Notes

### Worktree Isolation

- The main working tree is **never modified** by `/hula-fix`
- The user can continue `/hula-plan` on `main` while a fix session is active
- Multiple fix sessions can coexist (each has its own worktree directory)
- If the worktree already exists for an issue, it is **reused** (supports resume)

### Worktree Naming

Format: `<worktreeBasePath>/hula/<repo-name>/fix-<issue-number>`

The `worktreeBasePath` is read from `hublaunch.config.js` (default: `.hula-worktrees`, resolved relative to repo root). This ensures:
- Cross-repo isolation (different repos won't collide)
- Per-issue isolation (multiple issues can be fixed in parallel)

### Terminal Commands

All terminal commands after worktree creation should be run inside the worktree:
```bash
cd <worktreePath>
# then run git commands, tests, etc.
```

## Success Criteria

- ✅ Issue number auto-detected from chat or explicit input
- ✅ Worktree created at `<worktreePath>` (path from setup script output)
- ✅ Session stored in `.hublaunch/.fix-sessions/issue-<N>.json`
- ✅ All edits applied inside the worktree
- ✅ Main working tree untouched
- ✅ Changes committed and pushed from worktree
- ✅ Clear next steps provided
