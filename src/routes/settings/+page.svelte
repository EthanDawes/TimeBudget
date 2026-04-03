<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import {
    loadBudgetConfig,
    loadSchedule,
    saveBudgetConfig,
    saveSchedule,
  } from "$lib/budgetManager"
  import { resolve } from "$app/paths"

  let config = $state("")
  let events = $state("")

  onMount(async () => {
    config = JSON.stringify(await loadBudgetConfig(), null, 2)
    events = JSON.stringify(await loadSchedule(), null, 2)
  })

  async function saveBudgetClick(startImmediate: boolean) {
    await saveBudgetConfig(JSON.parse(config), startImmediate)
    goto(resolve("/"))
  }

  async function saveScheduleClick() {
    await saveSchedule(JSON.parse(events))
    goto(resolve("/"))
  }
</script>

<svelte:head>
  <title>Settings - Time Budget Tracker</title>
</svelte:head>

<div class="min-h-dvh bg-gray-50 p-4">
  <div class="mx-auto max-w-4xl">
    <!--  Budget  -->
    <h2>Budget</h2>
    <textarea class="h-[87vh] w-full border" bind:value={config}></textarea>
    <p>
      Save and apply starting
      <button class="border" onclick={saveBudgetClick.bind(null, false)}>next week</button>
      <button class="border" onclick={saveBudgetClick.bind(null, true)}>this week</button>
    </p>

    <!--  Events  -->
    <br />
    <h2>Events</h2>
    <textarea class="h-[87vh] w-full border" bind:value={events}></textarea>
    <p>
      <button class="border" onclick={saveScheduleClick}>Save</button>
    </p>
  </div>
</div>

<style>
  h2 {
    font-size: 2rem;
  }
</style>
