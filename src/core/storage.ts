import type {CalendarRecord,CalendarState} from '../types'
import {day} from './dates'
import {validReminderLead} from './reminders'
const KEY='thiepn.calendar.local.v1'
const RECOVERY_KEY='thiepn.calendar.recovery.v1'
const RAW_RESCUE_KEY='thiepn.calendar.raw-rescue.v1'
const empty=():CalendarState=>({schemaVersion:1,records:[]})
export function validateRecord(value:unknown):CalendarRecord {
  if(!value || typeof value!=='object') throw new Error('Invalid event record')
  const r=value as CalendarRecord
  if(typeof r.id!=='string'||r.id.length>160||!r.id || typeof r.title!=='string'||!r.title.trim()||r.title.length>240) throw new Error('Invalid event identity or title')
  if(typeof r.start!=='string'||typeof r.end!=='string'||!Number.isFinite(Date.parse(r.start))||!Number.isFinite(Date.parse(r.end))||Date.parse(r.end)<=Date.parse(r.start)) throw new Error('Invalid event time range')
  if(typeof r.description!=='string'||r.description.length>4000||typeof r.location!=='string'||r.location.length>500)throw new Error('Invalid event details')
  if(typeof r.allDay!=='boolean'||!['personal','ics'].includes(r.source))throw new Error('Invalid event source')
  if(r.transparent!==undefined&&(r.source!=='ics'||r.transparent!==true))
    throw new Error('Only imported ICS records may explicitly be non-blocking')
  if(r.reminderMinutes!==undefined&&(!validReminderLead(r.reminderMinutes)||r.source!=='personal'))
    throw new Error('Invalid personal reminder lead time')
  if(r.allDay){day(r.startDate!);day(r.endDateExclusive!);if(r.endDateExclusive!<=r.startDate!)throw new Error('Invalid all-day dates')}
  if(r.recurrenceParentId!==undefined||r.recurrenceDate!==undefined){
    if(r.source!=='personal'||r.repeat||!r.recurrenceParentId||!r.recurrenceDate)throw new Error('Invalid detached occurrence')
    day(r.recurrenceDate)
    if(r.recurrenceParentId===r.id)throw new Error('A recurring event cannot override itself')
  }
  if(r.repeat){
    if(r.source!=='personal'||!['daily','weekly','monthly'].includes(r.repeat.frequency)||!Number.isInteger(r.repeat.interval)||r.repeat.interval<1||r.repeat.interval>30)throw new Error('Invalid recurrence rule')
    if(r.repeat.until)day(r.repeat.until)
    if(r.repeat.weekdays && (!Array.isArray(r.repeat.weekdays)||r.repeat.weekdays.some(x=>!Number.isInteger(x)||x<0||x>6)))throw new Error('Invalid recurrence weekdays')
  }
  if(r.excludedDates){if(!Array.isArray(r.excludedDates)||r.excludedDates.length>1000)throw new Error('Invalid exclusions');r.excludedDates.forEach(day)}
  return r
}
export function validateState(raw:unknown):CalendarState {
  if(!raw||typeof raw!=='object'||(raw as CalendarState).schemaVersion!==1||!Array.isArray((raw as CalendarState).records))throw new Error('Incompatible backup schema')
  const records=(raw as CalendarState).records
  if(records.length>20000)throw new Error('Too many calendar records')
  const ids=new Set<string>()
  records.forEach(r=>{validateRecord(r);if(ids.has(r.id))throw new Error('Duplicate event ID');ids.add(r.id)})
  const parents=new Map(records.map(r=>[r.id,r]))
  const overrides=new Set<string>()
  records.forEach(r=>{
    if(!r.recurrenceParentId)return
    const parent=parents.get(r.recurrenceParentId)
    if(!parent||parent.source!=='personal'||!parent.repeat||!parent.excludedDates?.includes(r.recurrenceDate!))throw new Error('Detached event has no excluded recurring parent')
    const key=r.recurrenceParentId+'@'+r.recurrenceDate
    if(overrides.has(key))throw new Error('Duplicate recurring occurrence replacement')
    overrides.add(key)
  })
  return {schemaVersion:1,records}
}
export function loadState():{state:CalendarState,error?:string} {
  try {
    const raw=localStorage.getItem(KEY)
    return {state:raw?validateState(JSON.parse(raw)):empty()}
  } catch(error) {
    return {state:empty(),error:'Saved calendar could not be read. Existing data was not overwritten: '+String(error)}
  }
}
export interface RecoverySnapshot {schemaVersion:1;savedAt:string;label:string;state:CalendarState}
/** One validated pre-write checkpoint, not a second writable calendar authority. */
export function saveState(state:CalendarState,label='Previous calendar state'):void {
  const next=JSON.stringify(validateState(state))
  const current=localStorage.getItem(KEY)
  if(current===next)return
  if(current!==null){
    const previous=validateState(JSON.parse(current))
    const snapshot:RecoverySnapshot={schemaVersion:1,savedAt:new Date().toISOString(),label,state:previous}
    localStorage.setItem(RECOVERY_KEY,JSON.stringify(snapshot))
  }
  localStorage.setItem(KEY,next)
}
export function readRecovery():RecoverySnapshot|null {
  const raw=localStorage.getItem(RECOVERY_KEY)
  if(!raw)return null
  const value=JSON.parse(raw) as RecoverySnapshot
  if(value.schemaVersion!==1||typeof value.savedAt!=='string'||!Number.isFinite(Date.parse(value.savedAt))||
    typeof value.label!=='string')throw new Error('Invalid recovery checkpoint')
  return {...value,state:validateState(value.state)}
}
export function rawCalendarBackup():string|null{return localStorage.getItem(KEY)}
export function rescuedUnparsedCalendar():string|null{return localStorage.getItem(RAW_RESCUE_KEY)}
/** Only for an explicitly reviewed valid backup replacing unreadable local bytes.
 * Copy the exact original bytes to a separate rescue key BEFORE writing the new state. */
export function restoreUnreadableCalendar(backup:CalendarState,expectedRaw:string):void {
  const next=JSON.stringify(validateState(backup))
  const current=localStorage.getItem(KEY)
  if(current===null||current!==expectedRaw)throw new Error('Unreadable original changed before repair')
  try{validateState(JSON.parse(current))}
  catch{
    localStorage.setItem(RAW_RESCUE_KEY,current)
    localStorage.setItem(KEY,next)
    return
  }
  throw new Error('Current calendar is valid. Use ordinary guarded restore instead.')
}
export const RECOVERY_STORAGE_KEY=RECOVERY_KEY
export function importBackup(text:string):CalendarState {return validateState(JSON.parse(text))}
export function exportBackup(state:CalendarState):string {return JSON.stringify(validateState(state),null,2)}
export const STORAGE_KEY=KEY
