import type {CalendarOccurrence,CalendarRecord,LocalDate} from '../types'
import {day,daysBetween} from './dates'
import {occurrencesBetween} from './occurrences'
export type SearchDirection='forward'|'backward'
export interface SearchPage {
  items:CalendarOccurrence[]
  page:number
  pages:number
  total:number
  fromIndex:number
  throughIndex:number
  hasPrevious:boolean
  hasNext:boolean
}
/** A local, bounded projection of original materialized occurrences.
 * Search records have already passed the source/visibility/text filter.
 * Never use search results as an authority for availability or persistence.
 * Recurring occurrences preserve their canonical recordId/date/keys.
 */
export function searchOccurrencePage(records:CalendarRecord[],from:LocalDate,to:LocalDate,
  direction:SearchDirection,page:number,pageSize=30):SearchPage {
  day(from);day(to)
  const span=daysBetween(from,to)
  if(span<0||span>364)throw new Error('Search interval must be within 365 days')
  if(!Number.isInteger(page)||page<0||!Number.isInteger(pageSize)||pageSize<1||pageSize>30)
    throw new Error('Invalid search page')
  const occurrences=occurrencesBetween(records,from,to)
  // occurrencesBetween sorts all-day instances first. Search is chronological,
  // independent of display/column order; include original keys as stable ties.
  occurrences.sort((a,b)=>a.start.localeCompare(b.start)||a.key.localeCompare(b.key))
  if(direction==='backward')occurrences.reverse()
  else if(direction!=='forward')throw new Error('Invalid search direction')
  const total=occurrences.length
  const pages=Math.max(1,Math.ceil(total/pageSize))
  const actualPage=Math.min(page,pages-1)
  const offset=actualPage*pageSize
  const items=occurrences.slice(offset,offset+pageSize)
  return {items,page:actualPage,pages,total,fromIndex:items.length?offset+1:0,
    throughIndex:offset+items.length,hasPrevious:actualPage>0,hasNext:actualPage+1<pages}
}
