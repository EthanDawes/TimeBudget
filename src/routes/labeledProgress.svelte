<script lang="ts">
  import { fmtDuration } from "$lib/time"
  import type { Snippet } from "svelte"

  let {
    children,
    spent,
    budget,
  }: { children: Snippet<[]>; spent: Promise<number>; budget: number } = $props()

  let spentResolved = $state(0)
  spent.then((res) => (spentResolved = res))
</script>

<div class="relative w-full">
  <progress value={spentResolved} max={budget} class="progress-bar h-8 w-full appearance-none"
  ></progress>
  <div
    class="pointer-events-none absolute inset-0 flex items-center justify-between px-3 font-medium text-gray-800"
  >
    <div class="flex-shrink-0">
      {@render children?.()}
    </div>
    <div class="flex-shrink-0">
      {fmtDuration(spentResolved)} / {fmtDuration(budget)}
    </div>
  </div>
</div>

<style>
  .progress-bar::-webkit-progress-bar {
    background-color: #e5e7eb;
    border-radius: 0.375rem;
  }

  .progress-bar::-webkit-progress-value {
    background-color: #10b981;
    border-radius: 0.375rem;
  }

  .progress-bar::-moz-progress-bar {
    background-color: #10b981;
    border-radius: 0.375rem;
  }
</style>
