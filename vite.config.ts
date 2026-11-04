import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base =
  process.env.VITE_BASE_PATH || (repository ? `/${repository}/` : "/");

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "brand-icon-v2-192.png",
        "brand-icon-v2-512.png",
        "brand-maskable-v2-512.png",
        "brand-favicon-v2-32.png",
        "brand-apple-v2-180.png",
      ],
      manifest: {
        id: base,
        name: "Hybrid Tracker",
        short_name: "Hybrid",
        description: "Office and home days.",
        theme_color: "#2563eb",
        background_color: "#f8fafc",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          { src: "brand-icon-v2-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "brand-icon-v2-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "brand-maskable-v2-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
