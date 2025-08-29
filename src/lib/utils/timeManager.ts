import type { BudgetConfig, WeeklyTimeData, TimeEntry, CategoryProgress } from '../types';

const STORAGE_KEYS = {
	BUDGET_CONFIG: 'timeBudget_config',
	WEEKLY_DATA: 'timeBudget_weeklyData'
};

// Get the start of the current week (Monday)
export function getWeekStart(): Date {
	const now = new Date();
	const day = now.getDay();
	const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
	const monday = new Date(now.setDate(diff));
	monday.setHours(0, 0, 0, 0);
	return monday;
}

// Check if we need to reset for a new week
export function isNewWeek(lastWeekStart: string): boolean {
	const currentWeekStart = getWeekStart();
	const lastWeek = new Date(lastWeekStart);
	return currentWeekStart.getTime() !== lastWeek.getTime();
}

// Load budget configuration from localStorage
export function loadBudgetConfig(): BudgetConfig {
	try {
		const stored = localStorage.getItem(STORAGE_KEYS.BUDGET_CONFIG);
		if (stored) {
			return JSON.parse(stored);
		}
	} catch (error) {
		console.error('Error loading budget config:', error);
	}

	// Return default config
	return {
		Work: {
			Development: {
				Coding: 1200, // 20 hours
				Planning: 300, // 5 hours
				Meetings: 180 // 3 hours
			},
			Admin: {
				Email: 120, // 2 hours
				Documentation: 180 // 3 hours
			}
		},
		Personal: {
			Learning: {
				Reading: 420, // 7 hours
				Courses: 300 // 5 hours
			},
			Exercise: {
				Gym: 240, // 4 hours
				Running: 180 // 3 hours
			}
		}
	};
}

// Save budget configuration to localStorage
export function saveBudgetConfig(config: BudgetConfig): void {
	try {
		localStorage.setItem(STORAGE_KEYS.BUDGET_CONFIG, JSON.stringify(config));
	} catch (error) {
		console.error('Error saving budget config:', error);
	}
}

// Load weekly time data from localStorage
export function loadWeeklyData(): WeeklyTimeData {
	try {
		const stored = localStorage.getItem(STORAGE_KEYS.WEEKLY_DATA);
		console.log('Raw stored data from localStorage:', stored);

		if (stored) {
			const data = JSON.parse(stored);
			console.log('Parsed weekly data:', data);
			console.log('Active timer from storage:', data.activeTimer);

			// Check if we need to reset for a new week
			if (data.weekStart && isNewWeek(data.weekStart)) {
				console.log('New week detected, resetting data');
				return createNewWeekData();
			}

			console.log('Returning existing weekly data with active timer:', data.activeTimer);
			return data;
		}
	} catch (error) {
		console.error('Error loading weekly data:', error);
	}

	console.log('No stored data found, creating new week data');
	return createNewWeekData();
}

// Create new week data structure
function createNewWeekData(): WeeklyTimeData {
	return {
		weekStart: getWeekStart().toISOString(),
		entries: [],
		activeTimer: null
	};
}

// Save weekly time data to localStorage
export function saveWeeklyData(data: WeeklyTimeData): void {
	try {
		console.log('Saving weekly data with active timer:', data.activeTimer);
		localStorage.setItem(STORAGE_KEYS.WEEKLY_DATA, JSON.stringify(data));
	} catch (error) {
		console.error('Error saving weekly data:', error);
	}
}

// Start timer for a specific activity
export function startTimer(
	weeklyData: WeeklyTimeData,
	category: string,
	subcategory: string,
	eventName: string
): WeeklyTimeData {
	const now = Date.now();
	console.log('Starting timer for:', { category, subcategory, eventName });

	// Stop current timer if running
	if (weeklyData.activeTimer) {
		console.log('Stopping existing timer before starting new one');
		weeklyData = stopActiveTimer(weeklyData);
	}

	// Start new timer
	const newData = {
		...weeklyData,
		activeTimer: {
			category,
			subcategory,
			eventName,
			startTime: now
		}
	};

	console.log('New active timer created:', newData.activeTimer);
	saveWeeklyData(newData);
	return newData;
}

// Stop the currently active timer and record the time
export function stopActiveTimer(weeklyData: WeeklyTimeData): WeeklyTimeData {
	if (!weeklyData.activeTimer) {
		console.log('No active timer to stop');
		return weeklyData;
	}

	console.log('Stopping active timer:', weeklyData.activeTimer);
	const now = Date.now();
	const duration = Math.round((now - weeklyData.activeTimer.startTime) / (1000 * 60)); // Convert to minutes
	console.log('Timer duration:', duration, 'minutes');

	// Find existing entry or create new one
	const existingEntryIndex = weeklyData.entries.findIndex(
		(entry) =>
			entry.category === weeklyData.activeTimer!.category &&
			entry.subcategory === weeklyData.activeTimer!.subcategory &&
			entry.eventName === weeklyData.activeTimer!.eventName
	);

	const updatedEntries = [...weeklyData.entries];

	if (existingEntryIndex >= 0) {
		console.log('Updating existing entry at index:', existingEntryIndex);
		updatedEntries[existingEntryIndex] = {
			...updatedEntries[existingEntryIndex],
			duration: updatedEntries[existingEntryIndex].duration + duration
		};
	} else {
		console.log('Creating new entry for timer');
		updatedEntries.push({
			category: weeklyData.activeTimer.category,
			subcategory: weeklyData.activeTimer.subcategory,
			eventName: weeklyData.activeTimer.eventName,
			duration
		});
	}

	const newData = {
		...weeklyData,
		entries: updatedEntries,
		activeTimer: null
	};

	console.log('Timer stopped, activeTimer set to null');
	saveWeeklyData(newData);
	return newData;
}

// Calculate progress for all categories and subcategories
export function calculateProgress(
	budgetConfig: BudgetConfig,
	weeklyData: WeeklyTimeData
): CategoryProgress[] {
	const progress: CategoryProgress[] = [];

	console.log('calculateProgress - weeklyData.activeTimer:', weeklyData.activeTimer);

	for (const [category, subcategories] of Object.entries(budgetConfig)) {
		for (const [subcategory, events] of Object.entries(subcategories)) {
			for (const [eventName, budgeted] of Object.entries(events)) {
				const entry = weeklyData.entries.find(
					(e) =>
						e.category === category && e.subcategory === subcategory && e.eventName === eventName
				);

				let used = entry ? entry.duration : 0;

				// Add current active timer time if it matches this event
				if (
					weeklyData.activeTimer &&
					weeklyData.activeTimer.category === category &&
					weeklyData.activeTimer.subcategory === subcategory &&
					weeklyData.activeTimer.eventName === eventName
				) {
					const currentDuration = Math.round(
						(Date.now() - weeklyData.activeTimer.startTime) / (1000 * 60)
					);
					used += currentDuration;
					console.log(
						'Adding active timer duration:',
						currentDuration,
						'minutes to',
						category,
						subcategory,
						eventName
					);
				}

				const percentage = budgeted > 0 ? Math.min((used / budgeted) * 100, 100) : 0;

				progress.push({
					category,
					subcategory,
					eventName,
					budgeted,
					used,
					percentage
				});
			}
		}
	}

	return progress;
}

// Format minutes to human readable format
export function formatDuration(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;

	if (hours > 0 && mins > 0) {
		return `${hours}h ${mins}m`;
	} else if (hours > 0) {
		return `${hours}h`;
	} else {
		return `${mins}m`;
	}
}

// Get current active timer info
export function getActiveTimer(
	weeklyData: WeeklyTimeData
): { category: string; subcategory: string; eventName: string } | null {
	return weeklyData.activeTimer
		? {
				category: weeklyData.activeTimer.category,
				subcategory: weeklyData.activeTimer.subcategory,
				eventName: weeklyData.activeTimer.eventName
			}
		: null;
}

// Debug function to inspect localStorage state
export function debugTimerState(): void {
	console.log('=== TIMER DEBUG INFO ===');
	const stored = localStorage.getItem(STORAGE_KEYS.WEEKLY_DATA);
	console.log('Raw localStorage data:', stored);

	if (stored) {
		try {
			const parsed = JSON.parse(stored);
			console.log('Parsed data:', parsed);
			console.log('Active timer in storage:', parsed.activeTimer);
			console.log('Entries count:', parsed.entries?.length || 0);
		} catch (e) {
			console.error('Failed to parse stored data:', e);
		}
	} else {
		console.log('No data in localStorage');
	}
	console.log('========================');
}

// Function to manually set an active timer (for testing)
export function setActiveTimerForTesting(
	category: string,
	subcategory: string,
	eventName: string
): void {
	const weeklyData = loadWeeklyData();
	const newData = startTimer(weeklyData, category, subcategory, eventName);
	console.log('Test timer set:', newData.activeTimer);
}
