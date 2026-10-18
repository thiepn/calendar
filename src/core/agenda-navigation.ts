import type {CalendarRecord,LocalDate} from '../types'
import {addDays,dateSeries,day} from './dates'
import {occurrencesBetween} from './occurrences'

export interface AgendaJump { eventDate:LocalDate; selected:LocalDate }

/** Skip empty display windows without leaving Agenda. Display/navigation only:
 * takes the existing filtered visible records, never the source-complete set
 * used independently by free/busy, conflict checks or guarded writes.
 * Transparent read-only ICS remains a visible agenda occurrence.
 */
export function adjacentAgendaRange(records:CalendarRecord[],selected:LocalDate,
  span:14|30,direction:-1|1,searchDays=365):AgendaJump|null{
  day(selected)
  if(span!==14&&span!==30)throw new Error('Invalid agenda range')
  if(direction!==1&&direction!==-1)throw new Error('Invalid agenda direction')
  if(!Number.isInteger(searchDays)||searchDays<1||searchDays>365)
    throw new Error('Invalid agenda navigation limit')
  const from=direction===1?addDays(selected,span):addDays(selected,-searchDays)
  const to=direction===1?addDays(from,searchDays-1):addDays(selected,-1)
  const occurrences=occurrencesBetween(records,from,to)
  if(!occurrences.length)return null
  const days=dateSeries(from,to,366)
  if(direction===-1)days.reverse()
  for(const date of days){
    const midnight=new Date(date+'T00:00:00').getTime()
    const afterMidnight=new Date(addDays(date,1)+'T00:00:00').getTime()
    if(occurrences.some(item=>item.allDay?
      item.startDate<=date&&item.endDateExclusive>date:
      Date.parse(item.start)<afterMidnight&&Date.parse(item.end)>midnight))
      return {eventDate:date,selected:direction===1?date:addDays(date,1-span)}
  }
  return null
}
