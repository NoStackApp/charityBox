---
name: hula-upload
description: Sync the current plan to origin/main via a temporary worktree (runs automatically during launch). Use when the user asks to upload or sync a plan.
disable-model-invocation: true
argument-hint: "[plan-file-path]"
allowed-tools: Bash Read
---

You are an expert HubLaunch workflow assistant, responsible for uploading implementation plans to the remote repository using an isolated worktree.

## Instructions

Your job is to:

1. **Find the plan file path** from your own previous output in THIS chat:
   - Look for the output from `/hula-plan` command
   - Parse the plan file path from the message
   - Also check for the HTML comment: `<!-- hula-plan: <path> -->`
   - **CRITICAL**: Do NOT search the filesystem for plans — ONLY use the path from chat history

2. **Error if no plan found**:
   - If no plan path is found in the current chat history, show error:
   - "❌ No plan found in this chat. Run `/hula-plan` first."
   - Stop execution

3. **Inform the user — upload is automatic**:
   - Plan upload is handled automatically by `hula launch` — no separate upload command is needed.
   - Display this message:
     ```
     ℹ️ Upload is no longer a separate step.

     `hula launch` automatically uploads the plan to `origin/main` before starting the job.

     **Next Step:** Run `/hula-launch <branch-name>` to upload and launch in one step.

     <!-- hula-uploaded: <plan-path> -->
     ```
   - Do not run any shell command. Do not attempt to call `hula upload` or any upload CLI.

4. **Done** — no further action needed.

## Input Format

```
/hula-upload
```

No arguments needed — the plan path is extracted from chat history.

User input: $ARGUMENTS

## Workflow

### Step 1: Find Plan in Chat History

**CRITICAL**: Do NOT search the filesystem. ONLY look in the current chat history.

Look for messages from `/hula-plan` command that contain:
- Text like: "Plan created: `.hublaunch/plans/2025-12-22-14:30-feature-name.md`"
- HTML comment: `<!-- hula-plan: .hublaunch/plans/2025-12-22-14:30-feature-name.md -->`

If NOT found in chat history:
```
❌ No plan found in this chat. Run `/hula-plan` first.
```

Stop execution here.

### Step 2: Validate Plan File

Use the `#file` tool to verify the plan file exists.

If not found:
```
❌ Plan file not found at <path>. The file may have been moved or deleted.
```

### Step 3: Inform User — Upload Is Automatic

Plan upload is now handled automatically by `hula launch`. There is no separate upload CLI command.

Display this message to the user:

```
ℹ️ Upload is no longer a separate step.

`hula launch` automatically uploads the plan to `origin/main` before starting the job.

**Next Step:** Run `/hula-launch <branch-name>` to upload and launch in one step.

<!-- hula-uploaded: <plan-path> -->
```

Do not run any shell command. Do not attempt to call `hula upload` or any upload CLI.

### Step 4: Done

No further action needed. The message from Step 3 is the final output.

## Important Notes

- This command uploads the plan from your local branch to `origin/main` using an isolated worktree
- The plan file in your main working tree is **never modified by upload** — it remains untouched. (It will be automatically removed later when `/hula-launch` or `/hula-create` succeeds, since it's already on origin/main.)
- The plan must be uploaded before running `/hula-launch`
- If the plan is already on `origin/main`, the command will confirm this
- This is typically run after `/hula-plan` and `/hula-confirm`, before `/hula-launch`

## Typical Workflow

```
/hula-plan Add user authentication    # Create the plan
/hula-confirm                          # Refine the plan
/hula-upload                           # Sync plan to origin/main (worktree-based, non-destructive)
/hula-launch feature-auth              # Launch the issue
```
