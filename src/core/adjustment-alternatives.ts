import type {CalendarRecord,CalendarState} from '../types'
import {addDays,daysBetween,localDate} from './dates'
import {findFreeSlots,type FreeSlot} from './availability'
import {occurrencesBetween} from './occurrences'
import {proposeTimedChange,type TimedProposal} from './reschedule'
import {validateState} from './storage'

export interface AdjustmentAlternativesOptions {
  days:1|3|7
  bufferMinutes:0|15|30
  now?:Date
  limit?:number
}
export interface AdjustmentAlternative extends FreeSlot {
  minute:number
  lengthMinutes:number
}

/** Search the ORIGINAL saved calendar and temporarily omit only the selected
 * personal occurrence. The original records and imported source ownership are
 * never changed. Every OTHER occurrence of a personal series stays busy. */
function withoutSelectedInstance(records:CalendarRecord[],proposal:TimedProposal):CalendarRecord[]{
  const item=proposal.item
  const source=records.find(record=>record.id===item.recordId)
  if(!source||source.source!=='personal'||item.source!=='personal'||item.allDay)
    throw new Error('Selected personal event no longer exists')
  const original=occurrencesBetween([source],item.date,item.date).find(occ=>occ.key===item.key)
  if(!original||original.start!==item.start||original.end!==item.end||original.title!==item.title)
    throw new Error('Selected original occurrence changed. Reopen its adjustment.')
  if(source.repeat)return records.map(record=>record.id===item.recordId?
    {...record,excludedDates:[...new Set([...(record.excludedDates??[]),item.date])].sort()}:record)
  return records.filter(record=>record.id!==source.id)
}

/** Suggest source-safe alternatives for a pending TIMED personal adjustment.
 * Only finite 15-minute-grid durations <= 4 hours are supported; unusual long
 * or sub-quarter-hour adjustments remain manually editable. The user's chosen
 * source is removed from free/busy exactly once without touching canonical data.
 * Every result is also checked against the real authoritative reschedule domain. */
export function findAdjustmentAlternatives(
  state:CalendarState,proposal:TimedProposal,options:AdjustmentAlternativesOptions
):AdjustmentAlternative[]{
  if(![1,3,7].includes(options.days)||![0,15,30].includes(options.bufferMinutes)||
     options.limit!==undefined&&(!Number.isInteger(options.limit)||options.limit<1||options.limit>12))
    throw new Error('Invalid adjustment alternative search')
  const now=options.now??new Date()
  if(!Number.isFinite(now.getTime()))throw new Error('Invalid current clock')
  const duration=Math.round((Date.parse(proposal.end)-Date.parse(proposal.start))/60000)
  if(!Number.isInteger(duration)||duration<15||duration>240||duration%15)
    throw new Error('Automatic alternatives support 15-minute-grid durations up to 4 hours')
  if(proposal.item.source!=='personal'||proposal.item.allDay)
    throw new Error('Only personal timed appointments can find alternatives')
  const originals=validateState(state).records
  const without=withoutSelectedInstance(originals,proposal)
  const from=proposal.targetDate<localDate(now)?localDate(now):proposal.targetDate
  const preferred=new Date(proposal.start)
  const preferredMinute=preferred.getHours()*60+preferred.getMinutes()
  const candidates:AdjustmentAlternative[]=[]
  // Search each civil day independently; a busy first day must not exhaust the
  // global slot cap and prevent good later-day alternatives.
  for(let i=0;i<options.days;i++){
    const date=addDays(from,i)
    const slots=findFreeSlots(without,{
      from:date,days:1,durationMinutes:duration,startHour:7,endHour:23,
      blockAllDay:true,bufferMinutes:options.bufferMinutes,maxResults:30,now
    })
    for(const slot of slots){
      if(slot.start===proposal.start)continue
      const instant=new Date(slot.start)
      const minute=instant.getHours()*60+instant.getMinutes()
      const reviewed=proposeTimedChange(state,proposal.item,'move',date,minute,duration)
      if(reviewed.start===slot.start&&reviewed.end===slot.end&&!reviewed.conflicts.length)
        candidates.push({...slot,minute,lengthMinutes:duration})
    }
  }
  candidates.sort((a,b)=>{
    const rank=(candidate:AdjustmentAlternative)=>
      daysBetween(from,candidate.date)*1000+
      Math.abs(candidate.minute-preferredMinute)
    return rank(a)-rank(b)||a.start.localeCompare(b.start)
  })
  return candidates.slice(0,options.limit??8)
}
