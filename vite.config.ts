import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./" => works on any GitHub Pages path (user.github.io/<repo>/) without edits.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: { target: "es2020", sourcemap: false },
});
