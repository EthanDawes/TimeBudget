<script lang="ts">
  import "../app.css"
  // import favicon from "$lib/assets/icon.png"
  import { pwaInfo } from "virtual:pwa-info"
  import { pwaAssetsHead } from "virtual:pwa-assets/head"
  import { onMount, onDestroy } from "svelte"
  import { isConnected } from "$lib/cal/calController"
  import { refreshEvents } from "$lib/scheduleManager"

  const SYNC_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

  let syncInterval: ReturnType<typeof setInterval> | undefined
  let isSyncing = false

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

    syncInterval = setInterval(async () => {
      if (!isConnected() || isSyncing) return
      isSyncing = true
      try {
        await refreshEvents()
      } catch (e) {
        console.warn("Periodic calendar sync failed:", e)
      } finally {
        isSyncing = false
      }
    }, SYNC_INTERVAL_MS)
  })

  onDestroy(() => {
    if (syncInterval) clearInterval(syncInterval)
  })

  const { children } = $props()

  // Adapted from https://github.com/vite-pwa/sveltekit/tree/de3bd8e20458e77409c0786996a2defd82e39530/examples/sveltekit-ts-assets-generator
  // Couldn't automaticly generate icons, so must manually
  const webManifest = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : "")
</script>

<svelte:head>
  {#if pwaAssetsHead.themeColor}
    <meta name="theme-color" content={pwaAssetsHead.themeColor.content} />
  {/if}
  {#each pwaAssetsHead.links as link}
    <link {...link} />
  {/each}

  {@html webManifest}
  <script src="https://accounts.google.com/gsi/client" async></script>
</svelte:head>

{@render children?.()}
