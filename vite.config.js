import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base is set from BASE_PATH so the same build works locally and on GitHub Pages
// (Pages serves project sites from /<repo-name>/).
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || "/",
  build: { outDir: "dist", sourcemap: true },
});
