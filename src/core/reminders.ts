import type {CalendarOccurrence,CalendarRecord,CalendarState} from '../types'
import {addDays,localDate} from './dates'
import {occurrencesBetween} from './occurrences'

export const REMINDER_LEADS=[0,5,10,15,30,60,120,1440,10080] as const
export interface ReminderItem {
  key:string
  recordId:string
  occurrence:CalendarOccurrence
  dueAt:string
  leadMinutes:number
  status:'due'|'upcoming'
}
export interface ReminderAction {kind:'dismiss'|'snooze';until?:string}
export type ReminderActions=Record<string,ReminderAction>
export const REMINDER_ACTIONS_KEY='thiepn.calendar.reminder-actions.v1'
export const REMINDER_DELIVERED_KEY='thiepn.calendar.reminder-delivered.v1'

export function validReminderLead(value:unknown):value is number {
  return typeof value==='number'&&REMINDER_LEADS.some(n=>n===value)
}
export function reminderKey(item:CalendarOccurrence,lead:number):string{
  return [item.recordId,item.date,item.start,lead].join('|')
}
export function reminderItems(state:CalendarState,nowIso:string,actions:ReminderActions={},
  lookAheadDays=14,lookBackDays=1):ReminderItem[]{
  const now=Date.parse(nowIso)
  if(!Number.isFinite(now)||!Number.isInteger(lookAheadDays)||lookAheadDays<1||lookAheadDays>31||
     !Number.isInteger(lookBackDays)||lookBackDays<1||lookBackDays>7)
    throw new Error('Invalid reminder planning range')
  const from=localDate(new Date(now-lookBackDays*86400000))
  // A seven-day lead may become due inside the review window for an event
  // scheduled one further week ahead. Expand source occurrence lookup only.
  const to=addDays(localDate(new Date(now+lookAheadDays*86400000)),8)
  const personal=state.records.filter(r=>r.source==='personal'&&validReminderLead(r.reminderMinutes))
  const parents=new Map(personal.map(r=>[r.id,r]))
  const result:ReminderItem[]=[]
  for(const occ of occurrencesBetween(personal,from,to)){
    const record=parents.get(occ.recordId)
    if(!record||record.reminderMinutes===undefined)continue
    // All-day occurrences use their real start instant, not midnight UTC.
    const due=Date.parse(occ.start)-record.reminderMinutes*60000
    const key=reminderKey(occ,record.reminderMinutes)
    const action=actions[key]
    if(action?.kind==='dismiss')continue
    const activeDue=action?.kind==='snooze'&&action.until?Date.parse(action.until):due
    if(!Number.isFinite(activeDue)||activeDue<now-lookBackDays*86400000||activeDue>now+lookAheadDays*86400000)continue
    result.push({key,recordId:occ.recordId,occurrence:occ,dueAt:new Date(activeDue).toISOString(),
      leadMinutes:record.reminderMinutes,status:activeDue<=now?'due':'upcoming'})
  }
  return result.sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt)||a.occurrence.title.localeCompare(b.occurrence.title)).slice(0,150)
}
/** Snoozing an upcoming event postpones its original due time; it must never
 * silently pull a future reminder forward to now+5 minutes. */
export function proposedSnooze(item:ReminderItem,minutes:5|15|60,nowIso:string):ReminderAction{
  const now=Date.parse(nowIso),scheduled=Date.parse(item.dueAt)
  if(!Number.isFinite(now)||!Number.isFinite(scheduled)||![5,15,60].includes(minutes))
    throw new Error('Invalid snooze request')
  return actionForReminder(item.key,{kind:'snooze',
    until:new Date(Math.max(now,scheduled)+minutes*60000).toISOString()},nowIso)
}
export function actionForReminder(key:string,action:ReminderAction,nowIso:string):ReminderAction{
  if(!key||key.length>600)throw new Error('Invalid reminder key')
  if(action.kind==='dismiss')return {kind:'dismiss'}
  if(action.kind!=='snooze'||!action.until||!Number.isFinite(Date.parse(action.until))||
      Date.parse(action.until)<=Date.parse(nowIso)||Date.parse(action.until)>Date.parse(nowIso)+7*86400000)
    throw new Error('Invalid reminder snooze time')
  return {kind:'snooze',until:new Date(action.until).toISOString()}
}
export function readReminderActions():ReminderActions{
  const raw=localStorage.getItem(REMINDER_ACTIONS_KEY)
  if(!raw)return {}
  const value:unknown=JSON.parse(raw)
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid local reminder actions')
  const result:ReminderActions={}
  for(const [key,action] of Object.entries(value)){
    if(Object.keys(result).length>=1500)break
    if(typeof key!=='string'||key.length>600||!action||typeof action!=='object')continue
    const state=action as ReminderAction
    if(state.kind==='dismiss')result[key]={kind:'dismiss'}
    else if(state.kind==='snooze'&&typeof state.until==='string'&&Number.isFinite(Date.parse(state.until)))
      result[key]={kind:'snooze',until:state.until}
  }
  return result
}
export function saveReminderActions(actions:ReminderActions):void {
  localStorage.setItem(REMINDER_ACTIONS_KEY,JSON.stringify(Object.fromEntries(Object.entries(actions).slice(-1500))))
}
/** Foreground-only notification delivery, never a background guarantee.
 * Call only after a user opts into browser notifications. */
export function deliverableReminders(items:ReminderItem[],nowIso:string,delivered:Set<string>):ReminderItem[]{
  const now=Date.parse(nowIso)
  return items.filter(item=>item.status==='due'&&now-Date.parse(item.dueAt)<=15*60000&&!delivered.has(item.key+'@'+item.dueAt))
}
export function reminderForRecord(record:CalendarRecord):number|undefined {
  return record.source==='personal'&&validReminderLead(record.reminderMinutes)?record.reminderMinutes:undefined
}

/** Single atomic local preference update for deliberately reviewed reminders.
 * Never mutates source calendar records or silently dismisses unseen items. */
export function dismissReminderBatch(current:ReminderActions,items:ReminderItem[]):ReminderActions {
  if(items.length===0||items.length>150||items.some(item=>item.status!=='due'))
    throw new Error('Review due reminders before dismissing this batch')
  const next={...current}
  for(const item of items)next[item.key]={kind:'dismiss'}
  return next
}
