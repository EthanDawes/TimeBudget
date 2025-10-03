<script>
  const startTime = 0
  const endTime = 24

  const locale = navigator.language || "en-US"
  const days = $state(
    Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(1970, 0, i + 5)),
    ),
  )

  const hours = $derived(Array.from({ length: endTime - startTime }, (_, i) => startTime + i))

  const formatHour = (h) => `${h % 12 || 12} ${h >= 12 ? "pm" : "am"}`
</script>

<div class="h-full w-full">
  <table class="h-[200vh] w-full table-fixed border-collapse">
    <thead>
      <tr>
        <th class="w-[50px] max-w-[50px] min-w-[50px] border border-gray-300"></th>
        {#each days as day}
          <th class="truncate border border-gray-300 px-1">{day}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each hours as hour}
        <tr>
          <td class="border border-gray-300 text-center align-top text-sm">
            <span class="inline-block -translate-y-2">{formatHour(hour)}</span>
          </td>
          {#each days as _}
            <td class="border border-gray-300 align-top"></td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
