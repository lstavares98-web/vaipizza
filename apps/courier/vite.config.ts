import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "VaiPizza Estafeta",
        short_name: "VaiPizza",
        theme_color: "#0B4D2B",
        background_color: "#161616",
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
