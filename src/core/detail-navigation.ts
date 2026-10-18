import type {CalendarOccurrence,CalendarRecord} from '../types'
import {addDays,day} from './dates'
import {occurrencesBetween} from './occurrences'

export interface DetailNeighbors {
  previous:CalendarOccurrence|null
  next:CalendarOccurrence|null
  position:number
  count:number
  included:boolean
}

/** Display-only walk across original visible event instances near the open event.
 * Called with the existing visible/query-filtered source set, NOT with a
 * reduced availability or persistence authority. No record copies or writes.
 * ±30 calendar days is a local browsing boundary, never a 'no more events' claim.
 */
export function detailNeighbors(records:CalendarRecord[],current:CalendarOccurrence,
  radiusDays=30):DetailNeighbors {
  day(current.date)
  if(!Number.isInteger(radiusDays)||radiusDays<1||radiusDays>45)
    throw new Error('Invalid event browsing window')
  const events=occurrencesBetween(records,addDays(current.date,-radiusDays),
    addDays(current.date,radiusDays))
    .sort((a,b)=>a.start.localeCompare(b.start)||a.key.localeCompare(b.key))
  const index=events.findIndex(item=>item.key===current.key&&item.recordId===current.recordId)
  return {previous:index>0?events[index-1]:null,
    next:index>=0&&index+1<events.length?events[index+1]:null,
    position:index<0?0:index+1,count:events.length,included:index>=0}
}
