import tailwindcss from "@tailwindcss/vite"
import { sveltekit } from "@sveltejs/kit/vite"
import { defineConfig } from "vite"
import { SvelteKitPWA } from "@vite-pwa/sveltekit"

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      manifest: {
        name: "Time Budget",
        description: "Budget time like money",
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
