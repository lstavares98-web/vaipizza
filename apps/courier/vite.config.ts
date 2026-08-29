import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Yummix Estafeta",
        short_name: "Yummix Courier",
        theme_color: "#111318",
        background_color: "#111318",
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
