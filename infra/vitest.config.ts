import { defineConfig } from "vitest/config";
// Stacks with Lambdas bundle with esbuild during synth; under parallel load that exceeds 5 s.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 30_000 } });
