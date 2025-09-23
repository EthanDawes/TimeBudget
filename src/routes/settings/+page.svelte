<script lang="ts">
  import { goto } from "$app/navigation"
  import { loadBudgetConfig, saveBudgetConfig } from "$lib/budgetManager"
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

<textarea class="h-[87vh] w-full border" bind:value={config}></textarea>
<small>
  If no rebudgeting has been done this week, changes will take effect immediately. Otherwise,
  they'll affect next week.
</small>
<br />
<button class="border" onclick={saveClick}>Save</button>
