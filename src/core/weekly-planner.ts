import type {CalendarOccurrence,CalendarRecord,LocalDate} from '../types'
import {addDays,day,localDate,fromLocalDateTime,localInstantOptions} from './dates'
import {occurrencesBetween} from './occurrences'

export interface WeeklyPlanOptions{
  from:LocalDate
  weekday:number
  weeks:4|8
  duration:30|60|90
  window:'daytime'|'evening'
  buffer:0|15|30
  blockAllDay:boolean
}
export interface WeeklyBlocker{
  id:string;key:string;date:LocalDate;start:string;end:string
  title:string;source:'personal'|'ics';sourceCalendar?:string
  hidden:boolean;allDay:boolean
}
export interface WeeklyMeeting{
  date:LocalDate;start:string;end:string
  blockers:WeeklyBlocker[]
  clockUnavailable:boolean
}
export interface WeeklyCandidate{
  clock:string
  available:number
  meetings:WeeklyMeeting[]
  fullyAvailable:boolean
}
export interface WeeklyPlan {
  dates:LocalDate[]
  until:LocalDate
  weeks:4|8
  count:number
  fullyAvailable:number
  candidates:WeeklyCandidate[]
  checkedAt:string
}
function clock(minutes:number):string{
  return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')
}
/** A real recurring commitment proposal, never a set of temporary events.
 * Every candidate must work on all selected weeks before the original event
 * editor may open. Nothing is saved or sent to a calendar provider. */
export function planWeeklyMeeting(
  records:CalendarRecord[],options:WeeklyPlanOptions,
  hiddenNames:readonly string[]=[],now:Date=new Date()
):WeeklyPlan {
  const {from,weekday,weeks,duration,window,buffer,blockAllDay}=options
  day(from)
  if(!Number.isInteger(weekday)||weekday<0||weekday>6||![4,8].includes(weeks)||
    ![30,60,90].includes(duration)||!['daytime','evening'].includes(window)||
    ![0,15,30].includes(buffer)||typeof blockAllDay!=='boolean')
    throw new Error('Invalid weekly meeting plan')
  if(records.length>20000)throw new Error('Too many saved calendar records')
  if(from<localDate(now))throw new Error('Choose today or a future start date')
  const offset=(weekday-day(from).getDay()+7)%7
  const first=addDays(from,offset)
  const dates=Array.from({length:weeks},(_,i)=>addDays(first,7*i))
  const until=dates[dates.length-1]
  const existing=occurrencesBetween(records,addDays(first,-1),addDays(until,1))
  if(existing.length>2500)throw new Error('Too many saved instances. Reduce the selected scope.')
  const owners=new Map(records.map(record=>[record.id,record]))
  const hidden=new Set(hiddenNames)
  const begin=window==='daytime'?8*60:17*60,end=window==='daytime'?19*60:23*60
  const proposals:WeeklyCandidate[]=[]
  for(let minute=begin;minute+duration<=end;minute+=15){
    const meetings:WeeklyMeeting[]=[]
    for(const date of dates){
      const startWall=date+'T'+clock(minute),endWall=date+'T'+clock(minute+duration)
      let start='',finish=''
      let clockUnavailable=false
      try{
        if(localInstantOptions(startWall).length!==1||localInstantOptions(endWall).length!==1)
          throw new Error('Repeated or skipped local clock')
        start=fromLocalDateTime(startWall);finish=fromLocalDateTime(endWall)
        if(Date.parse(finish)-Date.parse(start)!==duration*60000||
          Date.parse(start)<now.getTime())
          throw new Error('Elapsed duration does not match device wall time or date is past')
      }catch{clockUnavailable=true}
      const blockers:WeeklyBlocker[]=[]
      if(!clockUnavailable){
        const a=Date.parse(start)-buffer*60000,b=Date.parse(finish)+buffer*60000
        for(const item of existing){
          if(item.transparent)continue
          if(item.allDay?!blockAllDay?false:item.startDate<=date&&item.endDateExclusive>date:
            a<Date.parse(item.end)&&b>Date.parse(item.start)){
            const record=owners.get(item.recordId)
            if(!record)throw new Error('Original event disappeared')
            blockers.push({id:item.recordId,key:item.key,date:item.date,start:item.start,end:item.end,
              title:item.title,source:item.source,
              ...(record.sourceCalendar?{sourceCalendar:record.sourceCalendar}:{}),
              hidden:item.source==='ics'&&hidden.has(record.sourceCalendar??'Imported'),allDay:item.allDay})
          }
        }
      }
      meetings.push({date,start,end:finish,blockers,clockUnavailable})
    }
    proposals.push({clock:clock(minute),meetings,
      available:meetings.filter(x=>!x.clockUnavailable&&!x.blockers.length).length,
      fullyAvailable:meetings.every(x=>!x.clockUnavailable&&!x.blockers.length)})
  }
  proposals.sort((a,b)=>b.available-a.available||a.clock.localeCompare(b.clock))
  const top=proposals.slice(0,18)
  return {dates,until,weeks,count:proposals.length,
    fullyAvailable:proposals.filter(p=>p.fullyAvailable).length,
    candidates:top,checkedAt:now.toISOString()}
}
export function confirmWeeklyMeeting(records:CalendarRecord[],options:WeeklyPlanOptions,
  clockChoice:string,hiddenNames:readonly string[]=[],now=new Date()
):{date:LocalDate;start:string;end:string;until:LocalDate;weekday:number}{
  const result=planWeeklyMeeting(records,options,hiddenNames,now)
  const selection=result.candidates.find(x=>x.clock===clockChoice&&x.fullyAvailable)
  if(!selection)throw new Error('The weekly time is no longer free across every occurrence. Review the source conflicts.')
  const first=selection.meetings[0]
  return {date:first.date,start:first.start,end:first.end,until:result.until,weekday:options.weekday}
}
