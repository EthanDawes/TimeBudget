<script>
  import { getWeekStart } from "$lib/time.js"
  import CalGrid from "$lib/cal/CalGrid.svelte"
  import CalEvent from "$lib/cal/CalEvent.svelte"
</script>

<CalGrid tableHeight="100vh" currentWeekStart={getWeekStart()}>
  <CalEvent startHour={2} duration={1} dayIndex={0} color="red">My event :)</CalEvent>
</CalGrid>
