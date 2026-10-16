export type LocalDate = string
export type Source = 'personal' | 'ics'
export type Frequency = 'daily' | 'weekly' | 'monthly'
export interface RepeatRule {
  frequency: Frequency
  interval: number
  until?: LocalDate
  weekdays?: number[]
}
export interface CalendarRecord {
  id: string
  title: string
  description: string
  location: string
  start: string
  end: string
  allDay: boolean
  startDate?: LocalDate
  endDateExclusive?: LocalDate
  source: Source
  sourceCalendar?: string
  sourceKey?: string
  /** An independently editable personal replacement for a recurring instance. */
  recurrenceParentId?: string
  recurrenceDate?: LocalDate
  repeat?: RepeatRule
  excludedDates?: LocalDate[]
  /** Optional local-only reminder lead time for personal events; imported ICS never owns reminders. */
  reminderMinutes?: number
  updatedAt: string
}
export interface CalendarOccurrence {
  key: string
  recordId: string
  date: LocalDate
  start: string
  end: string
  allDay: boolean
  startDate: LocalDate
  endDateExclusive: LocalDate
  title: string
  source: Source
  sourceCalendar?: string
  location: string
  description: string
}
export interface CalendarState {
  schemaVersion: 1
  records: CalendarRecord[]
}
