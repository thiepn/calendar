import type {CalendarRecord,LocalDate} from '../types'
import {dayOccurrences} from './occurrences'
import {dayAxis} from './timeline'
export interface FocusDaySummary {count:number;allDay:number;firstTimedMinute:number|null}
/** Display-only original visible-source occurrences. Never authoritative for free/busy. */
export function focusDaySummary(records:CalendarRecord[],date:LocalDate):FocusDaySummary {
  const axis=dayAxis(date),events=dayOccurrences(records,date)
  const timed=events.filter(x=>!x.allDay&&Date.parse(x.end)>axis.start&&Date.parse(x.start)<axis.end)
  const first=timed.length?Math.min(...timed.map(x=>Math.max(axis.start,Date.parse(x.start)))):null
  return {count:events.length,allDay:events.filter(x=>x.allDay).length,
    firstTimedMinute:first===null?null:Math.max(0,Math.min(axis.minutes,Math.round((first-axis.start)/60000)))}
}
/** Scroll target in REAL elapsed local-day minutes. Fall back to 07:00. */
export function focusScrollMinute(records:CalendarRecord[],date:LocalDate):number {
  const axis=dayAxis(date),first=focusDaySummary(records,date).firstTimedMinute
  return Math.min(axis.minutes,Math.max(0,(first??465)-45))
}
