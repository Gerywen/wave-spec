import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, "..");
/** GitHub Pages project site: set SITE_BASE=/wave-spec/ in CI */
const base = process.env.SITE_BASE || "/";

export default defineConfig({
  root,
  base,
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
  preview: {
    port: 4174,
  },
});
