export const VIEW_PREFERENCES_KEY='thiepn.calendar.view-preferences.v1'
export type ViewMode='month'|'week'|'day'|'agenda'
export type SourceFilter='all'|'personal'|'ics'
export interface ViewPreferences{
  mode:ViewMode
  filter:SourceFilter
  agendaSpan:14|30
  agendaBusyOnly:boolean
  /** Display-only suppression of named imported snapshots, never source deletion. */
  hiddenImportedCalendars?:string[]
}
export const DEFAULT_VIEW_PREFERENCES:ViewPreferences={
  mode:'week',filter:'all',agendaSpan:14,agendaBusyOnly:false
}
export function validateViewPreferences(value:unknown):ViewPreferences{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid view preferences')
  const v=value as Partial<ViewPreferences>
  if(!['month','week','day','agenda'].includes(v.mode??''))throw new Error('Invalid calendar view')
  if(!['all','personal','ics'].includes(v.filter??''))throw new Error('Invalid source filter')
  if(v.agendaSpan!==14&&v.agendaSpan!==30)throw new Error('Invalid agenda span')
  if(typeof v.agendaBusyOnly!=='boolean')throw new Error('Invalid agenda display setting')
  if(v.hiddenImportedCalendars!==undefined){
    if(!Array.isArray(v.hiddenImportedCalendars)||v.hiddenImportedCalendars.length>80||
       v.hiddenImportedCalendars.some(name=>typeof name!=='string'||name.length<1||name.length>100)||
       new Set(v.hiddenImportedCalendars).size!==v.hiddenImportedCalendars.length)
      throw new Error('Invalid hidden imported calendar names')
  }
  return {mode:v.mode!,filter:v.filter!,agendaSpan:v.agendaSpan,agendaBusyOnly:v.agendaBusyOnly,
    ...(v.hiddenImportedCalendars===undefined?{}:{hiddenImportedCalendars:[...v.hiddenImportedCalendars]})}
}
export function loadViewPreferences():ViewPreferences{
  const raw=localStorage.getItem(VIEW_PREFERENCES_KEY)
  return raw?validateViewPreferences(JSON.parse(raw)):DEFAULT_VIEW_PREFERENCES
}
export function saveViewPreferences(preferences:ViewPreferences):void{
  const text=JSON.stringify(validateViewPreferences(preferences))
  if(localStorage.getItem(VIEW_PREFERENCES_KEY)!==text)localStorage.setItem(VIEW_PREFERENCES_KEY,text)
}
export function resetViewPreferences():void{localStorage.removeItem(VIEW_PREFERENCES_KEY)}
