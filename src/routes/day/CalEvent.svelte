<script lang="ts">
  import { headerHeight, tableHeight, labelWidth } from "./+page.svelte"
  import type { Snippet } from "svelte"

  interface EventProps {
    // 0-24
    startHour: number
    // hours
    duration: number
    // Integer day of the week (0 = monday)
    dayIndex: number
    color: string
    children?: Snippet<[]>
    onclick?: () => void
  }

  let { startHour, duration, dayIndex, color, children, onclick }: EventProps = $props()

  const cellHeight = `((${tableHeight} - ${headerHeight}) / 24)`
  // Use 100% instead of vw b/c chrome reduces space for scrollbar, firefox doesn't
  const cellWidth = `((100% - ${labelWidth}) / 7)`
</script>

<div
  class="absolute truncate"
  class:cursor-pointer={onclick}
  class:hover:opacity-80={onclick}
  style:background-color={color}
  style:left={`calc(${labelWidth} + ${cellWidth} * ${dayIndex})`}
  style:top={`calc(${headerHeight} + ${cellHeight} * ${startHour})`}
  style:width={`calc(${cellWidth})`}
  style:height={`calc(${cellHeight} * ${duration})`}
  {onclick}
>
  {@render children?.()}
</div>
