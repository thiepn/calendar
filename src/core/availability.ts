import type { CalendarRecord, LocalDate } from '../types'
import { addDays, day, fromLocalDateTime, localDate } from './dates'
import { dayOccurrences } from './occurrences'

export interface FreeSlot { date:LocalDate; start:string; end:string }
export interface AvailabilityOptions {
  from:LocalDate
  days:number
  durationMinutes:number
  startHour:number
  endHour:number
  blockAllDay:boolean
  maxResults?:number
  now?:Date
}
function clock(total:number):string {
  return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0')
}
/** Calculate against every saved source, never the UI's search/visibility filter. */
export function findFreeSlots(records:CalendarRecord[],options:AvailabilityOptions):FreeSlot[] {
  const {from,days,durationMinutes,startHour,endHour,blockAllDay,maxResults=18,now=new Date()}=options
  day(from)
  if(!Number.isInteger(days)||days<1||days>14||
    !Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>240||durationMinutes%15!==0||
    !Number.isInteger(startHour)||!Number.isInteger(endHour)||startHour<0||endHour>23||
    endHour<=startHour||!Number.isInteger(maxResults)||maxResults<1||maxResults>100)
    throw new Error('Invalid availability window')
  const result:FreeSlot[]=[]
  const earliest=now.getTime()
  for(let i=0;i<days;i++){
    const date=addDays(from,i)
    const busy=dayOccurrences(records,date)
    if(blockAllDay&&busy.some(item=>item.allDay))continue
    const blocks=busy.filter(item=>!item.allDay).map(item=>[Date.parse(item.start),Date.parse(item.end)])
    let lastEnd=0
    for(let minute=startHour*60;minute+durationMinutes<=endHour*60;minute+=15){
      let start:string
      try{start=fromLocalDateTime(date+'T'+clock(minute))}catch{continue}
      const startMs=Date.parse(start)
      const endMs=startMs+durationMinutes*60000
      if(startMs<earliest||startMs<lastEnd)continue
      // Compare against a local wall-clock closing time, including clock changes.
      let closing:string
      try{closing=fromLocalDateTime(date+'T'+clock(endHour*60))}catch{continue}
      if(endMs>Date.parse(closing))continue
      if(blocks.some(([a,b])=>startMs<b&&endMs>a))continue
      result.push({date,start,end:new Date(endMs).toISOString()})
      lastEnd=endMs
      if(result.length>=maxResults)return result
    }
  }
  return result
}
