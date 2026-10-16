import type { CalendarOccurrence, LocalDate } from '../types'
import {addDays,day,localDate,localDateTime,offsetLabel} from './dates'
export const SLOT_MINUTES=30
export const TIMELINE_HOUR_HEIGHT=64
export interface TimedBlock {
  occurrence:CalendarOccurrence;startMinute:number;endMinute:number;lane:number;lanes:number;overlaps:boolean
}
export interface DayAxis {
  date:LocalDate;start:number;end:number;minutes:number
  hours:{minute:number;label:string;offset:string;repeated:boolean}[]
  slots:{minute:number;start:string;end:string;label:string;offset:string;repeated:boolean}[]
}
/** Real elapsed minutes: 23-hour spring days have 46 slots, autumn 25-hour days 50.
 * On a repeated hour each slot has a different ISO instant and explicit UTC offset. */
export function dayAxis(date:LocalDate):DayAxis{
  day(date)
  const start=new Date(date+'T00:00:00').getTime()
  const end=new Date(addDays(date,1)+'T00:00:00').getTime()
  const minutes=Math.round((end-start)/60000)
  const make=(minute:number)=>{
    const iso=new Date(start+minute*60000).toISOString()
    const label=localDateTime(iso).slice(11)
    const offset=offsetLabel(iso)
    return {minute,label,offset,iso}
  }
  const hours=Array.from({length:Math.ceil(minutes/60)},(_,i)=>make(i*60)).map(({minute,label,offset})=>
    ({minute,label,offset,repeated:false}))
  const slots=Array.from({length:Math.ceil(minutes/SLOT_MINUTES)},(_,i)=>{
    const item=make(i*SLOT_MINUTES)
    const later=Math.min(end,start+(i+1)*SLOT_MINUTES*60000)
    return {minute:item.minute,start:item.iso,end:new Date(later).toISOString(),label:item.label,offset:item.offset,repeated:false}
  })
  for(const item of slots) item.repeated=slots.some(other=>other!==item&&other.label===item.label)
  for(const item of hours) item.repeated=hours.some(other=>other!==item&&other.label===item.label)
  return {date,start,end,minutes,hours,slots}
}
/** Stable ISO slot creation, including *both* autumn 02:00 instances. */
export function slotAt(axis:DayAxis,minute:number,length:number):{start:string;end:string}{
  if(!Number.isInteger(minute)||minute<0||minute>=axis.minutes||minute%SLOT_MINUTES!==0||
    !Number.isInteger(length)||length<30||length>240||length%30!==0)throw new Error('Invalid time slot')
  const start=new Date(axis.start+minute*60000).toISOString()
  return {start,end:new Date(axis.start+(minute+length)*60000).toISOString()}
}
/** Compatibility for existing tests/callers; minute is now elapsed time from the
 * real local midnight, equal to wall minutes on ordinary days. */
export function slotRange(date:LocalDate,minute:number,length:number):{start:string;end:string}{
  return slotAt(dayAxis(date),minute,length)
}
function position(instant:string,axis:DayAxis):number {
  return Math.max(0,Math.min(axis.minutes,(Date.parse(instant)-axis.start)/60000))
}
export function layoutTimedDay(items:CalendarOccurrence[],date:LocalDate):TimedBlock[]{
  const axis=dayAxis(date)
  const blocks=items.filter(x=>!x.allDay&&Date.parse(x.end)>axis.start&&Date.parse(x.start)<axis.end)
    .map(occurrence=>({occurrence,startMinute:position(occurrence.start,axis),
      endMinute:Math.max(position(occurrence.start,axis)+15,position(occurrence.end,axis)),
      lane:0,lanes:1,overlaps:false}))
  blocks.sort((a,b)=>Math.max(Date.parse(a.occurrence.start),axis.start)-Math.max(Date.parse(b.occurrence.start),axis.start)||
    Date.parse(b.occurrence.end)-Date.parse(a.occurrence.end)||a.occurrence.key.localeCompare(b.occurrence.key))
  const clusters:TimedBlock[][]=[]
  let group:TimedBlock[]=[],groupEnd=-Infinity
  for(const block of blocks){
    const start=Math.max(axis.start,Date.parse(block.occurrence.start))
    if(group.length&&start>=groupEnd){clusters.push(group);group=[];groupEnd=-Infinity}
    group.push(block)
    groupEnd=Math.max(groupEnd,Math.min(axis.end,Date.parse(block.occurrence.end)))
  }
  if(group.length)clusters.push(group)
  for(const cluster of clusters){
    const laneEnds:number[]=[]
    for(const block of cluster){
      const start=Math.max(axis.start,Date.parse(block.occurrence.start))
      let lane=laneEnds.findIndex(end=>end<=start)
      if(lane<0){lane=laneEnds.length;laneEnds.push(0)}
      block.lane=lane
      laneEnds[lane]=Math.min(axis.end,Date.parse(block.occurrence.end))
    }
    for(const block of cluster){block.lanes=laneEnds.length;block.overlaps=laneEnds.length>1}
  }
  return blocks
}
