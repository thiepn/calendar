import {validReminderLead} from './reminders'
export const REMINDER_SETTINGS_KEY='thiepn.calendar.reminder-settings.v1'
export type QuietHours='off'|'22-07'|'00-08'
export interface ReminderSettings {defaultLead:number;quietHours:QuietHours;notificationPreview:'private'|'details'}
export const DEFAULT_REMINDER_SETTINGS:ReminderSettings={defaultLead:-1,quietHours:'off',notificationPreview:'private'}
export function validateReminderSettings(value:unknown):ReminderSettings{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid reminder settings')
  const v=value as ReminderSettings
  if(v.defaultLead!==-1&&!validReminderLead(v.defaultLead))throw new Error('Invalid default reminder lead time')
  if(!['off','22-07','00-08'].includes(v.quietHours))throw new Error('Invalid quiet hours setting')
  // Old device settings did not include notificationPreview. Never expose
  // event titles on a lock screen without a deliberate current opt-in.
  const notificationPreview=v.notificationPreview??'private'
  if(notificationPreview!=='private'&&notificationPreview!=='details')throw new Error('Invalid notification preview preference')
  return {defaultLead:v.defaultLead,quietHours:v.quietHours,notificationPreview}
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

/** Exact foreground notification text, safe for an OS lock screen by default.
 * No calendar location, notes, imported data or personal IDs in private mode. */
export function foregroundNotificationText(title:string,startsAt:string,settings:ReminderSettings):
  {title:string;body:string}{
  const validated=validateReminderSettings(settings)
  if(validated.notificationPreview==='private')
    return {title:'THIEPN Calendar reminder',body:'Open Calendar to review your local reminder.'}
  return {title:'THIEPN Calendar · '+title,
    body:'Local reminder · '+new Date(startsAt).toLocaleString()}
}
