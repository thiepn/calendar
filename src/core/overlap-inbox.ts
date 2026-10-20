import type {CalendarOccurrence,CalendarRecord,CalendarState,LocalDate} from '../types'
import {addDays,day} from './dates'
import {occurrencesBetween} from './occurrences'
import {validateState} from './storage'

export interface OriginalOverlapParticipant {
  item:CalendarOccurrence
  originalSourceKey?:string
  originalTimeZone?:string
  hidden:boolean
}
export interface OriginalOverlap {
  id:string
  first:OriginalOverlapParticipant
  second:OriginalOverlapParticipant
  start:string
  end:string
  day:LocalDate
}
export interface OverlapInbox {
  from:LocalDate;through:LocalDate;days:7|14|30
  overlaps:OriginalOverlap[]
  total:number;hiddenPairs:number;importedPairs:number
  page:number;pages:number;start:number;end:number
  visible:OriginalOverlap[]
  allDayCount:number
}

/** Review all actual UTC timed overlaps using the canonical saved records and
 * existing recurrence materialization. Hidden imported sources remain busy;
 * transparent imported events never contribute timed blocks. No writes. */
export function overlapInbox(state:CalendarState,from:LocalDate,days:7|14|30,
  hiddenNames:readonly string[],page=0,pageSize=12):OverlapInbox {
  day(from)
  if(![7,14,30].includes(days))throw new Error('Choose 7, 14 or 30 days')
  if(!Number.isInteger(page)||page<0||!Number.isInteger(pageSize)||pageSize<1||pageSize>20)
    throw new Error('Invalid overlap page')
  const validated=validateState(state)
  const through=addDays(from,days-1)
  const items=occurrencesBetween(validated.records,from,through)
  if(items.length>2000)throw new Error('Too many original instances. Select a shorter overlap window.')
  const owners=new Map(validated.records.map(record=>[record.id,record]))
  const hidden=new Set(hiddenNames)
  const boundedFrom=new Date(from+'T00:00:00').getTime()
  const boundedTo=new Date(addDays(through,1)+'T00:00:00').getTime()
  const timed=items.filter(item=>!item.allDay&&!item.transparent)
    .sort((a,b)=>a.start.localeCompare(b.start)||a.key.localeCompare(b.key))
  const collisions:OriginalOverlap[]=[]
  for(let i=0;i<timed.length;i++){
    const first=timed[i]
    const firstEnd=Date.parse(first.end)
    for(let j=i+1;j<timed.length;j++){
      const second=timed[j]
      const secondStart=Date.parse(second.start)
      if(secondStart>=firstEnd)break
      const startMs=Math.max(boundedFrom,Date.parse(first.start),secondStart)
      const endMs=Math.min(boundedTo,firstEnd,Date.parse(second.end))
      if(startMs>=endMs)continue
      const source=(item:CalendarOccurrence):OriginalOverlapParticipant=>{
        const record=owners.get(item.recordId)
        if(!record)throw new Error('Original event no longer exists')
        return {item,hidden:record.source==='ics'&&hidden.has(record.sourceCalendar??'Imported'),
          ...(record.sourceKey?{originalSourceKey:record.sourceKey}:{}),
          ...(record.sourceTimeZone||record.timeZone?{originalTimeZone:record.sourceTimeZone??record.timeZone}: {})}
      }
      const key=[first.key,second.key].sort().join('|')
      const instance:OriginalOverlap={id:key,first:source(first),second:source(second),
        start:new Date(startMs).toISOString(),end:new Date(endMs).toISOString(),
        day:from
      }
      const date=new Date(startMs)
      const pad=(n:number)=>String(n).padStart(2,'0')
      instance.day=`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`
      collisions.push(instance)
      if(collisions.length>1000)throw new Error('More than 1,000 overlaps. Select a shorter window.')
    }
  }
  collisions.sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id))
  const pages=Math.max(1,Math.ceil(collisions.length/pageSize))
  const actualPage=Math.min(page,pages-1),offset=actualPage*pageSize
  const visible=collisions.slice(offset,offset+pageSize)
  return {from,through,days,overlaps:collisions,total:collisions.length,
    hiddenPairs:collisions.filter(x=>x.first.hidden||x.second.hidden).length,
    importedPairs:collisions.filter(x=>x.first.item.source==='ics'||x.second.item.source==='ics').length,
    page:actualPage,pages,start:visible.length?offset+1:0,end:offset+visible.length,visible,
    allDayCount:items.filter(x=>x.allDay).length}
}
/** Open only the exact original event identity reviewed: time range, title and
 * original source UID have to match current canonical storage. */
export function resolveOverlapParticipant(state:CalendarState,participant:OriginalOverlapParticipant):CalendarOccurrence {
  const records=validateState(state).records
  const old=participant.item
  const owner=records.find(r=>r.id===old.recordId&&r.source===old.source)
  if(!owner||owner.sourceKey!==participant.originalSourceKey||
    (owner.sourceCalendar??undefined)!==(old.sourceCalendar??undefined)||
    (owner.sourceTimeZone??owner.timeZone)!==participant.originalTimeZone)
    throw new Error('The original source or provider identity changed. Review overlaps again.')
  const current=occurrencesBetween([owner],old.date,old.date)
    .find(x=>x.key===old.key&&x.recordId===old.recordId)
  if(!current||current.start!==old.start||current.end!==old.end||
    current.title!==old.title||current.date!==old.date)
    throw new Error('The original occurrence changed. Review overlaps again.')
  return current
}
