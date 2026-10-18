import type {CalendarOccurrence,CalendarRecord,CalendarState,LocalDate} from '../types'
import {day,resolveLocalInstant,localInstantOptions,localDateTime,localDate} from './dates'
import {occurrencesBetween} from './occurrences'
import {replaceOccurrence,saveWholeEvent} from './series'
import {validateState} from './storage'

export type TimedAction='move'|'resize'
export interface TimedProposal {
  action:TimedAction
  item:CalendarOccurrence
  start:string
  end:string
  targetDate:LocalDate
  conflicts:CalendarOccurrence[]
}
const pad=(n:number)=>String(n).padStart(2,'0')
const time=(n:number)=>pad(Math.floor(n/60))+':'+pad(n%60)
export function proposeTimedChange(
  state:CalendarState,item:CalendarOccurrence,action:TimedAction,
  targetDate:LocalDate,startMinute:number,lengthMinutes:number,fold?:'earlier'|'later'
):TimedProposal {
  day(targetDate)
  if(item.allDay||item.source!=='personal'||!['move','resize'].includes(action))
    throw new Error('Only timed personal events may be adjusted')
  if(!Number.isInteger(startMinute)||startMinute<0||startMinute>=1440||
    !Number.isInteger(lengthMinutes)||lengthMinutes<15||lengthMinutes>1440)
    throw new Error('Invalid adjusted time')
  const record=state.records.find(x=>x.id===item.recordId)
  if(!record||record.source!=='personal')throw new Error('Personal source event no longer exists')
  if(!occurrencesBetween([record],item.date,item.date).some(x=>x.key===item.key))
    throw new Error('Occurrence changed since selection')
  const start=resolveLocalInstant(targetDate+'T'+time(startMinute),fold)
  const end=new Date(Date.parse(start)+lengthMinutes*60000).toISOString()
  // All saved calendars, regardless of UI visibility filters, contribute to collision warnings.
  const last=localDate(new Date(Date.parse(end)-1))
  const hits=occurrencesBetween(state.records,targetDate,last).filter(x=>{
    if(x.key===item.key||x.transparent)return false
    if(x.allDay)return x.startDate<=last&&x.endDateExclusive>targetDate
    return Date.parse(x.start)<Date.parse(end)&&Date.parse(x.end)>Date.parse(start)
  })
  return {action,item,start,end,targetDate,conflicts:hits}
}
export function applyTimedChange(state:CalendarState,proposal:TimedProposal,idFactory:()=>string):CalendarState {
  const {item,action,start,end}=proposal
  if(item.source!=='personal'||item.allDay||Date.parse(end)<=Date.parse(start))throw new Error('Invalid change proposal')
  const record=state.records.find(x=>x.id===item.recordId)
  if(!record||record.source!=='personal')throw new Error('Event not found')
  // Ensure the source instance has not changed in content or recurrence even inside a single tab.
  const fresh=occurrencesBetween([record],item.date,item.date).find(x=>x.key===item.key)
  if(!fresh||fresh.start!==item.start||fresh.end!==item.end||fresh.title!==item.title)
    throw new Error('Source instance changed; open it again')
  const targetMinute=new Date(start).getHours()*60+new Date(start).getMinutes()
  const choices=localInstantOptions(localDateTime(start))
  const fold=choices.length===2?(choices[0]===start?'earlier':'later'):undefined
  const expected=proposeTimedChange(state,item,action,proposal.targetDate,targetMinute,Math.round((Date.parse(end)-Date.parse(start))/60000),fold)
  if(expected.start!==start||expected.end!==end)throw new Error('Adjusted local time is no longer valid')
  const updated:CalendarRecord={...record,start,end,updatedAt:new Date().toISOString(),
    startDate:undefined,endDateExclusive:undefined}
  const next=record.repeat
    ?replaceOccurrence(state,record.id,item.date,{...updated,id:idFactory(),repeat:undefined,excludedDates:undefined})
    :saveWholeEvent(state,updated)
  return validateState(next)
}
/** Pure shortcut nudge. Shift changes duration; plain arrows move date/time. */
export function nudgeTimed(item:CalendarOccurrence,date:LocalDate,action:'earlier'|'later'|'previous-day'|'next-day'|'shorter'|'longer'):
  {date:LocalDate;minute:number;length:number;kind:TimedAction}{
  if(item.allDay)throw new Error('Timed event required')
  const start=new Date(item.start)
  const length=Math.round((Date.parse(item.end)-Date.parse(item.start))/60000)
  let minute=start.getHours()*60+start.getMinutes()
  let nextDate=date
  let duration=length
  if(action==='earlier')minute-=30
  if(action==='later')minute+=30
  if(action==='shorter')duration-=30
  if(action==='longer')duration+=30
  if(action==='previous-day'||action==='next-day'){
    const d=new Date(date+'T12:00:00')
    d.setDate(d.getDate()+(action==='previous-day'?-1:1))
    nextDate=localDate(d)
  }
  if(minute<0||minute>=1440||duration<15||duration>1440)throw new Error('Adjustment outside supported range')
  return {date:nextDate,minute,length:duration,kind:action==='shorter'||action==='longer'?'resize':'move'}
}
