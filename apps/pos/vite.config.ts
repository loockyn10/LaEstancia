import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  envDir: "../..",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "La Estancia POS",
        short_name: "La Estancia POS",
        description: "Punto de venta de La Estancia.",
        lang: "es",
        start_url: "/",
        display: "standalone",
        background_color: "#10231f",
        theme_color: "#10231f",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: { navigateFallback: "/index.html" },
    }),
  ],
});
