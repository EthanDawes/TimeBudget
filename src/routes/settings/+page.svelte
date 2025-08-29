<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { BudgetConfig } from '$lib/types';
	import { loadBudgetConfig, saveBudgetConfig } from '$lib/utils/timeManager';

	let configText = '';
	let error = '';
	let success = false;

	function loadConfig() {
		try {
			const config = loadBudgetConfig();
			configText = JSON.stringify(config, null, 2);
			error = '';
		} catch (err) {
			error = 'Failed to load configuration';
			console.error(err);
		}
	}

	function saveConfig() {
		try {
			const config: BudgetConfig = JSON.parse(configText);

			// Basic validation
			if (typeof config !== 'object' || config === null) {
				throw new Error('Configuration must be a valid JSON object');
			}

			// Validate structure
			for (const [category, subcategories] of Object.entries(config)) {
				if (typeof subcategories !== 'object' || subcategories === null) {
					throw new Error(`Category "${category}" must contain subcategories`);
				}

				for (const [subcategory, events] of Object.entries(subcategories)) {
					if (typeof events !== 'object' || events === null) {
						throw new Error(`Subcategory "${subcategory}" must contain events`);
					}

					for (const [eventName, duration] of Object.entries(events)) {
						if (typeof duration !== 'number' || duration < 0) {
							throw new Error(`Event "${eventName}" duration must be a positive number`);
						}
					}
				}
			}

			saveBudgetConfig(config);
			error = '';
			success = true;
			setTimeout(() => {
				success = false;
			}, 2000);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Invalid JSON format';
			success = false;
		}
	}

	function saveAndGoBack() {
		saveConfig();
		if (!error) {
			setTimeout(() => {
				goto('/');
			}, 500);
		}
	}

	function resetToDefault() {
		const defaultConfig = {
			Work: {
				Development: {
					Coding: 1200,
					Planning: 300,
					Meetings: 180
				},
				Admin: {
					Email: 120,
					Documentation: 180
				}
			},
			Personal: {
				Learning: {
					Reading: 420,
					Courses: 300
				},
				Exercise: {
					Gym: 240,
					Running: 180
				}
			}
		};
		configText = JSON.stringify(defaultConfig, null, 2);
		error = '';
	}

	onMount(() => {
		loadConfig();
	});
</script>

<svelte:head>
	<title>Settings - Time Budget Tracker</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 p-4">
	<div class="mx-auto max-w-4xl">
		<!-- Header -->
		<div class="mb-8 flex items-center justify-between">
			<div>
				<h1 class="text-3xl font-bold text-gray-900">Budget Configuration</h1>
				<p class="mt-1 text-gray-600">Edit your time budget allocation in JSON format</p>
			</div>
			<a
				href="/"
				class="rounded-full bg-white p-3 text-2xl shadow-md transition-shadow duration-200 hover:shadow-lg"
				title="Back to Main"
			>
				←
			</a>
		</div>

		<!-- Configuration Form -->
		<div class="rounded-lg bg-white p-6 shadow-md">
			<div class="mb-4 flex items-center justify-between">
				<h2 class="text-lg font-semibold text-gray-800">Budget Configuration (JSON)</h2>
				<button
					on:click={resetToDefault}
					class="rounded-lg bg-gray-600 px-3 py-1 text-sm text-white transition-colors duration-200 hover:bg-gray-700"
				>
					Reset to Default
				</button>
			</div>

			<!-- Format Instructions -->
			<div class="mb-4 rounded-lg bg-blue-50 p-4">
				<h3 class="mb-2 font-medium text-blue-800">Format Instructions:</h3>
				<ul class="space-y-1 text-sm text-blue-700">
					<li>• Time durations are in <strong>minutes</strong></li>
					<li>• Structure: Category → Subcategory → Event Name → Duration</li>
					<li>• If subcategory and category are the same, time is allocated to the category</li>
					<li>• Category time is used when subcategory runs out or has no allocation</li>
				</ul>
			</div>

			<!-- JSON Editor -->
			<div class="mb-4">
				<textarea
					bind:value={configText}
					class="h-96 w-full resize-none rounded-lg border border-gray-300 p-4 font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
					placeholder="Enter your budget configuration in JSON format..."
					spellcheck="false"
				></textarea>
			</div>

			<!-- Error Display -->
			{#if error}
				<div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
					<p class="text-red-800">
						<strong>Error:</strong>
						{error}
					</p>
				</div>
			{/if}

			<!-- Success Display -->
			{#if success}
				<div class="mb-4 rounded-lg border border-green-200 bg-green-50 p-4">
					<p class="text-green-800">
						<strong>Success:</strong> Configuration saved successfully!
					</p>
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="flex justify-end space-x-3">
				<button
					on:click={saveConfig}
					class="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors duration-200 hover:bg-blue-700"
				>
					Save
				</button>
				<button
					on:click={saveAndGoBack}
					class="rounded-lg bg-green-600 px-4 py-2 text-white transition-colors duration-200 hover:bg-green-700"
				>
					Save & Go Back
				</button>
			</div>
		</div>

		<!-- Example Configuration -->
		<div class="mt-8 rounded-lg bg-white p-6 shadow-md">
			<h3 class="mb-3 text-lg font-semibold text-gray-800">Example Configuration:</h3>
			<pre class="overflow-x-auto rounded-lg bg-gray-100 p-4 text-sm"><code
					>{JSON.stringify(
						{
							Work: {
								Development: {
									Coding: 1200,
									Planning: 300,
									Meetings: 180
								},
								Admin: {
									Email: 120,
									Documentation: 180
								}
							},
							Personal: {
								Learning: {
									Reading: 420,
									Courses: 300
								},
								Exercise: {
									Gym: 240,
									Running: 180
								}
							}
						},
						null,
						2
					)}</code
				></pre>
		</div>
	</div>
</div>
