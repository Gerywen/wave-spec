import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, "..");

export default defineConfig({
  root,
  publicDir: resolve(root, "public"),
  plugins: [react()],
  resolve: {
    alias: {
      "@apc": resolve(repo, "src"),
    },
  },
  server: {
    port: 5174,
    open: true,
    fs: {
      allow: [repo],
    },
  },
  build: {
    outDir: resolve(repo, "dist-site"),
    emptyOutDir: true,
  },
});
