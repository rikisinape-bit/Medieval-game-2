import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // the paladin armour's texture, the ground's, the leaf and the clouds go inside the code as data: URLs (the published page loads no image files)
  build: { chunkSizeWarningLimit: 2000, assetsInlineLimit: (file) => (/paladin_albedo|terreno_|foglia|nuvole/.test(file) ? true : undefined) },
});
