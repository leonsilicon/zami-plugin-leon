import { defineConfig } from "vite-plus";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "index.js",
    },
    target: "es2022",
    outDir: "plugin",
    emptyOutDir: false,
    minify: false,
    rolldownOptions: {
      output: {
        codeSplitting: false,
        banner: "// Generated from src/index.ts by vp build.",
      },
    },
  },
  fmt: { ignorePatterns: ["plugin/index.js"] },
  lint: {
    ignorePatterns: ["plugin/index.js"],
    options: { typeAware: true, typeCheck: true },
  },
});
