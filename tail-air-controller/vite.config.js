import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    // This tells Vite to translate the code for older iPads!
    target: ["es2015", "safari11"],
  },
});
