<script lang="ts">
  import { onMount } from "svelte"
  import { getAllCalendars } from "$lib/cal/calController"
  import { db } from "$lib/db"

  let calendars: any[] = $state([])
  let enabledCals: Set<string> = $state(new Set())
  let loading = $state(true)
  let saving = $state(false)
  let error = $state("")

  onMount(async () => {
    try {
      const [cals, meta] = await Promise.all([getAllCalendars(), db.metadata.get("enabledCals")])
      calendars = cals
      // Default: all enabled if no preference saved yet
      const saved: string[] = meta?.value ?? cals.map((c: any) => c.id)
      enabledCals = new Set(saved)
    } catch (e: any) {
      error = e.message
    } finally {
      loading = false
    }
  })

  function toggle(id: string) {
    const next = new Set(enabledCals)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    enabledCals = next
  }

  async function save() {
    saving = true
    try {
      await db.metadata.put({ key: "enabledCals", value: [...enabledCals] })
    } finally {
      saving = false
    }
    alert("Saved")
  }
</script>

{#if loading}
  <p>Loading calendars...</p>
{:else if error}
  <p style="color:red">{error}</p>
{:else}
  <ul style="list-style:none;padding:0">
    {#each calendars as cal}
      <li>
        <label>
          <input
            type="checkbox"
            checked={enabledCals.has(cal.id)}
            onchange={() => toggle(cal.id)}
          />
          <span style="margin-left:0.4em">{cal.summary}</span>
        </label>
      </li>
    {/each}
  </ul>
  <button class="border" onclick={save} disabled={saving}>
    {saving ? "Saving..." : "Save"}
  </button>
{/if}
