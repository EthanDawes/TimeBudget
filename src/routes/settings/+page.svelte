<script lang="ts">
  import { goto } from "$app/navigation"
  import { loadBudgetConfig, saveBudgetConfig } from "$lib/utils/timeManager"
  import { resolve } from "$app/paths"

  let config = $state(JSON.stringify(loadBudgetConfig(), null, 2))

  function saveClick() {
    saveBudgetConfig(JSON.parse(config))
    goto(resolve("/"))
  }
</script>

<svelte:head>
  <title>Settings - Time Budget Tracker</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-4">
  <div class="mx-auto max-w-4xl">
    <textarea class="h-[90vh] w-full border" bind:value={config}></textarea>
    <button class="border" onclick={saveClick}>Save</button>
  </div>
</div>
