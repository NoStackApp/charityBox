/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // Do not auto-generate AGENTS.md / CLAUDE.md agent-rule files on `next dev`.
  agentRules: false,
};

export default config;
