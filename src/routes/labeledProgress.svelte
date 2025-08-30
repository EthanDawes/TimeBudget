<script lang="ts">
  import { fmtDuration } from "$lib/time"

  let {
    children,
    spent,
    budget,
  }: { children: Snippet<[]>; spent: Promise<number>; budget: number } = $props()

  let spentResolved = $state("")
  spent.then((res) => (spentResolved = res))
</script>

<div>
  {@render children?.()}
  <span>
    {fmtDuration(spentResolved)} / {fmtDuration(budget)}
  </span>
</div>
<progress value={spentResolved} max={budget}></progress>
