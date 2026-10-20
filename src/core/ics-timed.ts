import type {LocalDate} from '../types'
import {addDays,day,daysBetween} from './dates'
import {expandFiniteAllDay,parseFiniteAllDayRule} from './ics-recurrence'

/** Date candidates only; the caller resolves every occurrence in its source TZID.
 * UTC UNTIL is a real instant, not a floating device-local calendar date. */
export interface FiniteTimedPlan {dates:LocalDate[];untilInstant?:string}
export function finiteTimedDates(rrule:string,anchor:LocalDate):FiniteTimedPlan {
  day(anchor)
  const match=/(?:^|;)UNTIL=([^;]+)/.exec(rrule)
  if(!match)return {dates:expandFiniteAllDay(anchor,parseFiniteAllDayRule(rrule,anchor))}
  const wall=/^(\d{8})T(\d{6})Z$/.exec(match[1])
  if(!wall)throw new Error('Timed UNTIL must be an explicit UTC date-time')
  const d=wall[1],time=wall[2]
  const until=new Date(d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8)+'T'+time.slice(0,2)+':'+time.slice(2,4)+':'+time.slice(4)+'Z')
  if(!Number.isFinite(until.getTime())||
    until.toISOString().slice(0,10)!==[d.slice(0,4),d.slice(4,6),d.slice(6,8)].join('-')||
    until.toISOString().slice(11,19)!==[time.slice(0,2),time.slice(2,4),time.slice(4)].join(':'))
    throw new Error('Invalid timed UNTIL instant')
  const utcDate=until.toISOString().slice(0,10)
  // The source-local date can be one day ahead of UTC. Include that
  // candidate, then compare actual UTC instants against UNTIL below.
  const end=addDays(utcDate,1)
  if(daysBetween(anchor,end)>730||daysBetween(anchor,end)<0)throw new Error('Timed recurrence exceeds bounded 730-day horizon')
  const replacement=rrule.replace(match[0],(match[0].startsWith(';')?';':'')+'UNTIL='+end.replace(/-/g,''))
  const rule=parseFiniteAllDayRule(replacement,anchor)
  return {dates:expandFiniteAllDay(anchor,rule),untilInstant:until.toISOString()}
}
export function timedWallTemplate(value:string):{anchor:LocalDate;time:string;suffix:string}{
  const m=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value)
  if(!m)throw new Error('Timed source must use a supported iCalendar DATE-TIME')
  const anchor=m[1]+'-'+m[2]+'-'+m[3]
  day(anchor)
  return {anchor,time:m[4]+m[5]+(m[6]??'00'),suffix:m[7]??''}
}
export function wallValueOn(date:LocalDate,template:{time:string;suffix:string}):string{
  return date.replace(/-/g,'')+'T'+template.time+template.suffix
}
