<script lang="ts">
  import BudgetCalendar from "./BudgetCalendar.svelte"
  import BudgetAllocator from "./BudgetAllocator.svelte"
  import Tracker from "./Tracker.svelte"
  import { shiftWeekday } from "$lib/time"

  const eventChannel = new EventTarget()

  let width = $state(window.innerWidth)
  let selectedDay = $state(shiftWeekday(new Date().getDay()))

  window.addEventListener("resize", () => {
    width = window.innerWidth
  })
</script>

<svelte:head>
  <title>Time Budget Tracker</title>
</svelte:head>

{#if width < 768}
  <div class="min-h-dvh w-full bg-gray-50 p-2"><Tracker /></div>
{:else}
  <div class="flex max-h-dvh w-full bg-gray-50">
    <div class="max-h-full w-[90%] overflow-x-clip overflow-y-auto">
      <BudgetCalendar {eventChannel} bind:selectedDay />
    </div>
    <div class="overflow-x-clip overflow-y-auto">
      <BudgetAllocator {eventChannel} {selectedDay} />
    </div>
  </div>
{/if}
