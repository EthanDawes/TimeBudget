<script lang="ts">
  import { fmtDuration } from "$lib/time"
  import type { Snippet } from "svelte"
  import type { MouseEventHandler } from "svelte/elements"

  interface ProgressProps {
    children: Snippet<[]>
    spent: number
    budget: number
    style?: string
    onclick?: MouseEventHandler<HTMLDivElement>
  }

  let { children, spent, budget, style = "", onclick }: ProgressProps = $props()
</script>

<div class={"relative w-full " + style} {onclick} role={onclick ? "button" : undefined}>
  <progress value={spent} max={budget} class="progress-bar h-8 w-full appearance-none"></progress>
  <div
    class="pointer-events-none absolute inset-0 flex items-center justify-between px-3 font-medium text-gray-800"
  >
    <div class="flex-shrink-0">
      {@render children?.()}
    </div>
    <div class="flex-shrink-0">
      {fmtDuration(spent)} / {fmtDuration(budget)}
    </div>
  </div>
</div>

<style>
  .progress-bar {
    transition: all 0.3s ease-in-out;
  }

  .progress-bar::-webkit-progress-bar {
    background-color: #e5e7eb;
    border-radius: 0.375rem;
  }

  .progress-bar::-webkit-progress-value {
    background-color: #10b981;
    border-radius: 0.375rem;
    transition: width 0.3s ease-in-out;
  }

  .progress-bar::-moz-progress-bar {
    background-color: #10b981;
    border-radius: 0.375rem;
    transition: width 0.3s ease-in-out;
  }

  /* Fallback for browsers that don't support progress styling */
  .progress-bar[value] {
    transition: all 0.3s ease-in-out;
  }
</style>
