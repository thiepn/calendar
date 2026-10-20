import type {CalendarOccurrence,CalendarRecord,CalendarState,LocalDate} from '../types'
import {addDays,day,daysBetween} from './dates'
import {occurrencesBetween} from './occurrences'
import {replaceOccurrence,saveWholeEvent} from './series'
import {validateState} from './storage'
import {reviewDraft} from './draft'

export interface AllDayProposal {
  item:CalendarOccurrence
  from:LocalDate
  through:LocalDate
  conflicts:CalendarOccurrence[]
  collisionCount:number
}
export function proposeAllDayChange(state:CalendarState,item:CalendarOccurrence,from:LocalDate,through:LocalDate):AllDayProposal{
  day(from);day(through)
  const length=daysBetween(from,through)+1
  if(length<1||length>366)throw new Error('All-day duration must be 1–366 days')
  const record=state.records.find(r=>r.id===item.recordId)
  if(!record||record.source!=='personal'||!record.allDay||!item.allDay)
    throw new Error('Only personal all-day events can be adjusted')
  if(!occurrencesBetween([record],item.date,item.date).some(o=>o.key===item.key))throw new Error('Original all-day occurrence changed')
  const stamp=new Date().toISOString()
  const end=addDays(through,1)
  const proposed:CalendarRecord={...record,allDay:true,
    start:new Date(from+'T00:00:00').toISOString(),end:new Date(end+'T00:00:00').toISOString(),
    startDate:from,endDateExclusive:end,repeat:undefined,excludedDates:undefined,updatedAt:stamp}
  const review=reviewDraft(state.records,proposed,{
    ignoreRecordId:record.repeat?undefined:record.id,
    ignoreOccurrence:record.repeat?{id:record.id,date:item.date}:undefined,
    horizonDays:1
  })
  return {item,from,through,conflicts:review.collisions.map(x=>x.existing),collisionCount:review.collisionCount}
}
export function applyAllDayChange(state:CalendarState,proposal:AllDayProposal,idFactory:()=>string):CalendarState{
  const {item,from,through}=proposal
  const fresh=state.records.find(r=>r.id===item.recordId)
  if(!fresh||fresh.source!=='personal'||!fresh.allDay)throw new Error('Original personal all-day event is missing')
  const current=occurrencesBetween([fresh],item.date,item.date).find(o=>o.key===item.key)
  if(!current||current.start!==item.start||current.end!==item.end||current.title!==item.title)
    throw new Error('Original all-day occurrence changed')
  const check=proposeAllDayChange(state,item,from,through)
  if(check.from!==from||check.through!==through)throw new Error('Invalid adjustment')
  const end=addDays(through,1)
  const updated:CalendarRecord={...fresh,start:new Date(from+'T00:00:00').toISOString(),
    end:new Date(end+'T00:00:00').toISOString(),startDate:from,endDateExclusive:end,
    updatedAt:new Date().toISOString()}
  const next=fresh.repeat?replaceOccurrence(state,fresh.id,item.date,{
    ...updated,id:idFactory(),repeat:undefined,excludedDates:undefined
  }):saveWholeEvent(state,updated)
  return validateState(next)
}
