# Custom Deployment Service Adapters

Create custom deployment service adapters for your deployment platform.

## Interface

Deployment adapters should implement deployment-related functionality.

## Example: Custom Deployment Service

```typescript
// customDeployment.ts
export default class CustomDeploymentService {
  readonly name = "custom";

  isConfigured(): boolean {
    return Boolean(process.env.CUSTOM_DEPLOY_TOKEN);
  }

  async getDeploymentUrl(prNumber: number): Promise<string> {
    // Your implementation
    const response = await fetch(
      `https://your-platform.com/deployments/pr-${prNumber}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CUSTOM_DEPLOY_TOKEN}`,
        },
      }
    );

    const data = await response.json();
    return data.url;
  }
}
```

## Configuration

```typescript
// .hublaunch/hublaunch.config.ts
export const config = {
  services: {
    deployment: {
      provider: "custom",
      customPath: ".hublaunch/adapters/deployment/customDeployment.ts",
    },
  },
};
```
