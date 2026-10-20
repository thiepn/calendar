import type {CalendarRecord,CalendarOccurrence,CalendarState,LocalDate} from '../types'
import {addDays,day,daysBetween} from './dates'
import {occurrencesBetween} from './occurrences'
import {validateState} from './storage'

export type TrailTarget={kind:'series';recordId:string}|{kind:'source';name:string}
export type TrailRow={
  key:string;kind:'occurrence'|'skipped';date:LocalDate
  item?:CalendarOccurrence;originalDate?:LocalDate
  title:string;sourceName?:string;sourceTimeZone?:string;sourceKey?:string
  transparent:boolean
}
export interface TrailPage {
  title:string;from:LocalDate;through:LocalDate
  total:number;active:number;skipped:number;detached:number
  page:number;pages:number;start:number;end:number
  previous:boolean;next:boolean;rows:TrailRow[]
  scope:'series'|'source'
}
export function originalTrailRecords(state:CalendarState,target:TrailTarget):CalendarRecord[]{
  const verified=validateState(state)
  if(target.kind==='source'){
    if(!target.name||target.name.length>100)throw new Error('Invalid imported source name')
    const entries=verified.records.filter(record=>record.source==='ics'&&record.sourceCalendar===target.name)
    if(!entries.length)throw new Error('This imported source is no longer in Calendar')
    return entries
  }
  const picked=verified.records.find(record=>record.id===target.recordId)
  if(!picked||picked.source!=='personal')throw new Error('Original personal series no longer exists')
  const master=picked.recurrenceParentId?
    verified.records.find(record=>record.id===picked.recurrenceParentId):picked
  if(!master||master.source!=='personal'||!master.repeat)
    throw new Error('This original event is not part of a recurring series')
  return [master,...verified.records.filter(record=>record.recurrenceParentId===master.id)]
}
export function originalTrailPage(state:CalendarState,target:TrailTarget,
  from:LocalDate,days:30|90,page:number,pageSize=16):TrailPage{
  day(from)
  if(days!==30&&days!==90)throw new Error('Choose a 30- or 90-day trail')
  if(!Number.isInteger(page)||page<0||!Number.isInteger(pageSize)||pageSize<1||pageSize>30)
    throw new Error('Invalid trail page')
  const records=originalTrailRecords(state,target)
  const through=addDays(from,days-1)
  if(daysBetween(from,through)!==days-1)throw new Error('Invalid trail date span')
  const byId=new Map(records.map(record=>[record.id,record]))
  const existing=occurrencesBetween(records,from,through)
  const rows:TrailRow[]=existing.map(item=>{
    const original=byId.get(item.recordId)!
    return {kind:'occurrence',key:item.key,date:item.date,item,title:item.title,
      ...(original.recurrenceDate?{originalDate:original.recurrenceDate}:{}),
      ...(original.sourceCalendar?{sourceName:original.sourceCalendar}:{}),
      ...(original.sourceKey?{sourceKey:original.sourceKey}:{}),
      ...(original.sourceTimeZone||original.timeZone?{sourceTimeZone:original.sourceTimeZone??original.timeZone}:{}),
      transparent:Boolean(item.transparent)}
  })
  if(target.kind==='series'){
    const master=records[0]
    const replaced=new Set(records.slice(1).map(record=>record.recurrenceDate))
    for(const date of master.excludedDates??[]){
      if(date<from||date>through||replaced.has(date))continue
      // Excluded dates are original source slots only when the actual
      // rule would materialize on that date without its exclusion.
      const probe=occurrencesBetween([{...master,excludedDates:[]}],date,date)
      if(!probe.some(item=>item.date===date))continue
      rows.push({kind:'skipped',key:'skip:'+master.id+'@'+date,date,
        title:master.title,transparent:false})
    }
  }
  rows.sort((a,b)=>a.date.localeCompare(b.date)||
    (a.kind==='skipped'?-1:b.kind==='skipped'?1:0)||
    (a.item?.start??'').localeCompare(b.item?.start??'')||a.key.localeCompare(b.key))
  if(rows.length>1000)throw new Error('Too many trail entries; select a shorter range')
  const pages=Math.max(1,Math.ceil(rows.length/pageSize))
  const actualPage=Math.min(page,pages-1)
  const offset=actualPage*pageSize
  const visible=rows.slice(offset,offset+pageSize)
  return {title:target.kind==='source'?target.name:records[0].title,scope:target.kind,
    from,through,total:rows.length,active:rows.filter(row=>row.kind==='occurrence').length,
    skipped:rows.filter(row=>row.kind==='skipped').length,
    detached:rows.filter(row=>row.originalDate!==undefined).length,
    page:actualPage,pages,start:visible.length?offset+1:0,
    end:offset+visible.length,previous:actualPage>0,next:actualPage+1<pages,rows:visible}
}
/** Verify source-owned identity is still current before opening an occurrence.
 * Never reopen a stale detached instance or rewritten provider UID by title. */
export function resolveTrailSelection(state:CalendarState,target:TrailTarget,
  proposed:TrailRow,from:LocalDate,days:30|90):CalendarOccurrence{
  if(proposed.kind!=='occurrence'||!proposed.item)throw new Error('Skipped dates have no event to open')
  const latest=originalTrailPage(state,target,from,days,0,30)
  // Search all pages, not just the visible one, after re-reading canonical state.
  const pages=latest.pages
  for(let page=0;page<pages;page++){
    const result=page===0?latest:originalTrailPage(state,target,from,days,page,30)
    const found=result.rows.find(row=>row.kind==='occurrence'&&row.key===proposed.key)
    if(!found?.item)continue
    const original=proposed.item,current=found.item
    if(current.recordId!==original.recordId||current.date!==original.date||
      current.start!==original.start||current.end!==original.end||
      current.title!==original.title||current.sourceCalendar!==original.sourceCalendar||
      found.sourceKey!==proposed.sourceKey)
      throw new Error('Original event changed after trail review. Reload trail before opening.')
    return current
  }
  throw new Error('Original occurrence is no longer present. Refresh the trail.')
}
