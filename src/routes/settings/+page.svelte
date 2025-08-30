<script lang="ts">
  import { goto } from "$app/navigation"
  import { loadBudgetConfig, saveBudgetConfig } from "$lib/timeManager"
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

<textarea class="h-[90vh] w-full border" bind:value={config}></textarea>
<button class="border" onclick={saveClick}>Save</button>
