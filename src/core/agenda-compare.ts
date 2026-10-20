import type {CalendarOccurrence,CalendarRecord,LocalDate} from '../types'
import {day} from './dates'
import {dayJumpPage,type DayJumpPage} from './day-navigator'
import {dayOccurrences,conflictsOnDay} from './occurrences'
import {sevenDayWorkload} from './planning'

export interface ComparedAgendaDay {
  date:LocalDate;events:DayJumpPage;busyMinutes:number;allDayCount:number
  importedCount:number;overlaps:number;sourceCounts:readonly {name:string;count:number}[]
  matchingOwners:number;conflicts:ReadonlySet<string>;sharedKeys:ReadonlySet<string>
}
export interface AgendaDayComparison {
  first:ComparedAgendaDay;second:ComparedAgendaDay;sharedOwnerCount:number
}
/** Original owner identity (not title or location), including detached edits.
 * Imported provider identities must remain specific to their source records. */
function canonicalOwner(record:CalendarRecord):string {
  return record.source==='personal'?'personal:'+(record.recurrenceParentId??record.id):
    'ics:'+(record.sourceKey??record.id)
}
function dayCompareSide(
  records:CalendarRecord[],date:LocalDate,page:number,pageSize:number,
  owners:Map<string,string>,otherOwners:Set<string>
):ComparedAgendaDay{
  const events=dayJumpPage(records,date,page,pageSize)
  const all=dayOccurrences(records,date)
  const summary=sevenDayWorkload(records,date)[0]
  const conflicts=conflictsOnDay(all)
  const sharedKeys=new Set(all.filter(item=>otherOwners.has(owners.get(item.recordId)??''))
    .map(item=>item.key))
  const counts=new Map<string,number>()
  for(const item of all){
    const name=item.source==='personal'?'Personal':item.sourceCalendar??'Imported'
    counts.set(name,(counts.get(name)??0)+1)
  }
  return {date,events,busyMinutes:summary.busyMinutes,
    allDayCount:summary.allDayCount,importedCount:summary.importedCount,
    overlaps:conflicts.size,sourceCounts:[...counts.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([name,count])=>({name,count})),
    matchingOwners:new Set(all.map(item=>owners.get(item.recordId)).filter(v=>v&&otherOwners.has(v))).size,
    conflicts,sharedKeys}
}
/** Read-only comparison of two source-filtered original days, using the
 * existing day paging, recurrence, overlap and timed-union authorities. */
export function compareAgendaDays(records:CalendarRecord[],first:LocalDate,second:LocalDate,
  firstPage=0,secondPage=0,pageSize=12):AgendaDayComparison{
  day(first);day(second)
  if(first===second)throw new Error('Choose two different days to compare')
  if(records.length>20000)throw new Error('Too many original records')
  const owners=new Map(records.map(record=>[record.id,canonicalOwner(record)]))
  const firstOwners=new Set(dayOccurrences(records,first).map(item=>owners.get(item.recordId)!))
  const secondOwners=new Set(dayOccurrences(records,second).map(item=>owners.get(item.recordId)!))
  const sharedOwnerCount=[...firstOwners].filter(owner=>secondOwners.has(owner)).length
  return {first:dayCompareSide(records,first,firstPage,pageSize,owners,secondOwners),
    second:dayCompareSide(records,second,secondPage,pageSize,owners,firstOwners),
    sharedOwnerCount}
}
/** Only reopen an occurrence if the saved original still has the same owner,
 * occurrence date, canonical UTC range and current visible source authority. */
export function resolveComparedOccurrence(records:CalendarRecord[],date:LocalDate,
  candidate:CalendarOccurrence,original:CalendarRecord):CalendarOccurrence{
  const record=records.find(item=>item.id===candidate.recordId)
  if(!record||record.source!==original.source||record.sourceKey!==original.sourceKey||
    record.sourceCalendar!==original.sourceCalendar)
    throw new Error('Original source is no longer visible or changed since comparison')
  const current=dayOccurrences([record],date).find(item=>item.key===candidate.key&&
    item.recordId===candidate.recordId)
  if(!current||current.start!==candidate.start||current.end!==candidate.end||
    current.title!==candidate.title||current.date!==candidate.date)
    throw new Error('Original occurrence changed since comparison. Review updated dates.')
  return current
}
