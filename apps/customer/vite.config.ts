import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Full PWA manifest/icons/offline strategy are fleshed out in Fase 6 —
// this registers the plugin now so the app is installable from day one
// of Fase 2 instead of being retrofitted later.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Yummix",
        short_name: "Yummix",
        description: "Peça comida dos seus restaurantes favoritos",
        theme_color: "#ff4d30",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "icon.svg", sizes: "512x512", type: "image/svg+xml" },
          { src: "icon.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
    }),
  ],
});
