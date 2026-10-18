import type {CalendarRecord} from '../types'
import type {SourceFilter} from './view-preferences'

/** One canonical source-filter function for search, calendar, agenda and planning.
 * Hidden sources are display preferences ONLY; availability, export, backup
 * and source-owned persistence still consult every original saved record. */
export function visibleCalendarRecords(
  records:CalendarRecord[],filter:SourceFilter,hiddenImportedCalendars:ReadonlySet<string>,
  search=''
):CalendarRecord[]{
  const q=search.toLocaleLowerCase().trim()
  return records.filter(record=>
    (filter==='all'||record.source===filter)&&
    !(record.source==='ics'&&hiddenImportedCalendars.has(record.sourceCalendar??'Imported'))&&
    (!q||[record.title,record.description,record.location,record.sourceCalendar??'']
      .some(value=>value.toLocaleLowerCase().includes(q))))
}

/** Explicit toggles never modify source-owned snapshots or create a shadow store.
 * Preserve display choices across refresh/re-import of a named ICS snapshot. */
export function toggleImportedCalendarVisibility(hidden:string[],name:string):string[]{
  if(typeof name!=='string'||!name||name.length>100)throw new Error('Invalid source name')
  const next=hidden.includes(name)?hidden.filter(value=>value!==name):[...hidden,name]
  if(next.length>80||new Set(next).size!==next.length||
    next.some(value=>!value||value.length>100))
    throw new Error('Too many hidden imported sources')
  return next
}
