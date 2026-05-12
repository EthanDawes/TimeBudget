<script lang="ts">
  import { db } from "$lib/db"

  let status = $state("")

  async function exportDb() {
    const data = {
      timeEntries: await db.timeEntries.toArray(),
      budget: await db.budget.toArray(),
      schedule: await db.schedule.toArray(),
      metadata: await db.metadata.toArray(),
    }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `timebudget-db-${new Date().toISOString().split("T")[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    status = "Exported."
  }

  async function importDb(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    const text = await file.text()
    const data = JSON.parse(text)
    if (!confirm("This will overwrite all local data. Continue?")) return
    await db.transaction("rw", [db.timeEntries, db.budget, db.schedule, db.metadata], async () => {
      await db.timeEntries.clear()
      await db.budget.clear()
      await db.schedule.clear()
      await db.metadata.clear()
      if (data.timeEntries?.length) await db.timeEntries.bulkAdd(data.timeEntries)
      if (data.budget?.length) await db.budget.bulkAdd(data.budget)
      if (data.schedule?.length) await db.schedule.bulkAdd(data.schedule)
      if (data.metadata?.length) await db.metadata.bulkAdd(data.metadata)
    })
    status = "Imported."
  }
</script>

<svelte:head>
  <title>DB - Time Budget</title>
</svelte:head>

<h1>Database</h1>
<p><button onclick={exportDb}>Export</button></p>
<p><label>Import: <input type="file" accept=".json" onchange={importDb} /></label></p>
{#if status}
  <p>{status}</p>
{/if}
