import type {CalendarOccurrence,CalendarRecord,LocalDate} from '../types'
import {addDays,localDate} from './dates'
import {occurrencesBetween} from './occurrences'

export interface NowNextEntry {
  item:CalendarOccurrence
  phase:'happening'|'upcoming'|'all-day-today'
}
export interface NowNextSummary{
  today:LocalDate
  happening:NowNextEntry[]
  upcoming:NowNextEntry[]
  allDayToday:NowNextEntry[]
  happeningCount:number
  upcomingCount:number
  allDayTodayCount:number
  horizonDays:number
}
/** Device-now projection on the original *visible* canonical occurrences only.
 * This is display/navigation, not a new notification or availability engine.
 * Transparent imported entries can be visible but never become busy claims.
 * Recurrence ownership, EXDATE, detached originals and UTC instants all flow
 * exclusively through occurrencesBetween.
 */
export function nowNextVisible(records:CalendarRecord[],nowIso:string,horizonDays=14,maxPerGroup=3):NowNextSummary{
  const nowMs=Date.parse(nowIso)
  if(!Number.isFinite(nowMs))throw new Error('Invalid live calendar time')
  if(!Number.isInteger(horizonDays)||horizonDays<1||horizonDays>30)
    throw new Error('Invalid upcoming calendar horizon')
  if(!Number.isInteger(maxPerGroup)||maxPerGroup<1||maxPerGroup>8)
    throw new Error('Invalid upcoming calendar limit')
  const today=localDate(new Date(nowMs)),to=addDays(today,horizonDays-1)
  const occurrences=occurrencesBetween(records,today,to)
  const sortByStart=(a:CalendarOccurrence,b:CalendarOccurrence)=>
    Date.parse(a.start)-Date.parse(b.start)||a.key.localeCompare(b.key)
  const sortByEnd=(a:CalendarOccurrence,b:CalendarOccurrence)=>
    Date.parse(a.end)-Date.parse(b.end)||a.key.localeCompare(b.key)
  const happening=occurrences.filter(x=>!x.allDay&&Date.parse(x.start)<=nowMs&&Date.parse(x.end)>nowMs)
    .sort(sortByEnd)
  const allDayToday=occurrences.filter(x=>x.allDay&&x.startDate<=today&&x.endDateExclusive>today)
    .sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.key.localeCompare(b.key))
  const upcoming=occurrences.filter(x=>x.allDay?x.startDate>today:Date.parse(x.start)>nowMs)
    .sort(sortByStart)
  const wrap=(items:CalendarOccurrence[],phase:NowNextEntry['phase'])=>
    items.slice(0,maxPerGroup).map(item=>({item,phase}))
  return {today,happening:wrap(happening,'happening'),upcoming:wrap(upcoming,'upcoming'),
    allDayToday:wrap(allDayToday,'all-day-today'),happeningCount:happening.length,
    upcomingCount:upcoming.length,allDayTodayCount:allDayToday.length,horizonDays}
}
