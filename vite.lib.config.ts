import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dts from "vite-plugin-dts";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    dts({
      include: ["src"],
      outDir: "dist",
      rollupTypes: true,
    }),
    wasm(),
    topLevelAwait(),
  ],
  build: {
    lib: {
      entry: resolve(root, "src/index.ts"),
      name: "AudioPlayerControl",
      formats: ["es"],
      fileName: "audio-player-control",
    },
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        assetFileNames: "audio-player-control.[ext]",
      },
    },
  },
});
