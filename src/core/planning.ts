import type {CalendarRecord,LocalDate} from '../types'
import {addDays,day,dateSeries} from './dates'
import {occurrencesBetween} from './occurrences'

export interface DayWorkload{
  date:LocalDate
  timedCount:number
  allDayCount:number
  busyMinutes:number
  overlaps:boolean
  importedCount:number
}
/** Summarize the original visible source set; never create shadow appointments.
 * Timed minutes are a union of real UTC instants clipped to each device-local
 * calendar day (important across midnight and DST). All-day spans count
 * separately rather than pretending the entire day has timed appointments. */
export function sevenDayWorkload(records:CalendarRecord[],selected:LocalDate):DayWorkload[]{
  day(selected)
  const end=addDays(selected,6)
  const occurrences=occurrencesBetween(records,selected,end)
  return dateSeries(selected,end,7).map(date=>{
    const start=new Date(date+'T00:00:00').getTime()
    const finish=new Date(addDays(date,1)+'T00:00:00').getTime()
    const allDay=occurrences.filter(item=>item.allDay&&item.startDate<=date&&item.endDateExclusive>date)
    const timed=occurrences.filter(item=>!item.allDay&&
      Date.parse(item.start)<finish&&Date.parse(item.end)>start)
    const intervals=timed.filter(item=>!item.transparent).map(item=>[Math.max(start,Date.parse(item.start)),
      Math.min(finish,Date.parse(item.end))] as const).sort((a,b)=>a[0]-b[0])
    let busy=0,until=start,overlaps=false
    for(const [begin,end] of intervals){
      if(begin<until)overlaps=true
      busy+=Math.max(0,end-Math.max(begin,until))
      until=Math.max(until,end)
    }
    return {date,timedCount:timed.length,allDayCount:allDay.length,
      busyMinutes:Math.round(busy/60000),overlaps,
      importedCount:[...timed,...allDay].filter(item=>item.source==='ics').length}
  })
}
