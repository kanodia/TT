import path from 'node:path';
import type { NextConfig } from 'next';

// Text, types and formatting live in packages/shared so the mobile apps use the same copy.
// The repo root is the build root so those files outside apps/web resolve and get traced.
const repoRoot = path.join(__dirname, '../..');

const nextConfig: NextConfig = {
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
