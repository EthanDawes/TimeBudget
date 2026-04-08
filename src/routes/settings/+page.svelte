<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  import { loadBudgetConfig, saveBudgetConfig } from "$lib/budgetManager"
  import { loadSchedule, saveSchedule, refreshEvents } from "$lib/scheduleManager"
  import { resolve } from "$app/paths"
  import { connectWithGoogle, clearAccessToken, isConnected } from "$lib/cal/calController"
  import { db } from "$lib/db"
  import CalendarPicker from "./CalendarPicker.svelte"

  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""

  let config = $state("")
  let events = $state("")
  let googleConnected = $state(false)
  let googleLoading = $state(false)
  let eventsRefreshing = $state(false)

  let _curUser = db.cloud.currentUser
  let curUser = $derived($_curUser)
  let dbLoggedIn = $derived(curUser.userId !== "unauthorized")

  onMount(async () => {
    config = JSON.stringify(await loadBudgetConfig(), null, 2)
    events = JSON.stringify(await loadSchedule(), null, 2)
    googleConnected = isConnected()
  })

  async function handleGoogleConnect() {
    googleLoading = true
    try {
      await connectWithGoogle(GOOGLE_CLIENT_ID)
      googleConnected = true
    } finally {
      googleLoading = false
    }
  }

  function handleGoogleDisconnect() {
    clearAccessToken()
    googleConnected = false
  }

  async function saveBudgetClick(startImmediate: boolean) {
    await saveBudgetConfig(JSON.parse(config), startImmediate)
    if (startImmediate) {
      // TODO: when saving this week, need to re-iterate all cal events and re-add its time
    }
    goto(resolve("/"))
  }

  async function saveScheduleClick() {
    await saveSchedule(JSON.parse(events))
    goto(resolve("/"))
  }

  async function handleEventRefresh() {
    eventsRefreshing = true
    await refreshEvents()
    eventsRefreshing = false
  }
</script>

<svelte:head>
  <title>Settings - Time Budget Tracker</title>
  <script src="https://accounts.google.com/gsi/client" async></script>
</svelte:head>

<div class="min-h-dvh bg-gray-50 p-4">
  <div class="mx-auto max-w-4xl">
    <!-- Site -->
    <h2>Sync</h2>
    {#if dbLoggedIn}
      <p>Signed in as {curUser.email}</p>
    {/if}
    <button class="border" onclick={() => (dbLoggedIn ? db.cloud.logout() : db.cloud.login())}>
      {dbLoggedIn ? "Logout" : "Login"}
    </button>

    <!--  Google Calendar  -->
    <h2>Google Calendar</h2>
    <p>
      {#if googleConnected}
        Connected
        <button class="border" onclick={handleGoogleDisconnect}>Disconnect</button>
      {:else}
        <button class="border" onclick={handleGoogleConnect} disabled={googleLoading}>
          {googleLoading ? "Connecting..." : "Connect with Google"}
        </button>
      {/if}
    </p>
    <p>
      <button class="border" onclick={handleEventRefresh}>
        {eventsRefreshing ? "Refreshing..." : "Refresh events"}
      </button>
    </p>
    {#if googleConnected}
      <h3>Calendars</h3>
      <CalendarPicker />
    {/if}

    <!--  Budget  -->
    <br />
    <h2>Budget</h2>
    <textarea class="h-[87vh] w-full border" bind:value={config}></textarea>
    <p>
      Save and apply starting
      <button class="border" onclick={saveBudgetClick.bind(null, false)}>next week</button>
      <button class="border" onclick={saveBudgetClick.bind(null, true)}>this week</button>
    </p>

    <!--  Events  -->
    <br />
    <h2>Events</h2>
    <textarea class="h-[87vh] w-full border" bind:value={events}></textarea>
    <p>
      <button class="border" onclick={saveScheduleClick}>Save</button>
    </p>
  </div>
</div>

<style>
  h2 {
    font-size: 2rem;
  }
</style>
