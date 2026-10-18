import type { CalendarRecord, LocalDate } from '../types'
import { addDays, day, fromLocalDateTime, localInstantOptions } from './dates'
import { dayOccurrences } from './occurrences'

export interface FreeSlot { date:LocalDate; start:string; end:string }
export interface AvailabilityOptions {
  from:LocalDate
  days:number
  durationMinutes:number
  startHour:number
  endHour:number
  blockAllDay:boolean
  daySelection?:'all'|'weekdays'|'weekends'
  bufferMinutes?:0|15|30
  maxResults?:number
  now?:Date
}
function clock(total:number):string {
  return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0')
}
/** Calculate against every saved source, never the UI's search/visibility filter. */
export function findFreeSlots(records:CalendarRecord[],options:AvailabilityOptions):FreeSlot[] {
  const {from,days,durationMinutes,startHour,endHour,blockAllDay,daySelection='all',bufferMinutes=0,maxResults=18,now=new Date()}=options
  day(from)
  if(!Number.isInteger(days)||days<1||days>14||
    !Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>240||durationMinutes%15!==0||
    !Number.isInteger(startHour)||!Number.isInteger(endHour)||startHour<0||endHour>23||
    endHour<=startHour||!['all','weekdays','weekends'].includes(daySelection)||![0,15,30].includes(bufferMinutes)||
    !Number.isInteger(maxResults)||maxResults<1||maxResults>100)
    throw new Error('Invalid availability window')
  const result:FreeSlot[]=[]
  const earliest=now.getTime()
  for(let i=0;i<days;i++){
    const date=addDays(from,i)
    const weekday=day(date).getDay()
    if(daySelection==='weekdays'&&(weekday===0||weekday===6))continue
    if(daySelection==='weekends'&&weekday!==0&&weekday!==6)continue
    const busy=dayOccurrences(records,date).filter(item=>!item.transparent)
    if(blockAllDay&&busy.some(item=>item.allDay))continue
    const padding=bufferMinutes*60000
    const blocks=busy.filter(item=>!item.allDay).map(item=>[
      Date.parse(item.start)-padding,Date.parse(item.end)+padding])
    let lastEnd=0
    for(let minute=startHour*60;minute+durationMinutes<=endHour*60;minute+=15){
      let start:string
      try{
        const wall=date+'T'+clock(minute)
        if(localInstantOptions(wall).length!==1)continue
        start=fromLocalDateTime(wall)
      }catch{continue}
      const startMs=Date.parse(start)
      const endMs=startMs+durationMinutes*60000
      if(startMs<earliest||startMs<lastEnd)continue
      // Compare against a local wall-clock closing time, including clock changes.
      let closing:string
      try{
        const wall=date+'T'+clock(endHour*60)
        if(localInstantOptions(wall).length!==1)continue
        closing=fromLocalDateTime(wall)
      }catch{continue}
      if(endMs>Date.parse(closing))continue
      if(blocks.some(([a,b])=>startMs<b&&endMs>a))continue
      result.push({date,start,end:new Date(endMs).toISOString()})
      lastEnd=endMs
      if(result.length>=maxResults)return result
    }
  }
  return result
}
