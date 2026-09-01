import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not auto-generate AGENTS.md / CLAUDE.md agent-rule files on `next dev`.
  agentRules: false,
};

export default nextConfig;
