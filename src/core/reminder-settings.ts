import {validReminderLead} from './reminders'
export const REMINDER_SETTINGS_KEY='thiepn.calendar.reminder-settings.v1'
export type QuietHours='off'|'22-07'|'00-08'
export interface ReminderSettings {defaultLead:number;quietHours:QuietHours}
export const DEFAULT_REMINDER_SETTINGS:ReminderSettings={defaultLead:-1,quietHours:'off'}
export function validateReminderSettings(value:unknown):ReminderSettings{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid reminder settings')
  const v=value as ReminderSettings
  if(v.defaultLead!==-1&&!validReminderLead(v.defaultLead))throw new Error('Invalid default reminder lead time')
  if(!['off','22-07','00-08'].includes(v.quietHours))throw new Error('Invalid quiet hours setting')
  return {defaultLead:v.defaultLead,quietHours:v.quietHours}
}
export function loadReminderSettings():ReminderSettings{
  const raw=localStorage.getItem(REMINDER_SETTINGS_KEY)
  return raw?validateReminderSettings(JSON.parse(raw)):DEFAULT_REMINDER_SETTINGS
}
export function saveReminderSettings(value:ReminderSettings):void{
  localStorage.setItem(REMINDER_SETTINGS_KEY,JSON.stringify(validateReminderSettings(value)))
}
export function inQuietHours(nowIso:string,setting:QuietHours):boolean{
  if(setting==='off')return false
  const date=new Date(nowIso)
  if(!Number.isFinite(date.getTime()))throw new Error('Invalid reminder clock')
  const hour=date.getHours()
  if(setting==='22-07')return hour>=22||hour<7
  return hour>=0&&hour<8
}
