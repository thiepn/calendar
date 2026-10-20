import type {CalendarOccurrence,CalendarRecord,LocalDate} from '../types'
import {day,displayTime,offsetLabel} from './dates'
import {dayOccurrences} from './occurrences'
import {dayAxis} from './timeline'

export interface DayJump {
  occurrence:CalendarOccurrence
  /** Real elapsed minutes since local midnight; null for an all-day event. */
  minute:number|null
  /** A clipped view target, not a proposed event start or canonical mutation. */
  scrollMinute:number|null
  timeLabel:string
}
export interface DayJumpPage {
  items:DayJump[]
  total:number
  page:number
  pages:number
  hasPrevious:boolean
  hasNext:boolean
  fromIndex:number
  throughIndex:number
  allDayCount:number
  timedCount:number
}
/** A bounded navigational projection of the ORIGINAL visible occurrences.
 * The timeline's UTC-backed dayAxis is the only authority for DST wall-to-
 * elapsed positioning. Imported TRANSP only affects availability, not display.
 * No writes, record copies, free/busy conclusions or secondary index.
 */
export function dayJumpPage(records:CalendarRecord[],date:LocalDate,page:number,pageSize=8):DayJumpPage{
  day(date)
  if(!Number.isInteger(page)||page<0||!Number.isInteger(pageSize)||pageSize<1||pageSize>12)
    throw new Error('Invalid day navigation page')
  const axis=dayAxis(date)
  const occurrences=dayOccurrences(records,date).sort((a,b)=>
    Number(b.allDay)-Number(a.allDay)||a.start.localeCompare(b.start)||a.key.localeCompare(b.key))
  const total=occurrences.length
  const pages=Math.max(1,Math.ceil(total/pageSize))
  const actualPage=Math.min(page,pages-1)
  const offset=actualPage*pageSize
  const items=occurrences.slice(offset,offset+pageSize).map(occurrence=>{
    if(occurrence.allDay)return {occurrence,minute:null,scrollMinute:null,timeLabel:'All day'}
    const clipped=Math.max(axis.start,Date.parse(occurrence.start))
    const minute=Math.max(0,Math.min(axis.minutes,Math.round((clipped-axis.start)/60000)))
    const repeated=axis.slots.some(slot=>slot.repeated&&
      clipped>=Date.parse(slot.start)&&clipped<Date.parse(slot.end))
    const timeLabel=displayTime(occurrence.start)+(repeated?' '+offsetLabel(occurrence.start):'')
    return {occurrence,minute,scrollMinute:Math.max(0,minute-45),timeLabel}
  })
  return {items,total,page:actualPage,pages,fromIndex:items.length?offset+1:0,
    throughIndex:offset+items.length,hasPrevious:actualPage>0,hasNext:actualPage+1<pages,
    allDayCount:occurrences.filter(x=>x.allDay).length,
    timedCount:occurrences.filter(x=>!x.allDay).length}
}
