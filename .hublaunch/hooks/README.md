# HubLaunch Hooks

This directory contains project-specific hooks that extend HubLaunch functionality.

## Available Hooks

### `deploymentStartupScript.ts`
Runs before opening a preview deployment. Use for:
- **Authentication** (Clerk, Auth0, custom login flows)
- **Browser automation** (Playwright-based interactions)
- **Test data seeding** (API calls to populate data)
- **Environment setup** (configure local state)

**Context Provided**:
```typescript
{
  deploymentUrl: string;    // Preview deployment URL
  issueNumber?: number;     // Associated issue number
  prNumber?: number;        // Associated PR number
  prTitle?: string;         // PR title
  prUrl?: string;          // PR URL
}
```

**Usage**:
- Configured in `.hublaunch/hublaunch.config.ts`
- Runs automatically when you run `hula preview`
- Runs in **background** (non-blocking)

---

## Creating Custom Hooks

All hooks must:
1. Be TypeScript files with `.ts` extension
2. Accept context as first CLI argument (JSON string)
3. Handle errors gracefully (try/catch)
4. Exit with code 0 on success, non-zero on failure

### Example: Custom Hook

```typescript
#!/usr/bin/env tsx

interface HookContext {
  [key: string]: unknown;
}

async function main() {
  // Parse context from CLI argument
  const contextJson = process.argv[2];
  const context: HookContext = JSON.parse(contextJson);

  console.log("Hook executing with context:", context);

  // Your custom logic here
  // ...

  console.log("✅ Hook completed successfully!");
}

main().catch((error) => {
  console.error("❌ Hook failed:", error);
  process.exit(1);
});
```

---

## Configuration

Configure hooks in `.hublaunch/hublaunch.config.ts`:

```typescript
export const config = {
  // ... other config ...

  hooks: {
    deploymentStartup: ".hublaunch/hooks/deploymentStartupScript.ts",
    beforePreview: ".hublaunch/hooks/beforePreview.ts",  // optional
    afterPreview: ".hublaunch/hooks/afterPreview.ts",    // optional
    beforeMerge: ".hublaunch/hooks/beforeMerge.ts",      // optional
    afterMerge: ".hublaunch/hooks/afterMerge.ts",        // optional
  },
};
```

---

## Environment Variables

Store sensitive data in environment variables:

```bash
# .env (gitignored)
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=your-test-password
CUSTOM_API_KEY=your-api-key
```

Access in hooks:
```typescript
const email = process.env.TEST_USER_EMAIL;
```

A variable is only available inside the container if it's listed in your project's `envVars` config in `.hublaunch/hublaunch.config.js` (or covered by `envVars: "all"`). See the "Forwarding environment variables to the container" section of the project README for the full behavior, including which variable names are reserved and blocked.

---

## Debugging Hooks

Run hook manually for testing:

```bash
# Test with sample context
tsx .hublaunch/hooks/deploymentStartupScript.ts '{"deploymentUrl":"https://example.com","prNumber":123}'

# Enable debug mode
DEBUG=true tsx .hublaunch/hooks/deploymentStartupScript.ts '{"deploymentUrl":"https://example.com"}'
```

---

## More Information

- **Full Documentation**: https://github.com/YizYah/hub-launch/blob/main/docs/hooks-and-plugins.md
- **Examples**: https://github.com/YizYah/hub-launch/tree/main/examples
- **Support**: https://github.com/YizYah/hub-launch/issues
