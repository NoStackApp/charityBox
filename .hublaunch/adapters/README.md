# HubLaunch Adapters

This directory contains custom service adapters for extending HubLaunch functionality.

## Directory Structure

```
adapters/
└── deployment/        # Custom deployment service adapters
    └── README.md
```

## What are Adapters?

Adapters allow you to integrate custom services with HubLaunch. For example:
- **Deployment Services**: Netlify, Railway, custom deployment platforms

## Creating Custom Adapters

All adapters must:
1. Export as default export
2. Have a unique `name` property
3. Implement `isConfigured()` method

## Configuration

Configure adapters in `.hublaunch/hublaunch.config.ts`:

```typescript
export const config = {
  services: {
    deployment: {
      provider: "custom",
      customPath: ".hublaunch/adapters/deployment/customDeployment.ts",
    },
  },
};
```

## More Information

- **Full Documentation**: https://github.com/YizYah/hub-launch/blob/main/docs/hooks-and-plugins.md
- **Examples**: https://github.com/YizYah/hub-launch/tree/main/examples/adapters
