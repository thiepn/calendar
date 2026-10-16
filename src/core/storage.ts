import type {CalendarRecord,CalendarState} from '../types'
import {day} from './dates'
const KEY='thiepn.calendar.local.v1'
const empty=():CalendarState=>({schemaVersion:1,records:[]})
export function validateRecord(value:unknown):CalendarRecord {
  if(!value || typeof value!=='object') throw new Error('Invalid event record')
  const r=value as CalendarRecord
  if(typeof r.id!=='string'||r.id.length>160||!r.id || typeof r.title!=='string'||!r.title.trim()||r.title.length>240) throw new Error('Invalid event identity or title')
  if(typeof r.start!=='string'||typeof r.end!=='string'||!Number.isFinite(Date.parse(r.start))||!Number.isFinite(Date.parse(r.end))||Date.parse(r.end)<=Date.parse(r.start)) throw new Error('Invalid event time range')
  if(typeof r.description!=='string'||r.description.length>4000||typeof r.location!=='string'||r.location.length>500)throw new Error('Invalid event details')
  if(typeof r.allDay!=='boolean'||!['personal','ics'].includes(r.source))throw new Error('Invalid event source')
  if(r.allDay){day(r.startDate!);day(r.endDateExclusive!);if(r.endDateExclusive!<=r.startDate!)throw new Error('Invalid all-day dates')}
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
export function saveState(state:CalendarState):void {
  validateState(state)
  localStorage.setItem(KEY,JSON.stringify(state))
}
export function importBackup(text:string):CalendarState {return validateState(JSON.parse(text))}
export function exportBackup(state:CalendarState):string {return JSON.stringify(validateState(state),null,2)}
export const STORAGE_KEY=KEY
