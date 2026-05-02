<script lang="ts">
  import { headerHeight, labelWidth } from "$lib/cal/CalGrid.svelte"
  import { getContext, type Snippet } from "svelte"

  interface EventProps {
    // 0-24
    startHour: number
    // hours
    duration: number
    // Integer day of the week (0 = monday)
    dayIndex: number
    color: string
    children?: Snippet<[]>
    tooltip?: string
    onclick?: (e: MouseEvent) => void
  }

  let { startHour, duration, dayIndex, color, children, onclick, tooltip }: EventProps = $props()

  const tableHeight = getContext("tableHeight")
  const cellHeight = `((${tableHeight} - ${headerHeight}) / 24)`
  // Use 100% instead of vw b/c chrome reduces space for scrollbar, firefox doesn't
  const cellWidth = `((100% - ${labelWidth}) / 7)`
</script>

<div
  class="absolute truncate border"
  class:cursor-pointer={onclick}
  class:hover:opacity-80={onclick}
  style:background-color={color}
  style:left={`calc(${labelWidth} + ${cellWidth} * ${dayIndex})`}
  style:top={`calc(${headerHeight} + ${cellHeight} * ${startHour})`}
  style:width={`calc(${cellWidth})`}
  style:height={`calc(${cellHeight} * ${duration})`}
  {onclick}
  title={tooltip}
>
  {@render children?.()}
</div>
