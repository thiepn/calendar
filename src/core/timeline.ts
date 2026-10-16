import type { CalendarOccurrence, LocalDate } from '../types'
import { addDays, day, fromLocalDateTime, localDate } from './dates'

export const SLOT_MINUTES=30
export const TIMELINE_HOUR_HEIGHT=64

export interface TimedBlock {
  occurrence:CalendarOccurrence
  startMinute:number
  endMinute:number
  lane:number
  lanes:number
  overlaps:boolean
}

/** Create real local timestamps and refuse nonexistent spring-forward clock readings. */
export function slotRange(date:LocalDate,minute:number,length:number):{start:string;end:string}{
  day(date)
  if(!Number.isInteger(minute)||minute<0||minute>=1440||minute%SLOT_MINUTES!==0||
    !Number.isInteger(length)||length<30||length>240||length%30!==0)throw new Error('Invalid time slot')
  const hours=String(Math.floor(minute/60)).padStart(2,'0')
  const minutes=String(minute%60).padStart(2,'0')
  const start=fromLocalDateTime(date+'T'+hours+':'+minutes)
  const end=new Date(Date.parse(start)+length*60000).toISOString()
  return {start,end}
}
function position(instant:string,date:LocalDate):number {
  const d=new Date(instant)
  const first=new Date(date+'T00:00:00')
  const next=new Date(addDays(date,1)+'T00:00:00')
  if(d<=first)return 0
  if(d>=next)return 1440
  if(localDate(d)!==date)return d<first?0:1440
  return d.getHours()*60+d.getMinutes()+d.getSeconds()/60
}

/** Collision columns use absolute timestamps; visually clip each event to its displayed day. */
export function layoutTimedDay(items:CalendarOccurrence[],date:LocalDate):TimedBlock[]{
  day(date)
  const bounds={
    start:Date.parse(new Date(date+'T00:00:00').toISOString()),
    end:Date.parse(new Date(addDays(date,1)+'T00:00:00').toISOString())
  }
  const blocks=items.filter(x=>!x.allDay&&Date.parse(x.end)>bounds.start&&Date.parse(x.start)<bounds.end)
    .map(occurrence=>({
      occurrence,startMinute:position(occurrence.start,date),
      endMinute:Math.max(position(occurrence.start,date)+15,position(occurrence.end,date)),
      lane:0,lanes:1,overlaps:false
    }))
  blocks.sort((a,b)=>Math.max(Date.parse(a.occurrence.start),bounds.start)-Math.max(Date.parse(b.occurrence.start),bounds.start)||
    Date.parse(b.occurrence.end)-Date.parse(a.occurrence.end)||a.occurrence.key.localeCompare(b.occurrence.key))
  const clusters:TimedBlock[][]=[]
  let group:TimedBlock[]=[]
  let groupEnd=-Infinity
  for(const block of blocks){
    const start=Math.max(bounds.start,Date.parse(block.occurrence.start))
    if(group.length && start>=groupEnd){clusters.push(group);group=[];groupEnd=-Infinity}
    group.push(block)
    groupEnd=Math.max(groupEnd,Math.min(bounds.end,Date.parse(block.occurrence.end)))
  }
  if(group.length)clusters.push(group)
  for(const cluster of clusters){
    const laneEnds:number[]=[]
    for(const block of cluster){
      const start=Math.max(bounds.start,Date.parse(block.occurrence.start))
      let lane=laneEnds.findIndex(end=>end<=start)
      if(lane<0){lane=laneEnds.length;laneEnds.push(0)}
      block.lane=lane
      laneEnds[lane]=Math.min(bounds.end,Date.parse(block.occurrence.end))
    }
    for(const block of cluster){
      block.lanes=laneEnds.length
      block.overlaps=laneEnds.length>1
    }
  }
  return blocks
}
