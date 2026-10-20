import type { CalendarOccurrence, CalendarRecord, CalendarState, LocalDate } from '../types'
import { addDays, day, daysBetween, fromLocalDateTime, localDateTime } from './dates'
import { seriesOccurrenceOn } from './occurrences'
import {zoneWall,resolveZoneInstant} from './time-zone'

/** A replacement is a normal personal event with a durable pointer to its skipped series date. */
export function replaceOccurrence(state:CalendarState,parentId:string,date:LocalDate,replacement:CalendarRecord):CalendarState {
  day(date)
  const parent=state.records.find(r=>r.id===parentId)
  if(!parent||parent.source!=='personal'||!parent.repeat)throw new Error('Recurring series no longer exists')
  if(!seriesOccurrenceOn(parent,date))throw new Error('This series has no editable occurrence on that date')
  if(replacement.source!=='personal'||replacement.repeat||replacement.id===parentId||state.records.some(r=>r.id===replacement.id))throw new Error('Invalid occurrence replacement')
  const nextParent:CalendarRecord={...parent,excludedDates:[...new Set([...(parent.excludedDates??[]),date])].sort(),updatedAt:new Date().toISOString()}
  const detached:CalendarRecord={...replacement,recurrenceParentId:parentId,recurrenceDate:date,updatedAt:new Date().toISOString()}
  return {schemaVersion:1,records:state.records.map(r=>r.id===parentId?nextParent:r).concat(detached)}
}

/** Restore the original generated instance without deleting any other occurrence. */
export function restoreOccurrence(state:CalendarState,replacementId:string):CalendarState {
  const override=state.records.find(r=>r.id===replacementId)
  if(!override?.recurrenceParentId||!override.recurrenceDate)throw new Error('Not a detached occurrence')
  const parent=state.records.find(r=>r.id===override.recurrenceParentId)
  if(!parent?.repeat)throw new Error('The original recurring series no longer exists')
  const dates=parent.excludedDates?.filter(d=>d!==override.recurrenceDate)??[]
  const restored:CalendarRecord={...parent,excludedDates:dates,updatedAt:new Date().toISOString()}
  if(!seriesOccurrenceOn(restored,override.recurrenceDate))throw new Error('Original series no longer includes that date')
  return {schemaVersion:1,records:state.records.filter(r=>r.id!==replacementId).map(r=>r.id===parent.id?restored:r)}
}

/** Move the one event without changing its wall-clock start or elapsed duration. */
export function shiftOccurrence(record:CalendarRecord,instance:CalendarOccurrence,target:LocalDate):CalendarRecord {
  day(target)
  const timestamp=new Date().toISOString()
  const days=daysBetween(instance.startDate,instance.endDateExclusive)
  const start=instance.allDay?new Date(target+'T00:00:00').toISOString():
    record.timeZone?resolveZoneInstant(target+'T'+zoneWall(instance.start,record.timeZone).slice(11),record.timeZone):
    fromLocalDateTime(target+'T'+localDateTime(instance.start).slice(11))
  const end=instance.allDay?new Date(addDays(target,Math.max(1,days))+'T00:00:00').toISOString():
    new Date(Date.parse(start)+Date.parse(instance.end)-Date.parse(instance.start)).toISOString()
  return {...record,start,end,allDay:instance.allDay,
    ...(instance.allDay?{startDate:target,endDateExclusive:addDays(target,Math.max(1,days))}:{startDate:undefined,endDateExclusive:undefined}),
    repeat:undefined,excludedDates:undefined,updatedAt:timestamp}
}

/** A former exception becomes standalone if its entire series is turned into a single event. */
export function saveWholeEvent(state:CalendarState,record:CalendarRecord):CalendarState {
  const old=state.records.find(r=>r.id===record.id)
  if(!old||old.source!=='personal')throw new Error('Original personal event missing')
  const removingRepeat=Boolean(old.repeat&&!record.repeat)
  if(old.repeat&&record.repeat){
    const detached=state.records.filter(r=>r.recurrenceParentId===record.id)
    for(const child of detached){
      const date=child.recurrenceDate!
      if(!record.excludedDates?.includes(date)||
         !seriesOccurrenceOn({...record,excludedDates:record.excludedDates.filter(d=>d!==date)},date))
        throw new Error('This recurrence change excludes a previously edited occurrence on '+date+
          '. Restore its original or remove the edited occurrence first.')
    }
  }
  return {schemaVersion:1,records:state.records.map(r=>{
    if(r.id===record.id)return old.recurrenceParentId?{...record,recurrenceParentId:old.recurrenceParentId,recurrenceDate:old.recurrenceDate}:record
    if(removingRepeat&&r.recurrenceParentId===record.id)return {...r,recurrenceParentId:undefined,recurrenceDate:undefined}
    return r
  })}
}

/**
 * Stage an independent future series without committing it yet.
 * Subsequent editing can change only the new series while past history remains unchanged.
 */
export function splitSeriesAt(state:CalendarState,parentId:string,date:LocalDate,newId:string):CalendarState {
  day(date)
  const parent=state.records.find(r=>r.id===parentId)
  if(!parent?.repeat||parent.source!=='personal')throw new Error('Only personal recurring events can be split')
  if(!newId||state.records.some(r=>r.id===newId))throw new Error('The future series must have a new ID')
  if(state.records.some(r=>r.recurrenceParentId===parentId&&r.recurrenceDate!>=date))
    throw new Error('Restore or remove edited future occurrences before splitting the series')
  const instance=seriesOccurrenceOn(parent,date)
  if(!instance)throw new Error('That date is not an active occurrence in the series')
  const before=addDays(date,-1)
  const oldParent:CalendarRecord={...parent,repeat:{...parent.repeat,until:before},
    excludedDates:parent.excludedDates?.filter(d=>d<date),updatedAt:new Date().toISOString()}
  const next:CalendarRecord={...parent,id:newId,start:instance.start,end:instance.end,
    startDate:instance.allDay?instance.startDate:undefined,
    endDateExclusive:instance.allDay?instance.endDateExclusive:undefined,
    excludedDates:parent.excludedDates?.filter(d=>d>=date),updatedAt:new Date().toISOString()}
  return {schemaVersion:1,records:state.records.map(r=>r.id===parentId?oldParent:r).concat(next)}
}

/** End future repetitions, preserving already-edited future occurrences as standalone events. */
export function endSeriesAt(state:CalendarState,parentId:string,date:LocalDate):CalendarState {
  day(date)
  const parent=state.records.find(r=>r.id===parentId)
  if(!parent?.repeat||parent.source!=='personal')throw new Error('Only a personal series can be ended')
  if(!seriesOccurrenceOn(parent,date))throw new Error('Not an active series occurrence')
  const cutoff:CalendarRecord={...parent,repeat:{...parent.repeat,until:date},
    excludedDates:parent.excludedDates?.filter(d=>d<=date),updatedAt:new Date().toISOString()}
  return {schemaVersion:1,records:state.records.map(r=>{
    if(r.id===parentId)return cutoff
    if(r.recurrenceParentId===parentId&&r.recurrenceDate!>date)
      return {...r,recurrenceParentId:undefined,recurrenceDate:undefined,updatedAt:new Date().toISOString()}
    return r
  })}
}
