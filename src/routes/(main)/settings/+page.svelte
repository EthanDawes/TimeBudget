<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import { loadBudgetConfig, saveBudgetConfig } from "$lib/budgetManager"
  import { resolve } from "$app/paths"

  let config = $state("")

  onMount(async () => {
    const budgetConfig = await loadBudgetConfig()
    config = JSON.stringify(budgetConfig, null, 2)
  })

  async function saveClick(startImmediate: boolean) {
    await saveBudgetConfig(JSON.parse(config), startImmediate)
    goto(resolve("/"))
  }
</script>

<svelte:head>
  <title>Settings - Time Budget Tracker</title>
</svelte:head>

<textarea class="h-[87vh] w-full border" bind:value={config}></textarea>
<p>
  Save and apply starting
  <button class="border" onclick={saveClick.bind(null, false)}>next week</button>
  <button class="border" onclick={saveClick.bind(null, true)}>this week</button>
</p>
