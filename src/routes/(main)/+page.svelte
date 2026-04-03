<script lang="ts">
  import BudgetCalendar from "./BudgetCalendar.svelte"
  import BudgetAllocator from "./BudgetAllocator.svelte"
</script>

<svelte:head>
  <title>Time Budget Tracker</title>
</svelte:head>

<div class="flex max-h-dvh w-full bg-gray-50">
  <div class="max-h-full w-[90%] overflow-x-clip overflow-y-auto">
    <BudgetCalendar />
  </div>
  <div class="overflow-x-clip overflow-y-auto">
    <BudgetAllocator />
  </div>
</div>
