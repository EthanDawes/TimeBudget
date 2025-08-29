export interface BudgetConfig {
  [category: string]: {
    [subcategory: string]: {
      [eventName: string]: number; // duration in minutes
    };
  };
}

export interface TimeEntry {
  category: string;
  subcategory: string;
  eventName: string;
  duration: number; // accumulated time in minutes
}

export interface WeeklyTimeData {
  weekStart: string; // ISO date string of Monday
  entries: TimeEntry[];
  activeTimer: {
    category: string;
    subcategory: string;
    eventName: string;
    startTime: number; // timestamp
  } | null;
}

export interface CategoryProgress {
  category: string;
  subcategory: string;
  eventName: string;
  budgeted: number; // in minutes
  used: number; // in minutes
  percentage: number;
}
