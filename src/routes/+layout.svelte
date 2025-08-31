<script lang="ts">
  import "../app.css"
  import favicon from "$lib/assets/icon.png"
  import { pwaInfo } from "virtual:pwa-info"
  import { onMount } from "svelte"

  // Adapted from https://vite-pwa-org.netlify.app/frameworks/sveltekit.html
  onMount(async () => {
    if (pwaInfo) {
      const { registerSW } = await import("virtual:pwa-register")
      registerSW({
        immediate: true,
        onRegistered(r: ServiceWorkerRegistration) {
          // uncomment following code if you want check for updates
          // r && setInterval(() => {
          //    console.log('Checking for sw update')
          //    r.update()
          // }, 20000 /* 20s for testing purposes */)
          console.log("SW Registered:", r)
        },
        onRegisterError(error: any) {
          console.log("SW registration error", error)
        },
      })
    }
  })

  // Maybe I'm crazy but Svelte 5 syntax didn't seem to work
  $: webManifestLink = pwaInfo ? pwaInfo.webManifest.linkTag : ""
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  {@html webManifestLink}
</svelte:head>

<div class="min-h-screen bg-gray-50 p-4">
  <div class="mx-auto max-w-4xl">
    <slot />
  </div>
</div>
