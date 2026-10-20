import type {CalendarOccurrence,CalendarRecord,CalendarState,LocalDate} from '../types'
import {addDays,dateSeries,daysBetween,day,localDate} from './dates'
import {findFreeSlots,type FreeSlot} from './availability'
import {occurrencesBetween} from './occurrences'
import {validateState} from './storage'

export interface PreparationAnchor {
  item:CalendarOccurrence
  originalSourceKey?:string
  originalTimeZone?:string
}
export interface PreparationOptions {
  lookback:7|14
  sessions:2|3|4|5|6
  duration:30|60|90
  hours:'morning'|'afternoon'|'evening'
  days:'all'|'weekdays'|'weekends'
  buffer:0|15|30
  blockAllDay:boolean
}
export interface PreparationDay {
  date:LocalDate
  choices:FreeSlot[]
  recommended:boolean
}
export interface PreparationPlan {
  title:string
  anchorDate:LocalDate
  deadline:string
  from:LocalDate
  until:LocalDate
  requested:number
  possible:number
  shortfall:number
  days:PreparationDay[]
}
const ranges={morning:[7,12],afternoon:[12,18],evening:[17,23]} as const
/** Every action on a preparation plan rechecks the exact original occurrence
 * and imported UID. Never infer source identity from a title or wall time. */
export function resolvePreparationAnchor(state:CalendarState,anchor:PreparationAnchor):CalendarOccurrence{
  const records=validateState(state).records
  const previous=anchor.item
  const record=records.find(row=>row.id===previous.recordId&&row.source===previous.source)
  if(!record||record.sourceKey!==anchor.originalSourceKey||
    (record.sourceTimeZone??record.timeZone)!==anchor.originalTimeZone||
    (record.sourceCalendar??undefined)!==(previous.sourceCalendar??undefined))
    throw new Error('Original event or imported source identity changed. Review the event again.')
  const actual=occurrencesBetween([record],previous.date,previous.date)
    .find(row=>row.key===previous.key&&row.recordId===previous.recordId)
  if(!actual||actual.start!==previous.start||actual.end!==previous.end||
    actual.title!==previous.title||actual.date!==previous.date||
    actual.allDay!==previous.allDay)
    throw new Error('Original occurrence changed. Review the event again.')
  return actual
}
function checkOptions(o:PreparationOptions){
  if(![7,14].includes(o.lookback)||![2,3,4,5,6].includes(o.sessions)||
    ![30,60,90].includes(o.duration)||!Object.hasOwn(ranges,o.hours)||
    !['all','weekdays','weekends'].includes(o.days)||![0,15,30].includes(o.buffer)||
    typeof o.blockAllDay!=='boolean')
    throw new Error('Invalid preparation plan options')
}
/** Source-complete, event-anchored preparation. Each date offers *alternative*
 * non-overlapping suggestions, not multiple reserved events. Reuse the original
 * Find Time engine, including DST and imported TRANSP source authority. */
export function planPreparationBlocks(state:CalendarState,anchor:PreparationAnchor,
  options:PreparationOptions,now=new Date()):PreparationPlan{
  checkOptions(options)
  if(!Number.isFinite(now.getTime()))throw new Error('Invalid current time')
  const original=resolvePreparationAnchor(state,anchor)
  const deadline=original.start
  const date=original.allDay?original.startDate:localDate(new Date(deadline))
  const today=localDate(now)
  const beginning=addDays(date,original.allDay?-options.lookback:1-options.lookback)
  const from=beginning<today?today:beginning
  const until=original.allDay?addDays(date,-1):date
  const found:PreparationDay[]=[]
  if(from<=until&&Date.parse(deadline)>now.getTime()){
    const dates=dateSeries(from,until,15)
    const [startHour,endHour]=ranges[options.hours]
    for(const candidateDate of dates){
      const candidates=findFreeSlots(state.records,{
        from:candidateDate,days:1,durationMinutes:options.duration,
        startHour,endHour,blockAllDay:options.blockAllDay,
        daySelection:options.days,bufferMinutes:options.buffer,maxResults:100,now
      }).filter(slot=>Date.parse(slot.end)<=Date.parse(deadline))
      // Last three opportunities on a day, for user choice. These are
      // alternatives, never three independent reserved preparation blocks.
      found.push({date:candidateDate,choices:candidates.slice(-3).reverse(),recommended:false})
    }
  }
  let remaining=options.sessions
  // Recommend distinct real calendar days closest to the anchor first.
  for(let i=found.length-1;i>=0;i--){
    if(found[i].choices.length&&remaining>0){found[i].recommended=true;remaining--}
  }
  const possible=found.filter(x=>x.choices.length>0).length
  return {title:original.title,anchorDate:date,deadline,from,until,
    requested:options.sessions,possible,shortfall:Math.max(0,options.sessions-possible),
    days:found.reverse()}
}
/** Revalidate every original source against the current local store BEFORE
 * handing this independent personal block to the original event editor. */
export function confirmPreparationSlot(state:CalendarState,anchor:PreparationAnchor,
  options:PreparationOptions,proposed:FreeSlot,now=new Date()):FreeSlot{
  const plan=planPreparationBlocks(state,anchor,options,now)
  const current=plan.days.flatMap(x=>x.choices).find(x=>
    x.date===proposed.date&&x.start===proposed.start&&x.end===proposed.end)
  if(!current)throw new Error('The preparation time is no longer available. Review the current plan.')
  return current
}
