import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server/index.ts", "src/cli/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist/server",
  sourcemap: true,
  splitting: true,
  clean: false,
});
