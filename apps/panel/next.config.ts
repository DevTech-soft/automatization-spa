import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const nextConfig: NextConfig = {
  // `@spa/shared` se distribuye como TS/ESM del monorepo; Next lo compila.
  transpilePackages: ["@spa/shared"],
  // Monorepo: la raíz de tracing es el repo, no `apps/panel`.
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
