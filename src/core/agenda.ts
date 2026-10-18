import type {CalendarRecord,CalendarOccurrence,LocalDate} from '../types'
import {addDays,day,dateSeries,daysBetween,localDate} from './dates'
import {occurrencesBetween} from './occurrences'

/** Find the next genuinely occupied day from the visible canonical source set,
 * not just the start date of an event. Both timed and multi-day all-day entries count. */
export function adjacentBusyDay(records:CalendarRecord[],selected:LocalDate,direction:-1|1,limitDays=365):LocalDate|null{
  day(selected)
  if(!Number.isInteger(limitDays)||limitDays<1||limitDays>365)throw new Error('Invalid busy-day search range')
  const end=addDays(selected,direction*limitDays)
  const first=direction===1?addDays(selected,1):end
  const last=direction===1?end:addDays(selected,-1)
  const occurrences=occurrencesBetween(records,first,last)
  const occupied=new Set<string>()
  for(const date of dateSeries(first,last,367)){
    const start=Date.parse(new Date(date+'T00:00:00').toISOString())
    const finish=Date.parse(new Date(addDays(date,1)+'T00:00:00').toISOString())
    if(occurrences.some(item=>item.allDay?item.startDate<=date&&item.endDateExclusive>date:
      Date.parse(item.start)<finish&&Date.parse(item.end)>start))occupied.add(date)
  }
  const candidates=Array.from(occupied).sort()
  return direction===1?(candidates[0]??null):(candidates[candidates.length-1]??null)
}
function csvCell(value:string):string {
  // Spreadsheet viewers can interpret imported event titles as formulas.
  // Escape all cells, and neutralize potentially executable first characters.
  const clean=value.replace(/\r\n?/g,'\n')
  const escaped=/^\s*[=+\-@\t\r]/.test(clean)?"'"+clean:clean
  return '"'+escaped.replace(/"/g,'""')+'"'
}
function formatWall(iso:string):string{
  const value=new Date(iso)
  const p=(x:number)=>String(x).padStart(2,'0')
  return localDate(value)+' '+p(value.getHours())+':'+p(value.getMinutes())
}
function agendaLine(occ:CalendarOccurrence):string[]{
  return [
    occ.startDate,
    occ.allDay?'All day':formatWall(occ.start),
    occ.allDay?addDays(occ.endDateExclusive,-1):formatWall(occ.end),
    occ.title,occ.location,
    occ.source==='personal'?'Personal':'Imported: '+(occ.sourceCalendar??'Unknown'),
  ]
}
/** A finite, user-initiated local export of the current visible calendar filter.
 * No notes, hidden sources or canonical IDs are transmitted or copied. */
export function exportAgendaCsv(records:CalendarRecord[],from:LocalDate,to:LocalDate):string {
  day(from);day(to)
  const count=daysBetween(from,to)
  if(count<0||count>30)throw new Error('Agenda export must cover 1–31 days')
  const data=occurrencesBetween(records,from,to)
  if(data.length>800)throw new Error('Too many agenda instances; narrow your calendar selection')
  const heading=['Date','Start (device local)','End (device local)','Title','Location','Source']
  return [heading,...data.map(agendaLine)].map(line=>line.map(csvCell).join(',')).join('\r\n')+'\r\n'
}
