<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import type { BudgetConfig } from "$lib/types"
  import { loadBudgetConfig, saveBudgetConfig } from "$lib/utils/timeManager"

  let config = $state(JSON.stringify(loadBudgetConfig()))

  function saveClick() {
    saveBudgetConfig(JSON.parse(config))
    goto(basepath)
  }
</script>

<svelte:head>
  <title>Settings - Time Budget Tracker</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-4">
  <div class="mx-auto max-w-4xl">
    <textarea class="h-[90vh] w-full border">{config}</textarea>
    <button class="border" onclick={saveClick}>Save</button>
  </div>
</div>
