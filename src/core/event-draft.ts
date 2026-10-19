import type {CalendarRecord,CalendarState,LocalDate} from '../types'
import type {EventEditorFields} from './editor-changes'
import {changedEditorFields} from './editor-changes'
import {day} from './dates'
import {validateRecord,validateState} from './storage'
import {splitSeriesAt} from './series'
import {seriesOccurrenceOn} from './occurrences'
import {deviceTimeZone,validTimeZone} from './time-zone'

export const EVENT_DRAFT_KEY='thiepn.calendar.event-draft.v1'

export interface EventDraftOrigin {
  date:LocalDate
  event?:CalendarRecord
  baseRecord?:CalendarRecord
  initialRange?:{start:string;end:string}
  initialAllDay?:{from:LocalDate;through:LocalDate}
  copy:boolean
  instance?:{parentId:string;date:LocalDate}
  future?:{parentId:string;date:LocalDate;newId:string}
  defaultReminderMinutes:number
  deviceTimeZone?:string
}
export interface SavedEventDraft {
  schemaVersion:1
  id:string
  revision:string
  savedAt:string
  origin:EventDraftOrigin
  initial:EventEditorFields
  fields:EventEditorFields
}
function object(v:unknown):Record<string,unknown>{
  if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid unfinished draft')
  return v as Record<string,unknown>
}
function fields(v:unknown):EventEditorFields {
  const f=object(v)
  for(const [key,max] of [['title',240],['description',4000],['location',500],['start',32],['end',32],['until',10]] as const){
    if(typeof f[key]!=='string'||(f[key] as string).length>max)throw new Error('Invalid draft '+key)
  }
  if(typeof f.allDay!=='boolean'||!Number.isInteger(f.reminder)||![-1,0,5,10,15,30,60,120,1440,10080].includes(f.reminder as number))
    throw new Error('Invalid draft reminder')
  if(f.timeZone!==undefined)validTimeZone(f.timeZone as string)
  if(!['','earlier','later'].includes(f.startFold as string)||!['','earlier','later'].includes(f.endFold as string)||
     !['none','daily','weekly','monthly'].includes(f.frequency as string))
    throw new Error('Invalid draft recurrence or DST fold')
  if(!Number.isInteger(f.interval)||(f.interval as number)<0||(f.interval as number)>30||
    !Array.isArray(f.weekdays)||f.weekdays.length>7||f.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)||
    new Set(f.weekdays).size!==f.weekdays.length)throw new Error('Invalid draft weekdays or interval')
  const start=f.start as string,end=f.end as string,until=f.until as string
  for(const value of [start,end,until]){
    if(!/^[0-9T:-]*$/.test(value))throw new Error('Invalid draft date input')
    if(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value))day(value.slice(0,10))
  }
  return f as unknown as EventEditorFields
}
function origin(v:unknown):EventDraftOrigin{
  const o=object(v)
  day(o.date as string)
  if(typeof o.copy!=='boolean'||!Number.isInteger(o.defaultReminderMinutes)||![-1,0,5,10,15,30,60,120,1440,10080].includes(o.defaultReminderMinutes as number))
    throw new Error('Invalid draft origin')
  if(o.deviceTimeZone!==undefined)validTimeZone(o.deviceTimeZone as string)
  if(o.event!==undefined){validateRecord(o.event);if((o.event as CalendarRecord).source!=='personal')throw new Error('Imported event cannot be edited')}
  if(o.baseRecord!==undefined){validateRecord(o.baseRecord);if((o.baseRecord as CalendarRecord).source!=='personal')throw new Error('Invalid draft owner')}
  if(o.initialRange!==undefined){const r=object(o.initialRange);if(typeof r.start!=='string'||typeof r.end!=='string'||!Number.isFinite(Date.parse(r.start))||!Number.isFinite(Date.parse(r.end)))throw new Error('Invalid initial range')}
  if(o.initialAllDay!==undefined){const r=object(o.initialAllDay);day(r.from as string);day(r.through as string)}
  for(const name of ['instance','future'] as const)if(o[name]!==undefined){
    const r=object(o[name])
    if(typeof r.parentId!=='string'||!r.parentId||r.parentId.length>160)throw new Error('Invalid parent link')
    day(r.date as string)
    if(name==='future'&&(typeof r.newId!=='string'||!r.newId||r.newId.length>160))throw new Error('Invalid future-series ID')
  }
  if(o.instance&&o.future||((o.instance||o.future)&&(!o.event||!o.baseRecord||o.copy)))
    throw new Error('Invalid draft editing scope')
  if(o.copy&&(!o.event||o.baseRecord)||(!o.copy&&o.event&&!o.baseRecord))
    throw new Error('Invalid draft source identity')
  if(o.baseRecord&&o.event&&!o.copy&&!o.instance&&!o.future&&
    (o.baseRecord as CalendarRecord).id!==(o.event as CalendarRecord).id)
    throw new Error('Draft editor does not match original event')
  return o as unknown as EventDraftOrigin
}
export function validateEventDraft(raw:unknown):SavedEventDraft{
  const d=object(raw)
  if(d.schemaVersion!==1||typeof d.id!=='string'||!d.id||d.id.length>160||
     typeof d.revision!=='string'||!d.revision||d.revision.length>160||
     typeof d.savedAt!=='string'||!Number.isFinite(Date.parse(d.savedAt)))throw new Error('Incompatible unfinished draft')
  const parsed:SavedEventDraft={schemaVersion:1,id:d.id,revision:d.revision,savedAt:d.savedAt,
    origin:origin(d.origin),initial:fields(d.initial),fields:fields(d.fields)}
  if(!changedEditorFields(parsed.initial,parsed.fields).length)throw new Error('Unchanged draft must not be persisted')
  return parsed
}
export function readEventDraft():SavedEventDraft|null{
  const raw=localStorage.getItem(EVENT_DRAFT_KEY)
  if(!raw)return null
  if(raw.length>20000)throw new Error('Unfinished draft exceeds safe device limit')
  return validateEventDraft(JSON.parse(raw))
}
export function writeEventDraft(next:Omit<SavedEventDraft,'schemaVersion'|'revision'|'savedAt'>,expectedRevision:string|null):SavedEventDraft {
  const existing=readEventDraft()
  if(existing?.id!==next.id||existing?.revision!==(expectedRevision??undefined)){
    if(existing||expectedRevision!==null)throw new Error('A draft changed in another tab. Nothing was overwritten.')
  }
  const saved=validateEventDraft({...next,schemaVersion:1,revision:crypto.randomUUID(),savedAt:new Date().toISOString()})
  localStorage.setItem(EVENT_DRAFT_KEY,JSON.stringify(saved))
  return saved
}
export function clearEventDraft(id:string,expectedRevision:string|null):void{
  if(expectedRevision===null)return
  const existing=readEventDraft()
  if(!existing||existing.id!==id||existing.revision!==expectedRevision)
    throw new Error('The saved draft changed in another tab; it was preserved')
  localStorage.removeItem(EVENT_DRAFT_KEY)
}
export function assertDraftCanResume(draft:SavedEventDraft,state:CalendarState):void{
  validateState(state)
  const o=validateEventDraft(draft).origin
  if(!draft.fields.timeZone&&o.deviceTimeZone&&deviceTimeZone()!==o.deviceTimeZone)
    throw new Error('This draft used another device time zone. Export it before changing times.')
  if(o.baseRecord){
    const current=state.records.find(r=>r.id===o.baseRecord!.id)
    if(!current||JSON.stringify(current)!==JSON.stringify(o.baseRecord))
      throw new Error('The original event changed or was deleted. This draft cannot safely resume.')
    if(o.instance||o.future){
      if(!current.repeat)throw new Error('Original series is no longer repeating')
      const link=o.instance??o.future!
      if(link.parentId!==current.id)throw new Error('Recurring parent no longer matches')
      if(o.instance&&!seriesOccurrenceOn(current,link.date))
        throw new Error('Original recurring occurrence no longer exists')
      if(o.future)splitSeriesAt(state,link.parentId,link.date,o.future.newId)
    }
  }
  if(o.event&&!o.baseRecord&&state.records.some(r=>r.id===o.event!.id))
    throw new Error('Draft event ID is already saved. Review the existing calendar first.')
  if((o.instance||o.future)&&state.records.some(r=>r.id===o.event!.id))
    throw new Error('Generated occurrence ID was already used')
  // All other calendar records, including hidden imported sources, are re-reviewed by
  // the original EventEditor on resume. The draft itself has no write authority.
}
