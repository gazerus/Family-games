import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Two build targets share this app: the GitHub Pages PWA (served from a
// /Family-games/ subpath) and the Android APK (Capacitor bundles the build
// output as local files served from root). `npm run build` targets Pages;
// `npm run build:apk` (mode "capacitor") targets the app synced into
// android/ — see README's "Building the Android app" section.
export default defineConfig(({ mode }) => {
  const base = mode === "capacitor" ? "/" : "/Family-games/";
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg"],
        manifest: {
          name: "Family Games",
          short_name: "Family",
          description: "Video chat with the family, plus games we can add as we go.",
          theme_color: "#7c3aed",
          background_color: "#17151c",
          display: "standalone",
          start_url: base,
          scope: base,
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "icons/maskable-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "icons/maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        },
      }),
    ],
  };
});
