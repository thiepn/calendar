import type {CalendarOccurrence,CalendarRecord,LocalDate} from '../types'
import {addDays,resolveLocalInstant,fromUnambiguousLocalDateTime,localDate,localDateTime} from './dates'
import {occurrencesBetween} from './occurrences'
import {zoneDate,zoneWall,zoneInstantOptions,resolveZoneInstant} from './time-zone'

export interface DraftHit { candidate:CalendarOccurrence; existing:CalendarOccurrence }
export interface DraftReview {
  collisions:DraftHit[]
  collisionCount:number
  missingOrAmbiguousDates:LocalDate[]
  affectedClockCount:number
  checkedThrough:LocalDate
  repeating:boolean
}
/** Both ends of edited wall-clock ranges must resolve to exactly one instant. */
export function draftTimedRange(start:string,end:string,startFold?:'earlier'|'later',endFold?:'earlier'|'later',timeZone?:string):{start:string;end:string}{
  const first=timeZone?resolveZoneInstant(start,timeZone,startFold):resolveLocalInstant(start,startFold)
  const last=timeZone?resolveZoneInstant(end,timeZone,endFold):resolveLocalInstant(end,endFold)
  if(Date.parse(last)<=Date.parse(first))throw new Error('End must follow start')
  return {start:first,end:last}
}
/** Recurrence review deliberately caps future checks. No unlimited series is called conflict-free. */
export function reviewDraft(records:CalendarRecord[],candidate:CalendarRecord,options:{
  ignoreRecordId?:string
  ignoreParentFrom?:{id:string;date:LocalDate}
  ignoreOccurrence?:{id:string;date:LocalDate}
  horizonDays?:number
}={}):DraftReview {
  const horizon=options.horizonDays??90
  if(!Number.isInteger(horizon)||horizon<1||horizon>366)throw new Error('Invalid conflict review window')
  const startDate=candidate.allDay?candidate.startDate!:candidate.timeZone?zoneDate(candidate.start,candidate.timeZone):localDate(new Date(candidate.start))
  const until=addDays(startDate,horizon-1)
  // A year is deliberately capped to avoid unbounded iteration. This is a preview,
  // not evidence that events beyond checkedThrough are conflict-free.
  // The source timezone's first occurrence may be on the previous viewer day.
  // Keep review anchored to source-date identities, then compare true UTC instants.
  const candidates=occurrencesBetween([candidate],addDays(startDate,-2),addDays(until,2))
    .filter(item=>item.date>=startDate&&item.date<=until)
  const earliest=addDays(startDate,-31)
  const existing=occurrencesBetween(records,earliest,addDays(until,31)).filter(x=>{
    if(x.transparent)return false
    if(x.recordId===options.ignoreRecordId)return false
    if(options.ignoreParentFrom?.id===x.recordId&&x.date>=options.ignoreParentFrom.date)return false
    if(options.ignoreOccurrence?.id===x.recordId&&x.date===options.ignoreOccurrence.date)return false
    return true
  })
  const collisions:DraftHit[]=[]
  let collisionCount=0
  for(const candidateOccurrence of candidates){
    const a=Date.parse(candidateOccurrence.start),b=Date.parse(candidateOccurrence.end)
    for(const other of existing){
      if(a<Date.parse(other.end)&&b>Date.parse(other.start)){
        collisionCount++
        if(collisions.length<12)collisions.push({candidate:candidateOccurrence,existing:other})
      }
    }
  }
  const missingOrAmbiguousDates:LocalDate[]=[]
  let affectedClockCount=0
  if(candidate.repeat&&!candidate.allDay){
    // Generate the recurrence anchors from an all-day equivalent; timed expansion
    // silently drops nonexistent spring occurrences, which this check must detect.
    const wall=(candidate.timeZone?zoneWall(candidate.start,candidate.timeZone):localDateTime(candidate.start)).slice(11)
    const probe:CalendarRecord={...candidate,timeZone:undefined,allDay:true,
      start:new Date(startDate+'T00:00:00').toISOString(),
      end:new Date(addDays(startDate,1)+'T00:00:00').toISOString(),
      startDate,endDateExclusive:addDays(startDate,1)}
    for(const instance of occurrencesBetween([probe],startDate,addDays(startDate,365))){
      try{
        if(candidate.timeZone){if(zoneInstantOptions(instance.date+'T'+wall,candidate.timeZone).length!==1)throw new Error('Ambiguous or missing source clock')}
        else fromUnambiguousLocalDateTime(instance.date+'T'+wall)
      }
      catch {
        affectedClockCount++
        if(missingOrAmbiguousDates.length<10)missingOrAmbiguousDates.push(instance.date)
      }
    }
  }
  return {collisions,collisionCount,missingOrAmbiguousDates,affectedClockCount,
    checkedThrough:until,repeating:Boolean(candidate.repeat)}
}
