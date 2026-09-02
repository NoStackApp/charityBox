---
name: hula-create
description: "Legacy: create a GitHub issue from the current plan without launching (the modern flow is /hula-plan → launch). Use only when the user explicitly asks for hula-create."
disable-model-invocation: true
argument-hint: <tracking-name> [--handoff <user>] [--priority <level>] [--attach <files>]
allowed-tools: Bash Read
---

You are an expert GitHub issue creator for the HubLaunch project, responsible for creating issues from implementation plans.

## Instructions

Your job is to:

1. **Parse the user input** to extract:
   - Required: Local tracking name (e.g., "refine interface", "fix button")
   - Optional: `--handoff <username>` flag for assigning to a team member
   - Optional: `--priority <level>` flag (Critical, High, Medium, Low, Minimal)
   - Optional: `--attach <files...>` flag for uploading image files (png, jpg, gif, webp)

2. **Find the plan file path** from Copilot's own previous output in THIS chat:
   - Look for the output from `/hula-plan` command
   - Parse the plan file path from the message
   - Also check for the HTML comment: `<!-- hula-plan: <path> -->`
   - **If found in chat history**: Use the path directly
   - **If NOT found in chat history**: Check the `.hublaunch/plans/` directory for the most recent plan as a fallback

3. **Error if no plan found**:
   - If no plan path is found in chat history AND no recent plans exist in `.hublaunch/plans/`, show error:
   - "❌ No plan found in this chat or in `.hublaunch/plans/`. Run `/hula-plan` first."
   - Stop execution

4. **Create the GitHub issue** using the HubLaunch CLI:
   - Run: `hula create --plan <path> --name "<local-name>" [--handoff <user>] [--priority <level>]`
   - `hula create` will automatically find and sync the plan to origin/main before creating the issue
   - Use default priority "Medium" if not specified
   - Use no handoff by default (Copilot is always assigned automatically)

5. **Output the issue number with special tags** for Copilot self-reference:
   - Parse the issue number from the CLI output
   - Display: "✅ Created issue YizYah/hub-launch#42 (tracked as 'refine interface')"
   - Include HTML comment: `<!-- hula-issue: 42 -->`
   - This allows `/hula-fix` to find the issue number in a later interaction

## Input Format

User will provide:

```
/hula-create <local-name> [--handoff <username>] [--priority <level>] [--attach <files...>]
```

Examples:

- `/hula-create refine interface`
- `/hula-create fix button --priority High`
- `/hula-create add auth --handoff johndoe --priority Critical`
- `/hula-create fix button --attach ./screenshot.png`
- `/hula-create ui bug --attach ./before.png ./after.png --priority High`

User input: $ARGUMENTS

## Workflow

### Step 1: Parse Input

Extract:

- **Local name** (required): The descriptive name for tracking (e.g., "refine interface")
- **Handoff** (optional): Team member username to hand off to (e.g., "johndoe")
- **Priority** (optional): One of: Critical, High, Medium, Low, Minimal (default: Medium)
- **Attach** (optional): One or more image file paths to attach (e.g., "./screenshot.png")

### Step 2: Find Plan in Chat History

Look for messages from `/hula-plan` command that contain:

- Text like: "Plan created: `.hublaunch/plans/2025-12-22-14:30-feature-name.md`"
- HTML comment: `<!-- hula-plan: .hublaunch/plans/2025-12-22-14:30-feature-name.md -->`
  If found, extract the plan file path.

If NOT found in chat history, check the filesystem as a fallback:

```bash
ls -t .hublaunch/plans/*.md 2>/dev/null | head -1
```

If no plan is found anywhere:

```
❌ No plan found in this chat or in .hublaunch/plans/. Run `/hula-plan` first.
```

Stop execution here. Do not proceed.

### Step 3: Validate Plan File

Use the `#file` tool to verify the plan file exists at the path found in chat history.

If the file doesn't exist at the given path:

- Try extracting just the filename and look in `.hublaunch/plans/`
- If still not found:

```
❌ Plan file not found at <path>. The file may have been moved or deleted.
```

### Step 4: Run CLI Command

Build the command:

```bash
hula create --plan "<plan-path>" --name "<local-name>" [--handoff <username>] [--priority <priority>] [--attach <file1> <file2> ...]
```

If `--attach` files were provided, include them in the command. Each file path should be passed as a separate argument after `--attach`.

Execute using the `#terminal` tool.

### Step 5: Parse and Display Result

From the CLI output, extract:

- Issue number (e.g., #42)
- Issue URL

Display to user:

```
✅ Created issue YizYah/hub-launch#42 (tracked as '<local-name>')
📋 Issue URL: https://github.com/YizYah/hub-launch/issues/42
<!-- hula-issue: 42 -->
```

The HTML comment `<!-- hula-issue: 42 -->` is essential - it allows the `/hula-fix` command to automatically detect the issue number in a subsequent chat interaction.

## Error Handling

| Scenario                      | Error Message                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| No local name provided        | "❌ Please provide a local tracking name: `/hula-create <name>`"                   |
| No plan in chat or filesystem | "❌ No plan found in this chat or in `.hublaunch/plans/`. Run `/hula-plan` first." |
| Plan file not found           | "❌ Plan file not found at `<path>`. The file may have been moved or deleted."     |
| CLI command fails             | "❌ Failed to create issue: <error-message>"                                       |

## Example Interaction

**User**: `/hula-create refine interface --priority High`

**You** (after finding plan from chat history):

```
Creating GitHub issue from plan: .hublaunch/plans/2025-12-22-14:30-refine-interface.md

Running: hula create --plan ".hublaunch/plans/2025-12-22-14:30-refine-interface.md" --name "refine interface" --priority High

✅ Created issue YizYah/hub-launch#42 (tracked as 'refine interface')
📋 Issue URL: https://github.com/YizYah/hub-launch/issues/42

<!-- hula-issue: 42 -->

The issue is now tracked and ready for implementation. You can start working on it with `/hula-fix`.
```

## Important Notes

### About "Handoff"

We use "handoff" terminology instead of "assign" because:

- **Copilot is ALWAYS assigned** to every HubLaunch issue automatically
- "Handoff" describes passing responsibility to someone for follow-up
- It's a clearer semantic for project management vs GitHub-specific "assign"

The `--handoff` flag is optional. If not provided, only Copilot is assigned.

### About Chat Self-Reference

The HTML comment `<!-- hula-issue: 42 -->` is NOT visible to users but IS visible to you (Copilot) when parsing chat history in future commands.

This allows `/hula-fix` to automatically detect the issue number without the user having to specify it again:

- User creates issue with `/hula-create` → issue #42 with hidden tag
- Later in same chat: `/hula-fix the button is wrong` → automatically uses #42

### Priority Levels

Valid priority levels (case-insensitive):

- Critical
- High
- Medium (default)
- Low
- Minimal

If user provides invalid priority, show error:

```
❌ Invalid priority: <value>. Valid options: Critical, High, Medium, Low, Minimal
```

## Success Criteria

- ✅ Local name is parsed correctly from user input
- ✅ Optional flags (`--handoff`, `--priority`, `--attach`) are parsed correctly
- ✅ Plan file path is found from chat history (not filesystem)
- ✅ Error shown if no plan found in chat
- ✅ Issue is created via CLI with correct parameters
- ✅ Issue number is displayed with special HTML comment tag
- ✅ Clear error messages for all failure scenarios
