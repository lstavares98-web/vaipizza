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
        name: "VaiPizza Delivery",
        short_name: "VaiPizza",
        description: "Pediu? Vai. Peça comida dos seus restaurantes favoritos",
        theme_color: "#0B4D2B",
        background_color: "#F7E8C8",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "logo.png", sizes: "192x192", type: "image/png" },
          { src: "logo.png", sizes: "512x512", type: "image/png" },
          { src: "logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
