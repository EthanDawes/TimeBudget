import tailwindcss from "@tailwindcss/vite"
import { sveltekit } from "@sveltejs/kit/vite"
import { defineConfig } from "vite"
import { SvelteKitPWA } from "@vite-pwa/sveltekit"

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      pwaAssets: {
        config: true,
      },
      manifest: {
        name: "Time Budget",
        description: "Budget time like money",
        icons: [
          {
            src: "pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      registerType: "autoUpdate",
      includeAssets: ["img/*"],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
