/**
 * All app dates are stored as YYYY-MM-DD strings in the user's local timezone.
 * Never store timestamps for diary entries — that breaks day boundaries when
 * the user travels across timezones, and complicates the "what day was that
 * meal logged on?" question.
 */

import { addDays, format, parseISO } from 'date-fns';

export type LocalDate = string; // YYYY-MM-DD

export function todayLocal(): LocalDate {
  return format(new Date(), 'yyyy-MM-dd');
}

export function toLocalDate(date: Date): LocalDate {
  return format(date, 'yyyy-MM-dd');
}

export function fromLocalDate(date: LocalDate): Date {
  // parseISO interprets YYYY-MM-DD as local midnight
  return parseISO(date);
}

export function shiftDate(date: LocalDate, deltaDays: number): LocalDate {
  return toLocalDate(addDays(fromLocalDate(date), deltaDays));
}

export function isToday(date: LocalDate): boolean {
  return date === todayLocal();
}

export function formatDayHeader(date: LocalDate): string {
  if (isToday(date)) return 'Today';
  const yesterday = shiftDate(todayLocal(), -1);
  if (date === yesterday) return 'Yesterday';
  const tomorrow = shiftDate(todayLocal(), 1);
  if (date === tomorrow) return 'Tomorrow';
  return format(fromLocalDate(date), 'EEE, d MMM');
}
