import {useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react'
import {CalendarDays,ChevronLeft,ChevronRight,Bell,Plus,Upload,Download,Search,Database,ExternalLink,AlertTriangle,Trash2,Pencil,X,RotateCcw,Menu,Clock3} from 'lucide-react'
import type {CalendarOccurrence,CalendarRecord,CalendarState,LocalDate} from './types'
import {addDays,addMonths,dateLabel,dateSeries,friendlyRange,localDate,monday,monthGridStart,localDateTime,localInstantOptions,offsetLabel} from './core/dates'
import {dayOccurrences,excludeOccurrence,occurrencesBetween} from './core/occurrences'
import {replaceOccurrence,restoreOccurrence,saveWholeEvent,shiftOccurrence,splitSeriesAt,endSeriesAt} from './core/series'
import {findFreeSlots,type FreeSlot} from './core/availability'
import {finderDayWindow,advanceFinderDay,type FinderDaySpan} from './core/finder-day'
import {adjacentBusyDay,exportAgendaCsv} from './core/agenda'
import {adjacentAgendaRange} from './core/agenda-navigation'
import {searchOccurrencePage} from './core/search-pages'
import {detailNeighbors} from './core/detail-navigation'
import {sevenDayWorkload} from './core/planning'
import {visibleCalendarRecords,toggleImportedCalendarVisibility} from './core/source-visibility'
import {previewMissingPersonal} from './core/recover-missing'
import {personalDraftFromImported} from './core/personal-copy'
import {proposeTimedChange,applyTimedChange,type TimedAction} from './core/reschedule'
import {findAdjustmentAlternatives,type AdjustmentAlternative} from './core/adjustment-alternatives'
import {exportBackup,importBackup,loadState,saveState,readRecovery,rawCalendarBackup,rescuedUnparsedCalendar,restoreUnreadableCalendar,STORAGE_KEY,type RecoverySnapshot} from './core/storage'
import {mergeIcs,previewIcs,exportHubHandoffIcs,reviewHubHandoff,type HubHandoffOptions,type IcsPreview} from './core/ics'
import {makeHandoffReceipt,resolveHandoffOrigin,type HandoffReceipt} from './core/handoff-continuity'
import {HandoffContinuity} from './components/HandoffContinuity'
import {downloadPersonalExport,type ReviewedPersonalExportOptions} from './core/personal-export'
import {reviewImportedChanges,exportImportedChangeCsv} from './core/ics-change-review'
import {EventEditor} from './components/EventEditor'
import {EVENT_DRAFT_KEY,readEventDraft,clearEventDraft,assertDraftCanResume,type SavedEventDraft} from './core/event-draft'
import {AllDayDialog} from './components/AllDayDialog'
import {RestoreDialog} from './components/RestoreDialog'
import {PersonalExportDialog} from './components/PersonalExportDialog'
import {EcosystemHandoff} from './components/EcosystemHandoff'
import {ReminderCenter} from './components/ReminderCenter'
import {OfflineReadiness} from './components/OfflineReadiness'
import {loadViewPreferences,saveViewPreferences,resetViewPreferences,VIEW_PREFERENCES_KEY,type ViewPreferences} from './core/view-preferences'
import {reminderItems,readReminderActions,saveReminderActions,actionForReminder,deliverableReminders,proposedSnooze,proposedSnoozeUntil,dismissReminderBatch,REMINDER_ACTIONS_KEY,REMINDER_DELIVERED_KEY,type ReminderItem,type ReminderActions} from './core/reminders'
import {DEFAULT_REMINDER_SETTINGS,loadReminderSettings,saveReminderSettings,inQuietHours,foregroundNotificationText,REMINDER_SETTINGS_KEY,type ReminderSettings} from './core/reminder-settings'
import {applyAllDayChange,type AllDayProposal} from './core/all-day'
import {CalendarViews,type Mode} from './components/CalendarViews'
import {MonthDayPeek} from './components/MonthDayPeek'
import {NowNext} from './components/NowNext'
import {SourcePicker} from './components/SourcePicker'
import {AgendaTrail} from './components/AgendaTrail'
import {AgendaCompareDialog} from './components/AgendaCompareDialog'
import {OverlapInbox} from './components/OverlapInbox'
import {resolveOverlapParticipant,type OriginalOverlapParticipant} from './core/overlap-inbox'
import {resolveComparedOccurrence} from './core/agenda-compare'
import {resolveTrailSelection,type TrailTarget,type TrailRow} from './core/agenda-trail'
import {SubscriptionManager} from './components/SubscriptionManager'
import {ICS_SUBSCRIPTIONS_KEY,readSubscriptions,reviseSubscriptions,addSubscription,changeSubscription,dropSubscription,assertFeedSource,fetchSubscribedIcs,historyEntry,type SubscriptionStore,type IcsSubscription} from './core/ics-subscriptions'
import {applySourcePicker,type SourcePickerAction} from './core/source-picker'
import {deviceTimeZone,zoneWall} from './core/time-zone'

type Filter='all'|'personal'|'ics'
function download(name:string,contents:string,type:string){
  const link=document.createElement('a')
  const url=URL.createObjectURL(new Blob([contents],{type}))
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}
const initial=loadState()
const initialView=(()=>{try{return loadViewPreferences()}catch{return {mode:'week' as const,filter:'all' as const,agendaSpan:14 as const,agendaBusyOnly:false}}})()
const initialDraft=(()=>{
  let raw:string|null=null
  try{raw=localStorage.getItem(EVENT_DRAFT_KEY);return {draft:readEventDraft(),error:'',raw}}
  catch(error){return {draft:null,error:'Unfinished event draft cannot be read: '+String(error),raw}}
})()
const initialSubscriptions=(()=>{
  try{return {store:readSubscriptions(),error:''}}
  catch(error){return {store:{schemaVersion:1,items:[]} as SubscriptionStore,
    error:'Subscription metadata is unreadable. It was not overwritten: '+String(error)}}
})()
export default function App(){
  const [calendar,setCalendar]=useState<CalendarState>(initial.state)
  const [pendingDraft,setPendingDraft]=useState<SavedEventDraft|null>(initialDraft.draft)
  const [restoredDraft,setRestoredDraft]=useState<SavedEventDraft|null>(null)
  const [draftReadError,setDraftReadError]=useState(initialDraft.error)
  const [remindersOpen,setRemindersOpen]=useState(false)
  const [overdueDays,setOverdueDays]=useState<1|7>(1)
  const [reminderSettings,setReminderSettings]=useState<ReminderSettings>(()=>{try{return loadReminderSettings()}catch{return DEFAULT_REMINDER_SETTINGS}})
  const [reminderActions,setReminderActions]=useState<ReminderActions>(()=>{try{return readReminderActions()}catch{return {}}})
  const [reminderNow,setReminderNow]=useState(()=>new Date().toISOString())
  const [notifyEnabled,setNotifyEnabled]=useState(()=>{try{return localStorage.getItem('thiepn.calendar.foreground-notify.v1')==='yes'}catch{return false}})
  const [notifyPermission,setNotifyPermission]=useState<'unsupported'|'default'|'denied'|'granted'>(()=>{
    return typeof Notification==='undefined'?'unsupported':Notification.permission
  })
  const [unreadable,setUnreadable]=useState(Boolean(initial.error))
  const [recovery,setRecovery]=useState<RecoverySnapshot|null>(()=>{try{return readRecovery()}catch{return null}})
  const [restoreCandidate,setRestoreCandidate]=useState<{state:CalendarState;origin:string}|null>(null)
  const [notice,setNotice]=useState(initial.error??'')
  const [selected,setSelected]=useState<LocalDate>(localDate())
  const [mode,setMode]=useState<Mode>(initialView.mode)
  const [agendaSpan,setAgendaSpan]=useState<14|30>(initialView.agendaSpan)
  const [agendaBusyOnly,setAgendaBusyOnly]=useState(initialView.agendaBusyOnly)
  const [filter,setFilter]=useState<Filter>(initialView.filter)
  const [hiddenImportedCalendars,setHiddenImportedCalendars]=useState<string[]>(initialView.hiddenImportedCalendars??[])
  const [query,setQuery]=useState('')
  const [searchDirection,setSearchDirection]=useState<'forward'|'backward'>('forward')
  const [searchPage,setSearchPage]=useState(0)
  const [editing,setEditing]=useState<CalendarRecord|null>(null)
  const [copyDraft,setCopyDraft]=useState(false)
  const [editInstance,setEditInstance]=useState<{parentId:string;date:LocalDate}|null>(null)
  const [editFuture,setEditFuture]=useState<{parentId:string;date:LocalDate;newId:string}|null>(null)
  const [moveDate,setMoveDate]=useState<LocalDate>(localDate())
  const [adjustment,setAdjustment]=useState<{item:CalendarOccurrence;action:TimedAction;date:LocalDate;minute:number;length:number;fold?:'earlier'|'later'}|null>(null)
  const [adjustAck,setAdjustAck]=useState(false)
  const [adjustAlternativesOpen,setAdjustAlternativesOpen]=useState(false)
  const [adjustAlternativeDays,setAdjustAlternativeDays]=useState<1|3|7>(3)
  const [adjustAlternativeBuffer,setAdjustAlternativeBuffer]=useState<0|15|30>(0)
  const [importMode,setImportMode]=useState<'update'|'replace'>('update')
  const [finderOpen,setFinderOpen]=useState(false)
  const [finderDuration,setFinderDuration]=useState(60)
  const [finderDays,setFinderDays]=useState<FinderDaySpan>(7)
  const [finderFrom,setFinderFrom]=useState<LocalDate>(()=>localDate())
  const [finderWindow,setFinderWindow]=useState<'daytime'|'evening'>('daytime')
  const [finderBlockAllDay,setFinderBlockAllDay]=useState(true)
  const [finderDaySelection,setFinderDaySelection]=useState<'all'|'weekdays'|'weekends'>('all')
  const [finderBufferMinutes,setFinderBufferMinutes]=useState<0|15|30>(0)
  const [newEventRange,setNewEventRange]=useState<{start:string;end:string}|null>(null)
  const [newAllDay,setNewAllDay]=useState<{from:LocalDate;through:LocalDate}|null>(null)
  const [allDayAdjustment,setAllDayAdjustment]=useState<{item:CalendarOccurrence;from:LocalDate;through:LocalDate}|null>(null)
  const [editorDate,setEditorDate]=useState<LocalDate|null>(null)
  const [active,setActive]=useState<CalendarOccurrence|null>(null)
  const [monthPeekDate,setMonthPeekDate]=useState<LocalDate|null>(null)
  const [pending,setPending]=useState<IcsPreview|null>(null)
  const [sourcePanel,setSourcePanel]=useState(false)
  const [agendaCompareOpen,setAgendaCompareOpen]=useState(false)
  const [overlapInboxOpen,setOverlapInboxOpen]=useState(false)
  const [overlapInboxDate,setOverlapInboxDate]=useState<LocalDate>(()=>localDate())
  const [compareFirst,setCompareFirst]=useState<LocalDate>(()=>localDate())
  const [compareSecond,setCompareSecond]=useState<LocalDate>(()=>addDays(localDate(),7))
  const [returnToComparison,setReturnToComparison]=useState(false)
  const [agendaTrail,setAgendaTrail]=useState<{
    target:TrailTarget;initialDate:LocalDate;origin?:CalendarOccurrence
  }|null>(null)
  const [sourcePickerError,setSourcePickerError]=useState('')
  const [subscriptions,setSubscriptions]=useState<SubscriptionStore>(initialSubscriptions.store)
  const [subscriptionError,setSubscriptionError]=useState(initialSubscriptions.error)
  const [checkingFeedId,setCheckingFeedId]=useState<string|null>(null)
  const checkController=useRef<AbortController|null>(null)
  const [pendingFeed,setPendingFeed]=useState<{
    id:string;revision:string;etag?:string;lastModified?:string
  }|null>(null)
  const [personalExportOpen,setPersonalExportOpen]=useState(false)
  const [ecosystemHandoff,setEcosystemHandoff]=useState<CalendarOccurrence|null|true>(null)
  const [lastHandoff,setLastHandoff]=useState<HandoffReceipt|null>(null)
  const [mobileNav,setMobileNav]=useState(false)
  const importInput=useRef<HTMLInputElement>(null)
  const restoreInput=useRef<HTMLInputElement>(null)
  const searchInput=useRef<HTMLInputElement>(null)
  const jumpInput=useRef<HTMLInputElement>(null)

  function commit(next:CalendarState,success='Saved on this device') {
    try{
      // The read is immediately before the write: never knowingly overwrite another tab's changes.
      const current=loadState()
      if(current.error||JSON.stringify(current.state)!==JSON.stringify(calendar))
        throw new Error('Saved calendar changed in another tab or cannot be read. Review the latest events before retrying.')
      saveState(next,'Before: '+success);setCalendar(next);setUnreadable(false)
      try{setRecovery(readRecovery())}catch{setRecovery(null)}
      setNotice(success);return true
    }catch(error){setNotice('Not saved: '+String(error));return false}
  }
  useEffect(()=>{
    const timer=window.setInterval(()=>setReminderNow(new Date().toISOString()),30000)
    const visibility=()=>{if(document.visibilityState==='visible')setReminderNow(new Date().toISOString())}
    document.addEventListener('visibilitychange',visibility)
    return ()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',visibility)}
  },[])
  const reminders=useMemo(()=>reminderItems(calendar,reminderNow,reminderActions,14,overdueDays),[calendar,reminderNow,reminderActions,overdueDays])
  const dueReminderCount=reminders.filter(x=>x.status==='due').length
  const dismissedReminders=useMemo(()=>reminderItems(calendar,reminderNow,{},14,overdueDays).filter(x=>reminderActions[x.key]?.kind==='dismiss'),[calendar,reminderNow,reminderActions,overdueDays])
  function dismissDueReminders(items:ReminderItem[]){
    if(items.length<2||!window.confirm('Dismiss '+items.length+' currently reviewed due reminders on this device? This does not change any event. Each can be restored in the Dismissed reminders section.'))return
    try{
      const current=loadState()
      if(current.error||JSON.stringify(current.state)!==JSON.stringify(calendar))
        throw new Error('Calendar changed in another tab; reopen reminders before dismissing')
      const latest=readReminderActions()
      const stillDue=reminderItems(current.state,new Date().toISOString(),latest,14,overdueDays)
        .filter(item=>item.status==='due')
      const live=new Map(stillDue.map(item=>[item.key,item]))
      if(items.some(item=>live.get(item.key)?.dueAt!==item.dueAt))
        throw new Error('Reminder due time changed; review the refreshed list')
      const next=dismissReminderBatch(latest,items)
      saveReminderActions(next);setReminderActions(next);setReminderNow(new Date().toISOString())
      setNotice('Dismissed '+items.length+' reviewed reminders. Original events were not changed.')
    }catch(error){setNotice('Reminder batch not saved: '+String(error))}
  }
  function undoReminderDismissal(item:ReminderItem){
    try{
      const next=readReminderActions();delete next[item.key]
      saveReminderActions(next);setReminderActions(next);setReminderNow(new Date().toISOString())
    }catch(error){setNotice('Reminder preference could not be reversed: '+String(error))}
  }
  function changeReminderSettings(next:ReminderSettings){
    try{saveReminderSettings(next);setReminderSettings(next)}
    catch(error){setNotice('Reminder settings not saved: '+String(error))}
  }
  function updateReminderAction(item:ReminderItem,kind:'dismiss'|'snooze',minutes=15,localWall?:string):boolean{
    try{
      // Re-read right before changing independent reminder preferences, so other-tab changes are retained.
      const latest=readReminderActions()
      const now=new Date().toISOString()
      const persisted=loadState()
      if(persisted.error||JSON.stringify(persisted.state)!==JSON.stringify(calendar))
        throw new Error('Calendar changed in another tab; review reminders again')
      const live=reminderItems(persisted.state,now,latest,14,overdueDays)
        .find(candidate=>candidate.key===item.key&&candidate.dueAt===item.dueAt)
      if(!live)throw new Error('Reminder is stale; review the refreshed list')
      const action=kind==='dismiss'?actionForReminder(live.key,{kind:'dismiss'},now):
        localWall===undefined?proposedSnooze(live,minutes as 5|15|60,now):
        proposedSnoozeUntil(live,localWall,now)
      const next={...latest,[item.key]:action}
      saveReminderActions(next);setReminderActions(next)
      setReminderNow(new Date().toISOString())
      return true
    }catch(error){setNotice('Reminder preference not saved: '+String(error));return false}
  }
  async function enableForegroundNotifications(){
    if(typeof Notification==='undefined'){setNotifyPermission('unsupported');return}
    try{
      const permission=await Notification.requestPermission()
      setNotifyPermission(permission)
      if(permission==='granted'){localStorage.setItem('thiepn.calendar.foreground-notify.v1','yes');setNotifyEnabled(true)}
      else setNotice('Desktop notifications not enabled; the local reminder center remains available')
    }catch(error){setNotice('Desktop notification request failed: '+String(error))}
  }
  function disableForegroundNotifications(){
    try{localStorage.removeItem('thiepn.calendar.foreground-notify.v1');setNotifyEnabled(false)}
    catch(error){setNotice('Notification preference could not be saved: '+String(error))}
  }
  useEffect(()=>{
    if(!notifyEnabled||notifyPermission!=='granted'||typeof Notification==='undefined'||document.visibilityState!=='visible'||inQuietHours(reminderNow,reminderSettings.quietHours))return
    try{
      const raw=localStorage.getItem(REMINDER_DELIVERED_KEY)
      const delivered=new Set<string>(raw?JSON.parse(raw) as string[]:[])
      const pending=deliverableReminders(reminders,reminderNow,delivered)
      if(!pending.length)return
      const next=new Set(delivered)
      for(const item of pending){
        const identity=item.key+'@'+item.dueAt
        next.add(identity)
        const contents=foregroundNotificationText(item.occurrence.title,item.occurrence.start,reminderSettings)
        new Notification(contents.title,{body:contents.body,tag:identity})
      }
      localStorage.setItem(REMINDER_DELIVERED_KEY,JSON.stringify(Array.from(next).slice(-250)))
    }catch(error){setNotice('Foreground notification unavailable: '+String(error))}
  },[notifyEnabled,notifyPermission,reminders,reminderNow,reminderSettings])
  useEffect(()=>{
    try{saveViewPreferences({mode,filter,agendaSpan,agendaBusyOnly,hiddenImportedCalendars})}
    catch(error){setNotice('Display preferences could not be saved: '+String(error))}
  },[mode,filter,agendaSpan,agendaBusyOnly,hiddenImportedCalendars])
  function resetDisplayPreferences(){
    try{
      resetViewPreferences()
      setMode('week');setFilter('all');setAgendaSpan(14);setAgendaBusyOnly(false);setHiddenImportedCalendars([])
      setNotice('Local display preferences reset to defaults')
    }catch(error){setNotice('Display preferences could not be reset: '+String(error))}
  }
  useEffect(()=>{
    const sync=(e:StorageEvent)=>{
      if(e.key===ICS_SUBSCRIPTIONS_KEY){
        try{setSubscriptions(readSubscriptions());setSubscriptionError('')}
        catch(error){setSubscriptionError('Subscription metadata changed but cannot be read: '+String(error))}
      }
      if(e.key===REMINDER_ACTIONS_KEY){try{setReminderActions(readReminderActions())}catch{}}
      if(e.key===REMINDER_SETTINGS_KEY){try{setReminderSettings(loadReminderSettings())}catch{}}
      if(e.key===VIEW_PREFERENCES_KEY){
        try{
          const updated:ViewPreferences=loadViewPreferences()
          setMode(updated.mode);setFilter(updated.filter)
          setAgendaSpan(updated.agendaSpan);setAgendaBusyOnly(updated.agendaBusyOnly)
          setHiddenImportedCalendars(updated.hiddenImportedCalendars??[])
        }catch{}
      }
      if(e.key===STORAGE_KEY||e.key===null){const read=loadState();if(read.error){setNotice(read.error);setUnreadable(true)}
        else{setCalendar(read.state);setUnreadable(false)}
        try{setRecovery(readRecovery())}catch{setRecovery(null)}}
    }
    window.addEventListener('storage',sync);return ()=>window.removeEventListener('storage',sync)
  },[])
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      const target=e.target as HTMLElement
      if(['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable)return
      if(e.ctrlKey||e.metaKey||e.altKey)return
      if(e.key==='Escape'&&editorDate===null){setActive(null);setPending(null);setPendingFeed(null);setSourcePanel(false);setPersonalExportOpen(false);setFinderOpen(false);setRemindersOpen(false);setAdjustment(null);setAllDayAdjustment(null);setMonthPeekDate(null)}
      if(e.key==='n'){e.preventDefault();create(selected)}
      if(e.key==='t'){e.preventDefault();setSelected(localDate())}
      if(e.key==='/'){e.preventDefault();searchInput.current?.focus()}
      if(e.key==='g'){e.preventDefault();jumpInput.current?.focus()}
      const views:Mode[]=['month','week','day','agenda']
      if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&['1','2','3','4'].includes(e.key)){setMode(views[Number(e.key)-1])}
      if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&(e.key==='j'||e.key==='k')){
        e.preventDefault()
        const direction=e.key==='j'?1:-1
        setSelected(s=>mode==='month'?addMonths(s,direction):addDays(s,direction*(mode==='week'?7:mode==='agenda'?agendaSpan:1)))
      }
    }
    window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key)
  },[selected,mode,agendaSpan,editorDate])
  const hiddenImportedSet=useMemo(()=>new Set(hiddenImportedCalendars),[hiddenImportedCalendars])
  const visible=useMemo(()=>visibleCalendarRecords(calendar.records,filter,hiddenImportedSet,query),
    [calendar,filter,hiddenImportedSet,query])
  const days=useMemo(()=>{
    const start=mode==='month'?monthGridStart(selected):mode==='week'?monday(selected):selected
    return dateSeries(start,addDays(start,mode==='month'?41:mode==='week'?6:mode==='agenda'?agendaSpan-1:0))
  },[mode,selected,agendaSpan])
  const title=mode==='month'?dateLabel(selected,{month:'long',year:'numeric'}):
    friendlyRange(days[0],days[days.length-1])
  const selectedEvents=dayOccurrences(visible,selected)
  const planningDays=useMemo(()=>mode==='week'||mode==='agenda'?sevenDayWorkload(visible,selected):[],[visible,selected,mode])
  const searchResults=useMemo(()=>{
    const matches=query.trim()?visibleCalendarRecords(calendar.records,filter,hiddenImportedSet,query):[]
    const from=searchDirection==='backward'?addDays(selected,-364):selected
    const to=searchDirection==='backward'?selected:addDays(selected,364)
    return searchOccurrencePage(matches,from,to,searchDirection,searchPage)
  },[calendar,selected,query,filter,hiddenImportedSet,searchDirection,searchPage])
  // Search cursors are presentation-only and are reset as soon as their source
  // window, query or visibility changes. No cursor is persisted to calendar.
  useEffect(()=>{setSearchPage(0)},[query,searchDirection,selected,filter,hiddenImportedSet])
  // A Map avoids treating source-controlled names such as "__proto__" as object keys.
  const sourceCounts=new Map<string,number>()
  for(const record of calendar.records){
    if(record.source!=='ics')continue
    const name=record.sourceCalendar??'Imported'
    sourceCounts.set(name,(sourceCounts.get(name)??0)+1)
  }
  const sources=Array.from(sourceCounts.entries()).sort((a,b)=>a[0].localeCompare(b[0]))
  function toggleImported(name:string){
    try{setHiddenImportedCalendars(current=>toggleImportedCalendarVisibility(current,name));setSourcePickerError('')}
    catch(error){setSourcePickerError('Visibility unchanged: '+String(error))}
  }
  function applyImportedVisibility(action:SourcePickerAction,matching:string[]){
    try{
      const next=applySourcePicker(hiddenImportedCalendars,sources.map(([name])=>name),matching,action)
      setHiddenImportedCalendars(next)
      setSourcePickerError('')
      setNotice('Updated display visibility for '+matching.length+' matching imported calendar'+(matching.length===1?'':'s')+'. Busy source records remain included in Find time.')
    }catch(error){
      setSourcePickerError('Visibility unchanged: '+String(error))
    }
  }
  const personalCount=calendar.records.filter(x=>x.source==='personal').length
  const activeRecord=active?calendar.records.find(x=>x.id===active.recordId):undefined
  const detailsNavigation=useMemo(()=>active?detailNeighbors(visible,active):null,[visible,active])
  const adjustmentReview=useMemo(()=>{
    if(!adjustment)return {proposal:null,error:''}
    try{return {proposal:proposeTimedChange(calendar,adjustment.item,adjustment.action,adjustment.date,
      adjustment.minute,adjustment.length,adjustment.fold),error:''}}
    catch(error){return {proposal:null,error:error instanceof Error?error.message:String(error)}}
  },[calendar,adjustment])
  const adjustmentAlternatives=useMemo(()=>{
    if(!adjustAlternativesOpen||!adjustmentReview.proposal)return {items:[] as AdjustmentAlternative[],error:''}
    try{return {items:findAdjustmentAlternatives(calendar,adjustmentReview.proposal,{
      days:adjustAlternativeDays,bufferMinutes:adjustAlternativeBuffer
    }),error:''}}
    catch(error){return {items:[] as AdjustmentAlternative[],error:error instanceof Error?error.message:String(error)}}
  },[calendar,adjustmentReview.proposal,adjustAlternativesOpen,adjustAlternativeDays,adjustAlternativeBuffer])
  const finderSelection=useMemo(()=>{
    if(!finderOpen)return {window:null as ReturnType<typeof finderDayWindow>|null,error:''}
    try{return {window:finderDayWindow(finderFrom,finderDays,localDate()),error:''}}
    catch(error){return {window:null,error:error instanceof Error?error.message:String(error)}}
  },[finderOpen,finderFrom,finderDays])
  const freeSlots=useMemo(()=>finderOpen&&finderSelection.window?findFreeSlots(calendar.records,{
    from:finderSelection.window.from,days:finderSelection.window.days,durationMinutes:finderDuration,
    startHour:finderWindow==='daytime'?8:17,endHour:finderWindow==='daytime'?19:23,
    blockAllDay:finderBlockAllDay,daySelection:finderDaySelection,
    bufferMinutes:finderBufferMinutes,maxResults:18
  }):[],[finderOpen,calendar,finderSelection.window,finderDuration,finderWindow,finderBlockAllDay,finderDaySelection,finderBufferMinutes])
  function showFindTime(date?:LocalDate){
    const target=date??(selected<localDate()?localDate():selected)
    try{
      finderDayWindow(target,date?1:7,localDate())
      setFinderFrom(target)
      setFinderDays(date?1:7)
      setFinderOpen(true)
    }catch(error){setNotice('Time finder not opened: '+String(error))}
  }
  function updateFinderDay(date:LocalDate){
    try{finderDayWindow(date,finderDays,localDate());setFinderFrom(date)}
    catch(error){setNotice('Finder date unchanged: '+String(error))}
  }
  function stepFinderDay(direction:-1|1){
    try{updateFinderDay(advanceFinderDay(finderFrom,direction,localDate()))}
    catch(error){setNotice('Finder date unchanged: '+String(error))}
  }

  function resumeDraft(){
    if(!pendingDraft)return
    try{
      const latest=loadState()
      if(latest.error)throw new Error('Saved calendar is unreadable; recover the calendar before resuming a draft')
      assertDraftCanResume(pendingDraft,latest.state)
      const o=pendingDraft.origin
      setCalendar(latest.state)
      setEditing(o.event??null);setCopyDraft(o.copy)
      setEditInstance(o.instance??null);setEditFuture(o.future??null)
      setNewEventRange(o.initialRange??null);setNewAllDay(o.initialAllDay??null)
      setSelected(o.date);setEditorDate(o.date);setActive(null)
      setRestoredDraft(pendingDraft);setPendingDraft(null);setDraftReadError('')
    }catch(error){setDraftReadError('Cannot resume safely: '+String(error))}
  }
  function discardPendingDraft(){
    try{
      if(pendingDraft)clearEventDraft(pendingDraft.id,pendingDraft.revision)
      else if(localStorage.getItem(EVENT_DRAFT_KEY)===initialDraft.raw)
        localStorage.removeItem(EVENT_DRAFT_KEY)
      else throw new Error('Draft changed since startup. Reload before discarding it.')
      setPendingDraft(null);setDraftReadError('')
    }catch(error){setDraftReadError('Draft was preserved: '+String(error))}
  }
  function create(date:LocalDate){setCopyDraft(false);setActive(null);setEditing(null);setEditInstance(null);setEditFuture(null);setNewEventRange(null);setNewAllDay(null);setEditorDate(date)}
  function startFinderSlot(slot:FreeSlot){
    try{
      // A suggested slot can expire or become occupied in another tab.
      // Re-read original local storage and re-run *all* source conflict checks
      // before opening a prefilled editor. The subsequent save remains guarded.
      const latest=loadState()
      if(latest.error)throw new Error('Saved calendar is unreadable. Recover it before scheduling.')
      if(JSON.stringify(latest.state)!==JSON.stringify(calendar)){
        setCalendar(latest.state)
        throw new Error('Calendar changed in another tab. Review refreshed suggestions before scheduling.')
      }
      const validated=finderDayWindow(finderFrom,finderDays,localDate())
      const eligible=findFreeSlots(latest.state.records,{
        from:validated.from,days:validated.days,durationMinutes:finderDuration,
        startHour:finderWindow==='daytime'?8:17,endHour:finderWindow==='daytime'?19:23,
        blockAllDay:finderBlockAllDay,daySelection:finderDaySelection,
        bufferMinutes:finderBufferMinutes,maxResults:18,now:new Date()
      })
      if(!eligible.some(candidate=>candidate.start===slot.start&&candidate.end===slot.end))
        throw new Error('Suggested slot is no longer free. Review fresh recommendations.')
    }catch(error){setNotice('Time proposal not opened: '+String(error));return}
    startSlot(slot)
  }
  function startSlot(slot:FreeSlot){
    setCopyDraft(false);setActive(null);setEditing(null);setEditInstance(null);setEditFuture(null)
    setNewAllDay(null);setNewEventRange({start:slot.start,end:slot.end});setEditorDate(slot.date)
    setSelected(slot.date);setFinderOpen(false)
  }
  function startAllDay(from:LocalDate,through:LocalDate){
    setCopyDraft(false);setActive(null);setEditing(null);setEditInstance(null);setEditFuture(null);setNewEventRange(null)
    setNewAllDay({from,through});setEditorDate(from);setSelected(from)
  }
  function requestAllDayAdjustment(item:CalendarOccurrence,from:LocalDate,through:LocalDate){
    if(item.source!=='personal'||!item.allDay)return
    setActive(null);setAllDayAdjustment({item,from,through})
  }
  function confirmAllDay(proposal:AllDayProposal){
    try{
      const next=applyAllDayChange(calendar,proposal,()=>crypto.randomUUID())
      if(commit(next,'All-day event adjusted locally')){
        setAllDayAdjustment(null);setSelected(proposal.from)
      }
    }catch(error){setNotice('All-day adjustment rejected: '+String(error))}
  }
  function open(item:CalendarOccurrence){
    setReturnToComparison(false)
    setActive(item);setSelected(item.allDay?item.date:localDate(new Date(item.start)))
    setMoveDate(item.startDate)
  }
  function showAgendaComparison(from:LocalDate){
    setCompareFirst(from);setCompareSecond(addDays(from,7))
    setAgendaCompareOpen(true);setReturnToComparison(false);setActive(null)
  }
  function openComparedOccurrence(item:CalendarOccurrence,date:LocalDate){
    try{
      const latest=loadState()
      if(latest.error||JSON.stringify(latest.state)!==JSON.stringify(calendar))
        throw new Error('Calendar changed in another tab; reload the original events first.')
      const stillVisible=visibleCalendarRecords(latest.state.records,filter,hiddenImportedSet,query)
      const original=calendar.records.find(r=>r.id===item.recordId)
      if(!original)throw new Error('Original event no longer exists')
      const verified=resolveComparedOccurrence(stillVisible,date,item,original)
      setAgendaCompareOpen(false);setMode('day');open(verified)
      setReturnToComparison(true)
    }catch(error){setNotice('Comparison event not opened: '+String(error))}
  }
  function showOverlapInbox(date:LocalDate){
    setOverlapInboxDate(date);setOverlapInboxOpen(true);setActive(null)
  }
  function inspectOverlapParticipant(participant:OriginalOverlapParticipant,action:'inspect'|'adjust'){
    try{
      const latest=loadState()
      if(latest.error||JSON.stringify(latest.state)!==JSON.stringify(calendar))
        throw new Error('The calendar changed in another tab. Reload before reviewing overlap actions.')
      const original=resolveOverlapParticipant(latest.state,participant)
      setOverlapInboxOpen(false)
      setSelected(original.allDay?original.date:localDate(new Date(original.start)))
      if(action==='adjust'){
        if(original.source!=='personal'||original.allDay)
          throw new Error('Only original timed personal events can be adjusted')
        const d=new Date(original.start)
        const date=localDate(d)
        const duration=Math.round((Date.parse(original.end)-Date.parse(original.start))/60000)
        const choices=localInstantOptions(localDateTime(original.start))
        const fold=choices.length===2?(choices[0]===original.start?'earlier':'later'):undefined
        requestAdjustment(original,'move',date,d.getHours()*60+d.getMinutes(),duration,fold)
      }else{setMode('day');open(original)}
    }catch(error){setNotice('Overlap action unavailable: '+String(error))}
  }
  function openAgendaTrailFromEvent(item:CalendarOccurrence){
    const original=calendar.records.find(record=>record.id===item.recordId)
    if(!original)return
    const target:TrailTarget=original.source==='ics'&&original.sourceCalendar?
      {kind:'source',name:original.sourceCalendar}:{kind:'series',recordId:original.id}
    if(original.source==='personal'&&!original.repeat&&!original.recurrenceParentId)return
    setAgendaTrail({target,initialDate:item.date,origin:item})
    setActive(null)
  }
  function closeAgendaTrail(){
    if(!agendaTrail)return
    const original=agendaTrail.origin
    setAgendaTrail(null)
    if(original){
      if(calendar.records.some(r=>r.id===original.recordId))setActive(original)
    }else setSourcePanel(true)
  }
  function openAgendaTrailRow(row:TrailRow,from:LocalDate,days:30|90){
    if(!agendaTrail)return
    try{
      const latest=loadState()
      if(latest.error||JSON.stringify(latest.state)!==JSON.stringify(calendar))
        throw new Error('Calendar changed in another tab; reload before opening original events.')
      const current=resolveTrailSelection(latest.state,agendaTrail.target,row,from,days)
      setAgendaTrail(null);setSourcePanel(false);setMode('day');open(current)
    }catch(error){setNotice('Original not opened: '+String(error))}
  }
  function requestAdjustment(item:CalendarOccurrence,action:TimedAction,date:LocalDate,minute:number,length:number,fold?:'earlier'|'later'){
    if(item.source!=='personal'||item.allDay)return
    setActive(null);setAdjustAck(false);setAdjustAlternativesOpen(false)
    setAdjustAlternativeDays(3);setAdjustAlternativeBuffer(0)
    setAdjustment({item,action,date,minute,length,fold})
  }
  function chooseAdjustmentAlternative(slot:AdjustmentAlternative){
    if(!adjustment)return
    try{
      const latest=loadState()
      if(latest.error||JSON.stringify(latest.state)!==JSON.stringify(calendar))
        throw new Error('Saved calendar changed in another tab. Review refreshed appointments first.')
      const review=proposeTimedChange(latest.state,adjustment.item,adjustment.action,
        adjustment.date,adjustment.minute,adjustment.length,adjustment.fold)
      const refreshed=findAdjustmentAlternatives(latest.state,review,{
        days:adjustAlternativeDays,bufferMinutes:adjustAlternativeBuffer,now:new Date()
      })
      if(!refreshed.some(item=>item.start===slot.start&&item.end===slot.end))
        throw new Error('Suggested alternative is no longer available')
      setAdjustment(current=>current?{...current,action:'move',date:slot.date,
        minute:slot.minute,length:slot.lengthMinutes,fold:undefined}:current)
      setAdjustAck(false)
      setAdjustAlternativesOpen(false)
    }catch(error){setNotice('Alternative time not selected: '+String(error))}
  }
  function confirmAdjustment(){
    if(!adjustmentReview.proposal||!adjustment)return
    if(adjustmentReview.proposal.conflicts.length&&!adjustAck)return
    try{
      const next=applyTimedChange(calendar,adjustmentReview.proposal,()=>crypto.randomUUID())
      if(commit(next,'Timed event change saved locally')){
        setAdjustment(null);setAdjustAck(false);setAdjustAlternativesOpen(false);setSelected(adjustment.date)
      }
    }catch(error){setNotice('Reschedule rejected: '+String(error))}
  }
  function edit(item:CalendarOccurrence,scope:'series'|'instance'|'future'='series'){
    setCopyDraft(false)
    const record=calendar.records.find(x=>x.id===item.recordId)
    if(!record||record.source!=='personal')return
    setEditFuture(null)
    if(scope==='instance'&&record.repeat){
      setEditing({...record,id:crypto.randomUUID(),start:item.start,end:item.end,
        startDate:item.allDay?item.startDate:undefined,endDateExclusive:item.allDay?item.endDateExclusive:undefined,
        allDay:item.allDay,repeat:undefined,excludedDates:undefined})
      setEditInstance({parentId:record.id,date:item.date})
    }else if(scope==='future'&&record.repeat){
      const newId=crypto.randomUUID()
      try{
        const preview=splitSeriesAt(calendar,record.id,item.date,newId)
        setEditing(preview.records.find(r=>r.id===newId)!)
        setEditInstance(null);setEditFuture({parentId:record.id,date:item.date,newId})
      }catch(error){setNotice('Future-series edit unavailable: '+String(error));return}
    }else{setEditing(record);setEditInstance(null)}
    setEditorDate(item.date);setActive(null)
  }
  function copyImportedToPersonal(item:CalendarOccurrence){
    if(item.source!=='ics')return
    try{
      const draft=personalDraftFromImported(item,crypto.randomUUID(),reminderSettings.defaultLead)
      setCopyDraft(true);setEditing(draft);setEditInstance(null);setEditFuture(null)
      setNewEventRange(null);setNewAllDay(null);setEditorDate(item.startDate);setActive(null)
    }catch(error){setNotice('Imported copy cannot be prepared: '+String(error))}
  }
  function duplicateToDate(item:CalendarOccurrence){
    const original=calendar.records.find(r=>r.id===item.recordId)
    if(!original||original.source!=='personal')return
    try{
      const proposed=shiftOccurrence(original,item,moveDate)
      setEditing({...proposed,id:crypto.randomUUID(),title:item.title+' copy',
        description:item.description,location:item.location,repeat:undefined,excludedDates:undefined,
        recurrenceParentId:undefined,recurrenceDate:undefined})
      setCopyDraft(true);setEditInstance(null);setEditFuture(null)
      setNewEventRange(null);setNewAllDay(null);setEditorDate(moveDate);setActive(null)
    }catch(error){setNotice('Duplicate preparation failed: '+String(error))}
  }
  function nextRecurring(item:CalendarOccurrence){
    const record=calendar.records.find(r=>r.id===item.recordId)
    if(!record?.repeat)return
    const candidates=occurrencesBetween([record],addDays(item.date,1),addDays(item.date,365))
    const next=candidates.find(x=>x.date>item.date)
    if(!next){setNotice('No later active occurrence found in the next 365 days');return}
    setActive(next);setSelected(next.allDay?next.date:localDate(new Date(next.start)));setMoveDate(next.startDate)
  }
  function save(record:CalendarRecord):boolean{
    try{
      const next=editFuture?saveWholeEvent(splitSeriesAt(calendar,editFuture.parentId,editFuture.date,editFuture.newId),record):
        editInstance?replaceOccurrence(calendar,editInstance.parentId,editInstance.date,record):
        calendar.records.some(r=>r.id===record.id)?saveWholeEvent(calendar,record):
        {schemaVersion:1 as const,records:[...calendar.records,record]}
      if(commit(next,'Event saved locally')){
        setEditorDate(null);setEditing(null);setCopyDraft(false);setEditInstance(null);setEditFuture(null);setNewEventRange(null);setNewAllDay(null);setRestoredDraft(null)
        return true
      }
    }catch(error){setNotice('Not saved: '+String(error))}
    return false
  }
  function remove(recordId:string) {
    const record=calendar.records.find(r=>r.id===recordId)
    const description=record?.repeat?'Delete this series and all edited occurrences?':
      record?.recurrenceParentId?'Delete this edited occurrence? The original date remains skipped.':'Remove this calendar event?'
    if(!record || !window.confirm(description))return
    const next=calendar.records.filter(x=>x.id!==recordId&&x.recurrenceParentId!==recordId)
    if(commit({schemaVersion:1,records:next},'Event removed locally'))setActive(null)
  }
  function skip(item:CalendarOccurrence){
    const r=calendar.records.find(x=>x.id===item.recordId)
    if(!r?.repeat)return
    const next=excludeOccurrence(r,item.date)
    if(commit({schemaVersion:1,records:calendar.records.map(x=>x.id===r.id?next:x)},'This occurrence was skipped'))setActive(null)
  }
  function stopAfter(item:CalendarOccurrence){
    if(!window.confirm('End future repetitions after '+item.date+'? Already edited future instances will remain standalone events.'))return
    try{
      if(commit(endSeriesAt(calendar,item.recordId,item.date),'Future repetitions ended after '+item.date))setActive(null)
    }catch(error){setNotice('Could not end series: '+String(error))}
  }
  function restore(item:CalendarOccurrence){
    try{
      const next=restoreOccurrence(calendar,item.recordId)
      if(commit(next,'Original recurring occurrence restored'))setActive(null)
    }catch(error){setNotice('Restore failed: '+String(error))}
  }
  function move(item:CalendarOccurrence){
    const record=calendar.records.find(x=>x.id===item.recordId)
    if(!record||record.source!=='personal')return
    try{
      const shifted=shiftOccurrence(record,item,moveDate)
      const next=record.repeat?
        replaceOccurrence(calendar,record.id,item.date,{...shifted,id:crypto.randomUUID()}):
        saveWholeEvent(calendar,shifted)
      if(commit(next,'Event moved to '+moveDate)){
        setActive(null);setSelected(moveDate)
      }
    }catch(error){setNotice('Move failed: '+String(error))}
  }
  function jumpBusy(direction:-1|1){
    try{
      // Search the same visible source/search filter as the rendered calendar.
      const target=adjacentBusyDay(visible,selected,direction)
      if(target){setSelected(target);setMode('day');setNotice('Jumped to '+dateLabel(target,{weekday:'long',month:'short',day:'numeric'}))}
      else setNotice('No visible commitments found in '+(direction===1?'the next':'the previous')+' 365 days')
    }catch(error){setNotice('Busy-day navigation unavailable: '+String(error))}
  }
  function jumpAgenda(direction:-1|1){
    try{
      const found=adjacentAgendaRange(visible,selected,agendaSpan,direction)
      if(!found){
        setNotice('No '+(direction===1?'later':'earlier')+
          ' visible agenda commitments found within 365 days outside this range. Try changing source filters or searching dates.')
        return
      }
      setSelected(found.selected)
      // Agenda/List mode and original source filter must remain untouched.
      setNotice('Showing '+(direction===1?'next':'previous')+
        ' visible agenda commitment on '+dateLabel(found.eventDate,{weekday:'long',month:'short',day:'numeric'})+
        '. All-day, imported free and recurring events remain in the visible agenda.')
    }catch(error){setNotice('Agenda navigation unavailable: '+String(error))}
  }
  function saveDisplayedAgenda(){
    try{
      const start=days[0],end=days[days.length-1]
      if(days.length>31)throw new Error('Switch to Week, Day or List to export at most 30 days')
      const contents=exportAgendaCsv(visible,start,end)
      download('thiepn-calendar-agenda-'+start+'.csv',contents,'text/csv;charset=utf-8')
      setNotice('Downloaded visible '+days.length+'-day agenda with event titles and locations, including imported copies when shown. No data was uploaded.')
    }catch(error){setNotice('Agenda export rejected: '+String(error))}
  }
  function step(direction:number){
    setSelected(s=>mode==='month'?addMonths(s,direction):addDays(s,direction*(mode==='week'?7:mode==='agenda'?agendaSpan:1)))
  }
  async function readIcs(e:ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0];e.target.value='';if(!f)return
    try{setPendingFeed(null);setPending(previewIcs(await f.text()));setImportMode('update');setNotice('Review the import before applying')}
    catch(error){setNotice('ICS import failed: '+String(error))}
  }
  function persistSubscriptionChange(transform:(current:SubscriptionStore)=>SubscriptionStore):SubscriptionStore{
    const latest=readSubscriptions()
    if(JSON.stringify(latest)!==JSON.stringify(subscriptions))
      throw new Error('Subscription changed in another tab. Reload before continuing.')
    const next=transform(latest)
    reviseSubscriptions(latest,next)
    setSubscriptions(next)
    return next
  }
  function addFeed(url:string){
    try{
      persistSubscriptionChange(current=>addSubscription(current,url))
      setSubscriptionError('')
      setNotice('Feed address saved on this device. Select Check feed to request a snapshot.')
    }catch(error){setSubscriptionError('Subscription not saved: '+String(error))}
  }
  function removeFeed(id:string){
    if(!window.confirm('Unsubscribe this feed? Previously imported local events remain untouched.'))return
    try{
      persistSubscriptionChange(current=>dropSubscription(current,id))
      setSubscriptionError('')
      setNotice('Feed unsubscribed. Its imported event snapshot was preserved.')
    }catch(error){setSubscriptionError('Unsubscribe rejected: '+String(error))}
  }
  function cancelFeed(){
    checkController.current?.abort()
    checkController.current=null
    setCheckingFeedId(null)
    setNotice('Feed request cancelled. Saved calendar events were not changed.')
  }
  async function checkFeed(id:string){
    if(checkController.current||pending)return
    let original:IcsSubscription|undefined
    let originalStore:SubscriptionStore|undefined
    const controller=new AbortController()
    try{
      originalStore=readSubscriptions()
      if(JSON.stringify(originalStore)!==JSON.stringify(subscriptions))
        throw new Error('Subscription was changed in another tab. Reload before checking.')
      original=originalStore.items.find(item=>item.id===id)
      if(!original)throw new Error('Subscription no longer exists')
      checkController.current=controller
      setCheckingFeedId(id);setSubscriptionError('')
      // Do not accept 304 if an independently restored calendar lacks the
      // previously applied source; a complete fresh response is then required.
      const hasSource=Boolean(original.sourceName&&calendar.records.some(r=>
        r.source==='ics'&&r.sourceCalendar===original!.sourceName))
      const result=await fetchSubscribedIcs(original,controller.signal,fetch,hasSource)
      if(controller.signal.aborted)return
      const current=readSubscriptions()
      if(current.items.find(x=>x.id===id)?.revision!==original.revision)
        throw new Error('Subscription changed while the request was in progress. Nothing was applied.')
      if(result.kind==='not-modified'){
        if(!hasSource)throw new Error('A full snapshot is required because local imported records are absent.')
        const next=changeSubscription(current,id,{status:'unchanged',lastError:undefined,
          lastCheckedAt:new Date().toISOString(),
          history:historyEntry(original,'unchanged')})
        reviseSubscriptions(current,next);setSubscriptions(next)
        setNotice('Feed not modified (304). Original imported events were preserved.')
        return
      }
      const preview=previewIcs(result.text)
      if(!preview.records.length)throw new Error('Feed has no supported events; no local update was staged')
      assertFeedSource(current,id,preview.name,calendar.records.filter(x=>
        x.source==='ics').map(x=>x.sourceCalendar??'Imported'))
      if(controller.signal.aborted)return
      const staged=changeSubscription(current,id,{
        status:'review',lastCheckedAt:new Date().toISOString(),lastError:undefined,
        history:historyEntry(original,'review',preview.records.length)})
      reviseSubscriptions(current,staged);setSubscriptions(staged)
      setPending(preview);setPendingFeed({id,revision:staged.items.find(item=>item.id===id)!.revision,
        etag:result.etag,lastModified:result.lastModified})
      setImportMode('update')
      setSourcePanel(false)
      setNotice('Feed downloaded. Review source changes before applying them.')
    }catch(error){
      if(controller.signal.aborted)return
      // Never display or log a complete URL that may contain a bearer token.
      const detail=error instanceof Error?error.message:'Unknown feed error'
      const redacted=original?detail.split(original.url).join('(feed URL)'):detail
      const message=redacted.slice(0,290)
      setSubscriptionError(message)
      if(original){
        try{
          const latest=readSubscriptions()
          if(latest.items.find(x=>x.id===id)?.revision===original.revision){
            const next=changeSubscription(latest,id,{status:'error',lastError:message,
              lastCheckedAt:new Date().toISOString(),history:historyEntry(original,'error')})
            reviseSubscriptions(latest,next);setSubscriptions(next)
          }
        }catch{setSubscriptionError(message+'; metadata changed in another tab')}
      }
    }finally{
      if(checkController.current===controller){checkController.current=null;setCheckingFeedId(null)}
    }
  }
  function closeIcsReview(){setPending(null);setPendingFeed(null)}
  async function readBackup(e:ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0];e.target.value='';if(!f)return
    try{
      const next=importBackup(await f.text())
      setRestoreCandidate({state:next,origin:'JSON backup file: '+f.name})
      setSourcePanel(false)
    }catch(error){setNotice('Backup rejected: '+String(error))}
  }
  function proposeRecovery(){
    try{
      const snapshot=readRecovery()
      if(!snapshot){setNotice('No previous-version checkpoint is available');return}
      setRestoreCandidate({state:snapshot.state,origin:'Local checkpoint from '+new Date(snapshot.savedAt).toLocaleString()+' — '+snapshot.label})
      setSourcePanel(false)
    }catch(error){setNotice('Recovery checkpoint rejected: '+String(error))}
  }
  function confirmRecoverMissing(){
    if(!restoreCandidate||unreadable)return
    try{
      // Review again at action-time: original data and linked exceptions
      // must remain valid, and the guarded canonical commit still checks tabs.
      const review=previewMissingPersonal(calendar,restoreCandidate.state)
      if(review.added.length===0){setNotice('No missing personal records to restore');return}
      if(commit(review.state,'Recovered '+review.added.length+' missing personal record(s) without replacing existing calendar data')){
        setRestoreCandidate(null);setActive(null);setEditing(null);setQuery('')
      }
    }catch(error){setNotice('Selective recovery rejected: '+String(error))}
  }
  function confirmRestore(){
    if(!restoreCandidate)return
    let saved=false
    if(unreadable){
      try{
        const raw=rawCalendarBackup()
        if(raw===null)throw new Error('Original unreadable bytes are no longer available')
        restoreUnreadableCalendar(restoreCandidate.state,raw)
        setCalendar(restoreCandidate.state);setUnreadable(false)
        setNotice('Calendar repaired; exact original unreadable bytes are retained locally in a raw rescue snapshot. Download this rescue copy from Sources & data.')
        saved=true
      }catch(error){setNotice('Repair not applied: '+String(error))}
    }else saved=commit(restoreCandidate.state,'Calendar restored from '+restoreCandidate.origin)
    if(saved){
      try{setRecovery(readRecovery())}catch{setRecovery(null)}
      setRestoreCandidate(null);setActive(null);setEditorDate(null);setPending(null);setPendingFeed(null)
      setQuery('');setFilter('all');setSelected(localDate())
    }
  }
  const importReview=useMemo(()=>{
    if(!pending)return null
    try{
      const changes=reviewImportedChanges(calendar,pending,importMode)
      return {result:mergeIcs(calendar,pending,importMode),changes,error:''}
    }catch(error){return {result:null,changes:null,error:error instanceof Error?error.message:String(error)}}
  },[calendar,pending,importMode])
  function applyImport(){
    if(!pending)return
    let feedStore:SubscriptionStore|undefined
    let verifiedFeed:IcsSubscription|undefined
    if(pendingFeed){
      try{
        feedStore=readSubscriptions()
        verifiedFeed=feedStore.items.find(x=>x.id===pendingFeed.id)
        if(!verifiedFeed||verifiedFeed.revision!==pendingFeed.revision)
          throw new Error('Feed metadata changed in another tab. Refresh the preview before applying.')
        assertFeedSource(feedStore,pendingFeed.id,pending.name,calendar.records
          .filter(x=>x.source==='ics').map(x=>x.sourceCalendar??'Imported'))
      }catch(error){setNotice('Feed preview rejected: '+String(error));return}
    }
    // Confirm only demonstrable removals, never the whole prior imported source.
    const changed=reviewImportedChanges(calendar,pending,importMode)
    const removed=changed.counts.removed
    if(removed>0&&!window.confirm('This replacement removes '+removed+
      ' local imported event(s) missing from '+pending.name+
      '. Your personal events and external source are untouched. Continue?'))return
    const result=mergeIcs(calendar,pending,importMode)
    if(commit(result.state,`Imported ${result.added}; updated ${result.updated}; unchanged ${result.duplicates}; removed from prior snapshot ${result.removed}`)){
      if(pendingFeed&&feedStore&&verifiedFeed){
        try{
          const now=new Date().toISOString()
          const next=changeSubscription(feedStore,pendingFeed.id,{
            sourceName:pending.name,etag:pendingFeed.etag,lastModified:pendingFeed.lastModified,
            lastCheckedAt:now,lastAppliedAt:now,status:'applied',lastError:undefined,
            history:historyEntry(verifiedFeed,'applied',pending.records.length)})
          reviseSubscriptions(feedStore,next);setSubscriptions(next);setSubscriptionError('')
        }catch(error){
          setSubscriptionError('Calendar saved; subscription metadata was not updated: '+String(error))
        }
      }
      closeIcsReview()
    }
  }
  function downloadHubProjection(options:HubHandoffOptions):boolean{
    try{
      const latest=loadState()
      if(latest.error||JSON.stringify(latest.state)!==JSON.stringify(calendar))
        throw new Error('Original calendar changed. Reopen the snapshot review before sharing.')
      const review=reviewHubHandoff(latest.state,options)
      const filename='thiepn-calendar-readonly-'+options.from+'-to-'+options.through+'.ics'
      const nextReceipt=makeHandoffReceipt(latest.state,review,options,filename,
        new Date().toISOString(),deviceTimeZone())
      const text=exportHubHandoffIcs(latest.state,options)
      download(filename,text,'text/calendar;charset=utf-8')
      setLastHandoff(nextReceipt)
      setNotice('Snapshot download requested. The handoff is available in Sources & data during this tab session.')
      return true
    }catch(error){
      setNotice('Snapshot not downloaded: '+String(error))
      return false
    }
  }
  function locateHandoffOrigin(key:string){
    if(!lastHandoff)return
    const item=lastHandoff.owners.find(entry=>entry.key===key)
    if(!item)return
    try{
      const latest=loadState()
      if(latest.error||JSON.stringify(latest.state)!==JSON.stringify(calendar))
        throw new Error('Calendar changed in another tab. Reload to inspect the current original.')
      const resolved=resolveHandoffOrigin(latest.state,item)
      if(!resolved.current)throw new Error('The original event is no longer available at its downloaded occurrence.')
      setSelected(resolved.current.allDay?resolved.current.startDate:
        localDate(new Date(resolved.current.start)))
      setMode('day')
      setActive(resolved.current)
      setSourcePanel(false)
      setEcosystemHandoff(null)
      setNotice(resolved.status==='changed'?'This original event changed since the snapshot download. Inspect current details.':
        'Located the original Calendar occurrence.')
    }catch(error){setNotice('Original not opened: '+String(error))}
  }
  function exportReviewedPersonalIcs(options:ReviewedPersonalExportOptions){
    try{
      const latest=loadState()
      if(latest.error||JSON.stringify(latest.state)!==JSON.stringify(calendar))
        throw new Error('The saved calendar changed or cannot be read. Review the latest events before exporting.')
      const contents=downloadPersonalExport(latest.state,options)
      download('thiepn-calendar-personal-'+options.from+'-to-'+options.through+'.ics',contents,'text/calendar;charset=utf-8')
      setPersonalExportOpen(false)
      setNotice('Downloaded reviewed '+options.privacy+' personal ICS snapshot for '+options.from+' to '+options.through+
        '. Use the full JSON backup for device recovery.')
    }catch(error){setNotice('Personal ICS export failed: '+String(error))}
  }
  function downloadUnreadable(){
    const raw=rawCalendarBackup()
    if(raw===null){setNotice('No raw calendar text found');return}
    download('thiepn-calendar-raw-rescue.txt',raw,'text/plain')
    setNotice('Downloaded the original unreadable bytes. Do not clear browser data until you have a valid backup.')
  }
  function removeSource(name:string){
    if(!window.confirm('Remove all local imported snapshots from '+name+'? Original source data are not modified.'))return
    commit({schemaVersion:1,records:calendar.records.filter(x=>x.source!=='ics'||x.sourceCalendar!==name)},'Imported snapshot removed locally')
  }
  const counts={all:calendar.records.length,personal:personalCount,ics:calendar.records.length-personalCount}
  return <div className="app-shell">
    <aside className={'sidebar '+(mobileNav?'mobile-open':'')}>
      <div className="brand"><span className="brand-mark"><CalendarDays size={19}/></span><span><b>THIEPN</b><small>CALENDAR</small></span></div>
      <button className="primary sidebar-create" onClick={()=>{create(selected);setMobileNav(false)}}><Plus size={17}/> Create event</button>
      <div className="sidebar-section"><p className="eyebrow">NAVIGATE</p>
        {(['month','week','day','agenda'] as const).map(m=><button key={m} className={'nav-entry '+(mode===m?'active':'')} onClick={()=>{setMode(m);setMobileNav(false)}}>
          <span className="nav-mode-icon">{m==='month'?'▦':m==='week'?'▥':m==='day'?'▤':'≡'}</span>{m==='week'?'Week':m==='month'?'Month':m==='day'?'Day':'Agenda'}</button>)}
      </div>
      <div className="sidebar-section"><p className="eyebrow">CALENDARS</p>
        <button className={'source-entry '+(filter==='all'?'active':'')} onClick={()=>setFilter('all')}><span className="source-swatch all"/>All calendars <b>{counts.all}</b></button>
        <button className={'source-entry '+(filter==='personal'?'active':'')} onClick={()=>setFilter('personal')}><span className="source-swatch personal"/>Personal <b>{counts.personal}</b></button>
        <button className={'source-entry '+(filter==='ics'?'active':'')} onClick={()=>setFilter('ics')}><span className="source-swatch ics"/>Imported snapshots <b>{counts.ics}</b></button>
        {sources.slice(0,5).map(([name])=><button key={name} type="button"
          className={'source-entry imported-subsource '+(hiddenImportedSet.has(name)?'is-hidden':'')}
          aria-pressed={!hiddenImportedSet.has(name)}
          aria-label={'Toggle imported calendar '+name}
          title={hiddenImportedSet.has(name)?'Show imported '+name:'Hide imported '+name}
          onClick={()=>toggleImported(name)}>
          <span className="source-swatch ics" aria-hidden="true"/><span className="source-name">{name}</span>
          <small>{hiddenImportedSet.has(name)?'Hidden':'Shown'}</small>
        </button>)}
        {sources.length>5&&<p className="source-filter-note">{sources.length-5} additional imported calendars are available in Manage sources.</p>}
        {hiddenImportedCalendars.some(name=>sourceCounts.has(name))&&
          <p className="source-filter-note">Hidden snapshots remain saved and still block Find Time suggestions.</p>}
        <button className="text-action" onClick={()=>{setSourcePanel(true);setMobileNav(false)}}>Manage sources <ChevronRight size={14}/></button>
      </div>
      <div className="sidebar-bottom"><div className="privacy-label"><Database size={15}/><span>Device-local workspace<small>No account or remote sync</small></span></div>
        <a href="https://github.com/thiepn/folio" target="_blank" rel="noopener noreferrer" className="sidebar-link">Open Folio <ExternalLink size={13}/></a></div>
    </aside>
    {mobileNav&&<button aria-label="Close navigation" className="nav-scrim" onClick={()=>setMobileNav(false)}/>}
    <div className="workspace">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setMobileNav(true)}><Menu size={20}/></button>
        <div className="topbar-heading"><span className="eyebrow">MY WORKSPACE</span><h1>Calendar</h1></div>
        <div className="topbar-actions">
          <div className="search-field"><Search className="search-decorative-icon" size={16}/>
             <button type="button" className="search-focus-trigger" aria-label="Focus event search"
               onPointerDown={e=>e.preventDefault()}
               onClick={e=>{e.preventDefault();searchInput.current?.focus()}}><Search size={18}/></button>
             <input ref={searchInput} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search events" aria-label="Search calendar events"/>
             {query&&<button aria-label="Clear search" onClick={()=>setQuery('')}><X size={14}/></button>}</div>
          <button className="secondary compact reminder-launch" aria-label={'Local reminders'+(dueReminderCount?' ('+dueReminderCount+' due)':'')} onClick={()=>setRemindersOpen(true)}>
            <Bell size={15}/><span className="desktop-text">Reminders</span>{dueReminderCount>0&&<span className="reminder-count">{dueReminderCount}</span>}</button>
          <button className="secondary compact" aria-label="Find time" onClick={()=>showFindTime()}><Clock3 size={15}/><span className="desktop-text">Find time</span></button>
          <button className="secondary compact" onClick={()=>importInput.current?.click()}><Upload size={15}/><span className="desktop-text">Import ICS</span></button>
          {lastHandoff&&<button className="secondary compact last-handoff-shortcut" aria-label="Last calendar handoff"
            onClick={()=>setSourcePanel(true)}><RotateCcw size={15}/><span className="desktop-text">Last handoff</span></button>}
          <button className="icon-button" title="Review a privacy-first personal ICS snapshot" aria-label="Export personal events"
            onClick={()=>setPersonalExportOpen(true)}><Download size={17}/></button>
          <button className="primary top-create" onClick={()=>create(selected)}><Plus size={16}/> <span>New event</span></button>
        </div>
      </header>
      <main className="main-panel">
        <div className="date-toolbar">
          <div className="date-navigation"><button className="secondary compact" onClick={()=>setSelected(localDate())}>Today</button>
            <button className="icon-button" aria-label="Previous period" onClick={()=>step(-1)}><ChevronLeft size={19}/></button>
            <button className="icon-button" aria-label="Next period" onClick={()=>step(1)}><ChevronRight size={19}/></button>
            <h2>{title}</h2>
            <div className="busy-day-navigation">
              <button className="secondary compact" type="button" aria-label="Previous busy day" onClick={()=>jumpBusy(-1)}>Previous busy</button>
              <button className="secondary compact" type="button" aria-label="Next busy day" onClick={()=>jumpBusy(1)}>Next busy</button>
            </div>
            <label className="date-jump">Jump <input ref={jumpInput} aria-label="Jump to date" type="date" value={selected} onChange={e=>{if(e.target.value)setSelected(e.target.value)}}/></label></div>
          <div className="view-switch">{(['month','week','day','agenda'] as const).map(m=><button key={m} onClick={()=>setMode(m)} className={mode===m?'active':''}>{m==='agenda'?'List':m[0].toUpperCase()+m.slice(1)}</button>)}</div>
          <details className="calendar-shortcuts"><summary>Keyboard</summary><p>n — new event · t — today · g — jump to date · / — search · j/k — next/previous period · 1–4 — change view. When editing timed blocks, Alt+arrows move and Alt+Shift+vertical arrows resize; for all-day blocks use Alt+Left/Right and add Shift to resize.</p></details>
        </div>
        {notice&&<div className={'notice '+(/failed|rejected|not saved|could not/i.test(notice)?'notice-error':'')} role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss message"><X size={14}/></button></div>}
        <NowNext records={visible} nowIso={reminderNow} hasQuery={Boolean(query.trim())}
          onOpen={open} onShowDay={date=>{setSelected(date);setMode('day')}}/>
        {unreadable&&<div className="recovery-danger" role="alert">The saved calendar could not be read. No replacement has been written. <button className="secondary compact" onClick={downloadUnreadable}>Download original raw data</button> before attempting recovery.</div>}
        {query.trim()&&<section className="search-results-panel" aria-label="Calendar search results">
          <header><strong>Search {searchDirection==='backward'?'previous':'next'} 365 days from selected date</strong><span>{searchResults.total} occurrence{searchResults.total===1?'':'s'} found · showing {searchResults.fromIndex}–{searchResults.throughIndex}</span></header>
          <label className="search-window">Search period
            <select aria-label="Search period" value={searchDirection} onChange={e=>{setSearchDirection(e.target.value as 'forward'|'backward');setSearchPage(0)}}>
              <option value="forward">Selected date and next year</option>
              <option value="backward">Selected date and previous year</option>
            </select>
          </label>
          <div className="search-results-items">{searchResults.items.map(item=><button key={item.key} type="button" onClick={()=>{setMode('day');open(item)}}>
            <span className="search-result-date">{dateLabel(item.startDate,{month:'short',day:'numeric',year:'numeric'})}</span>
            <span className="search-result-title">{item.title}</span>
            <small>{item.source==='ics'?'Imported · read only':'Personal'}{item.transparent?' · Free (non-blocking)':''} · {item.allDay?'All day':new Date(item.start).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</small>
          </button>)}
          {!searchResults.total&&<p className="empty-note">No matching saved events in this 365-day window. Choose previous/next year or change the selected date.</p>}</div>
           {searchResults.pages>1&&<nav className="search-page-navigation" aria-label="Search result pages">
             <button className="secondary compact" type="button" disabled={!searchResults.hasPrevious}
               onClick={()=>setSearchPage(searchResults.page-1)}>Previous results</button>
             <span>Page {searchResults.page+1} of {searchResults.pages}</span>
             <button className="secondary compact" type="button" disabled={!searchResults.hasNext}
               onClick={()=>setSearchPage(searchResults.page+1)}>Next results</button>
           </nav>}
           <p className="fine-print search-scope-note">Search lists only displayed sources. Hidden imported calendars still count for Find time and conflict checks. Results are local and do not alter original events.</p>
        </section>}
        {planningDays.length>0&&<section className="planning-overview" aria-label="Seven-day planning overview">
          <div className="planning-overview-heading">
            <strong>Seven-day workload</strong>
            <small>Visible commitments · {filter==='all'?'shown sources':filter==='personal'?'personal only':'shown imports only'}{query.trim()?' · search filtered':''}</small>
          </div>
          <div className="planning-overview-days">
            {planningDays.map(item=><div className="planning-day-entry" key={item.date}>
              <button type="button" aria-label={'Open daily plan '+item.date}
                onClick={()=>{setSelected(item.date);setMode('day')}} className={'planning-day '+(item.date===selected?'is-selected':'')}>
                <time dateTime={item.date}>{dateLabel(item.date,{weekday:'short',month:'short',day:'numeric'})}</time>
                <strong>{item.timedCount+item.allDayCount} event{item.timedCount+item.allDayCount===1?'':'s'}</strong>
                <small>{item.busyMinutes?Math.floor(item.busyMinutes/60)+'h '+item.busyMinutes%60+'m timed':'No timed blocks'}{item.allDayCount?' · '+item.allDayCount+' all-day':''}</small>
                {item.overlaps&&<span className="planning-overlap">Overlapping times</span>}
              </button>
              <button className="planning-day-find" type="button" aria-label={'Find free time on '+item.date}
                disabled={item.date<localDate()} title={item.date<localDate()?'Past dates cannot be scheduled':'Find slots using all saved calendars'}
                onClick={()=>showFindTime(item.date)}><Clock3 size={12}/> Find time</button>
            </div>)}
          </div>
          <p className="fine-print">Busy timed minutes exclude imported free (TRANSP:TRANSPARENT) entries and never double-count overlaps across midnight or DST. All-day entries are listed separately; this is not a free-time guarantee. Open a day to plan a personal event.</p>
        </section>}
        {mode==='agenda'&&<div className="agenda-options">
          <label>Agenda range<select aria-label="Agenda range" value={agendaSpan} onChange={e=>setAgendaSpan(Number(e.target.value) as 14|30)}>
            <option value={14}>14 days</option><option value={30}>30 days</option>
          </select></label>
          <label><input type="checkbox" checked={agendaBusyOnly} onChange={e=>setAgendaBusyOnly(e.target.checked)}/> Only days with commitments</label>
          <nav className="agenda-jump-controls" aria-label="Skip empty periods">
            <button className="secondary compact" type="button" aria-label="Previous visible commitments"
              onClick={()=>jumpAgenda(-1)}><ChevronLeft size={15}/> Previous events</button>
            <button className="secondary compact" type="button" aria-label="Next visible commitments"
              onClick={()=>jumpAgenda(1)}>Next events <ChevronRight size={15}/></button>
          </nav>
          <button className="secondary compact" type="button" aria-label="Review all saved overlaps"
            onClick={()=>showOverlapInbox(selected)}><AlertTriangle size={15}/> Review overlaps</button>
          <button className="secondary compact" type="button" aria-label="Compare original agenda days"
            onClick={()=>showAgendaComparison(selected)}><CalendarDays size={15}/> Compare days</button>
          <button className="secondary compact" type="button" onClick={saveDisplayedAgenda} aria-label="Download visible agenda CSV"><Download size={14}/> Download visible agenda CSV</button>
          <p className="fine-print agenda-jump-note">Skip directly to the nearest visible event outside this displayed range, up to 365 days away. Keeps List view and displayed source filters; hidden busy imports still count independently for Find time.</p>
        </div>}
        <div className="content-grid">
          <div className="calendar-surface"><CalendarViews mode={mode} days={days} selected={selected} records={visible} onSelect={setSelected} onOpen={open} onCreate={create} onCreateAt={(date,start,end)=>startSlot({date,start,end})}
              onAdjust={requestAdjustment} onAllDaySlot={startAllDay} onAllDayAdjust={requestAllDayAdjustment}
              onPeek={date=>{setSelected(date);setMonthPeekDate(date)}}
              onShowDay={date=>{setSelected(date);setMode('day')}}
              hideEmptyAgenda={agendaBusyOnly}/></div>
          <aside className="inspector">
            <div className="inspector-heading"><span className="eyebrow">SELECTED DAY</span><h3>{dateLabel(selected,{weekday:'long',month:'short',day:'numeric'})}</h3>
              <p>{selectedEvents.length} visible commitment{selectedEvents.length===1?'':'s'}</p></div>
            {selectedEvents.length?<div className="inspector-list">{selectedEvents.map(item=><button key={item.key} onClick={()=>open(item)} className={'inspector-event '+(item.source==='ics'?'imported':'')}>
              <b>{item.allDay?'ALL DAY':new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(new Date(item.start))}</b><span>{item.title}</span></button>)}</div>:
              <div className="inspector-empty"><CalendarDays size={21}/><p>No events for this day.</p><button onClick={()=>create(selected)}>Add an event <Plus size={13}/></button></div>}
            <div className="inspector-legend"><p className="eyebrow">SOURCE KEY</p><span><i className="legend-swatch personal"/>Personal event</span><span><i className="legend-swatch ics"/>Imported (read-only)</span></div>
            <div className="inspector-foot">The calendar contains only data saved in this browser. Folio's source-owned tasks and habits are not mirrored live.</div>
          </aside>
        </div>
      </main>
    </div>
    <input ref={importInput} type="file" accept=".ics,text/calendar" hidden onChange={readIcs}/>
    <input ref={restoreInput} type="file" accept=".json,application/json" hidden onChange={readBackup}/>
    {monthPeekDate!==null&&mode==='month'&&<MonthDayPeek key={monthPeekDate} date={monthPeekDate} records={visible}
      onClose={()=>setMonthPeekDate(null)}
      onOpen={item=>{setMonthPeekDate(null);open(item)}}
      onShowDay={date=>{setMonthPeekDate(null);setSelected(date);setMode('day')}}
      onCreate={date=>{setMonthPeekDate(null);create(date)}}/>}
    {(pendingDraft||draftReadError)&&editorDate===null&&<div className="modal-backdrop draft-recovery-backdrop">
      <section className="dialog-surface draft-recovery" role="dialog" aria-modal="true" aria-label="Recover unfinished event">
        <h2>Unfinished event</h2>
        {pendingDraft?<><p>Unsaved edits to <strong>{pendingDraft.fields.title.trim()||'Untitled event'}</strong> were kept on this device.</p>
          <p>Restoring opens the editor for review. Nothing is added or changed until you choose Save.</p>
          <p className="draft-recovery-date">Last edited {new Date(pendingDraft.savedAt).toLocaleString()}</p></>:
          <p>The unfinished draft cannot be read. The saved calendar was not changed.</p>}
        {draftReadError&&<p role="alert" className="error">{draftReadError}</p>}
        <div className="draft-recovery-actions">
          {pendingDraft&&<button className="primary" type="button" onClick={resumeDraft}>Review recovered draft</button>}
          <button className="secondary" type="button" onClick={()=>{
            const raw=localStorage.getItem(EVENT_DRAFT_KEY)
            if(raw)download('calendar-unfinished-draft.json',raw,'application/json')
          }}>Download draft</button>
          <button className="danger" type="button" onClick={discardPendingDraft}>Discard unfinished draft</button>
        </div>
      </section>
    </div>}
    {editorDate!==null&&<EventEditor key={(restoredDraft?.id??'')+(editing?.id??'new')+editorDate+(newEventRange?.start??'')+(newAllDay?.through??'')} date={editorDate} event={editing??undefined} initialRange={newEventRange??undefined} initialAllDay={newAllDay??undefined} records={calendar.records} isCopy={copyDraft} defaultReminderMinutes={restoredDraft?.origin.defaultReminderMinutes??reminderSettings.defaultLead}
      recoveredDraft={restoredDraft??undefined}
      draftOrigin={{date:editorDate,event:editing??undefined,copy:copyDraft,
        baseRecord:copyDraft?undefined:editInstance?calendar.records.find(r=>r.id===editInstance.parentId):
          editFuture?calendar.records.find(r=>r.id===editFuture.parentId):editing?calendar.records.find(r=>r.id===editing.id):undefined,
        initialRange:newEventRange??undefined,initialAllDay:newAllDay??undefined,
        instance:editInstance??undefined,future:editFuture??undefined,
        defaultReminderMinutes:restoredDraft?.origin.defaultReminderMinutes??reminderSettings.defaultLead,
        deviceTimeZone:restoredDraft?.origin.deviceTimeZone??deviceTimeZone()}}
      ignoreOccurrence={editInstance?{id:editInstance.parentId,date:editInstance.date}:undefined}
      ignoreParentFrom={editFuture?{id:editFuture.parentId,date:editFuture.date}:undefined}
      scope={editInstance?'instance':editFuture?'future':undefined} onSave={save} onClose={()=>{setEditorDate(null);setEditing(null);setCopyDraft(false);setEditInstance(null);setEditFuture(null);setNewEventRange(null);setNewAllDay(null);setRestoredDraft(null)}}/>}
    {restoreCandidate&&<RestoreDialog current={calendar} candidate={restoreCandidate.state} origin={restoreCandidate.origin} unreadableCurrent={unreadable}
      onClose={()=>setRestoreCandidate(null)} onConfirm={confirmRestore} onRecoverMissing={unreadable?undefined:confirmRecoverMissing}/>}
    {remindersOpen&&<ReminderCenter items={reminders} dismissed={dismissedReminders}
      lookBackDays={overdueDays} onLookBackChange={setOverdueDays} onDismissDue={dismissDueReminders}
      snoozedKeys={new Set(Object.entries(reminderActions).filter(([,action])=>action.kind==='snooze').map(([key])=>key))}
      onCancelSnooze={undoReminderDismissal} settings={reminderSettings} onSettingsChange={changeReminderSettings} onUndoDismiss={undoReminderDismissal} onClose={()=>setRemindersOpen(false)}
      onOpen={item=>{setRemindersOpen(false);setMode('day');open(item.occurrence)}}
      onDismiss={item=>updateReminderAction(item,'dismiss')}
      onSnooze={(item,minutes)=>{updateReminderAction(item,'snooze',minutes)}}
       onSnoozeUntil={(item,localWall)=>updateReminderAction(item,'snooze',15,localWall)}
      onEnableNotifications={enableForegroundNotifications} onDisableNotifications={disableForegroundNotifications}
      foregroundEnabled={notifyEnabled&&notifyPermission==='granted'} permission={notifyPermission}/>}
    {finderOpen&&<div className="modal-backdrop" onMouseDown={ev=>{if(ev.target===ev.currentTarget)setFinderOpen(false)}}>
      <section className="finder-dialog dialog-surface" role="dialog" aria-modal="true" aria-label="Find an available time">
        <header className="editor-head"><div className="heading-inline"><Clock3 size={20}/><h2>Find time</h2></div><button className="icon-button" aria-label="Close time finder" onClick={()=>setFinderOpen(false)}><X size={19}/></button></header>
        <p className="fine-print">Find a free time from {dateLabel(finderFrom)} onward. All saved calendars are checked, including hidden imported events. A slot is only booked after you save a new personal event.</p>
        <div className="finder-day-navigation" aria-label="Choose availability date">
          <label>Search starts <input aria-label="Finder start date" type="date" min={localDate()} value={finderFrom}
            onChange={e=>{if(e.target.value)updateFinderDay(e.target.value)}}/></label>
          <button type="button" className="secondary compact" aria-label="Previous finder day"
            disabled={finderFrom<=localDate()} onClick={()=>stepFinderDay(-1)}><ChevronLeft size={16}/> Previous day</button>
          <button type="button" className="secondary compact" aria-label="Next finder day"
            onClick={()=>stepFinderDay(1)}>Next day <ChevronRight size={16}/></button>
        </div>
        {finderSelection.error&&<p className="error" role="alert">{finderSelection.error}</p>}
        {finderDays===1&&<p className="finder-day-scope">Single-day search · exact date selected · all saved sources checked</p>}
        <div className="finder-options">
          <label>Duration<select value={finderDuration} onChange={ev=>setFinderDuration(Number(ev.target.value))}><option value={30}>30 minutes</option><option value={60}>60 minutes</option><option value={90}>90 minutes</option><option value={120}>120 minutes</option></select></label>
          <label>Look ahead<select value={finderDays} onChange={ev=>setFinderDays(Number(ev.target.value) as FinderDaySpan)}><option value={1}>This day only</option><option value={7}>7 days</option><option value={14}>14 days</option></select></label>
          <label>Hours<select value={finderWindow} onChange={ev=>setFinderWindow(ev.target.value as 'daytime'|'evening')}><option value="daytime">08:00–19:00</option><option value="evening">17:00–23:00</option></select></label>
          <label>Days<select aria-label="Preferred days" value={finderDaySelection} onChange={ev=>setFinderDaySelection(ev.target.value as 'all'|'weekdays'|'weekends')}>
            <option value="all">Every day</option><option value="weekdays">Weekdays only</option><option value="weekends">Weekends only</option>
          </select></label>
          <label>Spacing<select aria-label="Spacing between commitments" value={finderBufferMinutes} onChange={ev=>setFinderBufferMinutes(Number(ev.target.value) as 0|15|30)}>
            <option value={0}>Back-to-back OK</option><option value={15}>15-minute gap</option><option value={30}>30-minute gap</option>
          </select></label>
        </div>
        <label className="finder-checkbox"><input type="checkbox" checked={finderBlockAllDay} onChange={ev=>setFinderBlockAllDay(ev.target.checked)}/> Treat all-day entries as unavailable</label>
        <h3>Available start times <small>({freeSlots.length} shown)</small></h3>
        <div className="finder-results">{freeSlots.map(slot=><button key={slot.start} type="button" className="finder-slot" onClick={()=>startFinderSlot(slot)}>
          <span><strong>{dateLabel(slot.date,{weekday:'short',month:'short',day:'numeric'})}</strong><small>{new Date(slot.start).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})} – {new Date(slot.end).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</small></span>
          <span className="finder-plan">Plan event <ChevronRight size={14}/></span>
        </button>)}
        {!freeSlots.length&&<p className="empty-note">{finderSelection.error?'Choose a current or future date to search.':'No available slots in this window. Try the next day, a shorter duration, evening hours or more days.'}</p>}</div>
        <p className="fine-print">Suggestions inspect every saved personal and read-only imported event regardless of visible source filters. Spacing is reserved both before and after timed commitments. Ambiguous/nonexistent local times are excluded rather than guessed. A selection is checked again against the latest local storage before the editor opens and still requires a guarded save. No provider or participant is booked.</p>
      </section></div>}
    {allDayAdjustment&&<AllDayDialog key={allDayAdjustment.item.key+allDayAdjustment.from+allDayAdjustment.through}
      item={allDayAdjustment.item} initial={{from:allDayAdjustment.from,through:allDayAdjustment.through}}
      state={calendar} onApply={confirmAllDay} onClose={()=>setAllDayAdjustment(null)}/>}
    {adjustment&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setAdjustment(null);setAdjustAlternativesOpen(false)}}}>
      <section className="adjust-dialog dialog-surface" role="dialog" aria-modal="true" aria-label="Confirm time adjustment">
        <header className="editor-head"><h2>Review {adjustment.action==='move'?'move':'resize'}</h2>
          <button className="icon-button" aria-label="Cancel adjustment" onClick={()=>setAdjustment(null)}><X size={19}/></button></header>
        <h3>{adjustment.item.title}</h3>
        <p className="fine-print">Original: {new Date(adjustment.item.start).toLocaleString()} – {new Date(adjustment.item.end).toLocaleString()}</p>
        <div className="editor-grid adjust-fields">
          <label>Proposed start
            <input type="datetime-local" value={adjustment.date+'T'+String(Math.floor(adjustment.minute/60)).padStart(2,'0')+':'+String(adjustment.minute%60).padStart(2,'0')}
              onChange={event=>{
                const value=event.target.value
                if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return
                const hour=Number(value.slice(11,13)),minute=Number(value.slice(14,16))
                setAdjustAck(false)
                setAdjustment(prev=>prev?{...prev,date:value.slice(0,10),minute:hour*60+minute,fold:undefined}:prev)
              }}/></label>
          <label>Duration (minutes)
            <input type="number" min={15} max={1440} step={15} value={adjustment.length}
              onChange={event=>{setAdjustAck(false);setAdjustment(prev=>prev?{...prev,length:Number(event.target.value)}:prev)}}/></label>
        </div>
        {adjustment&&(()=>{
          const wall=adjustment.date+'T'+String(Math.floor(adjustment.minute/60)).padStart(2,'0')+':'+String(adjustment.minute%60).padStart(2,'0')
          let options:string[]=[]
          try{options=localInstantOptions(wall)}catch{}
          return options.length===2?<label className="fold-choice">Repeated proposed hour
            <select aria-label="Repeated proposed hour" value={adjustment.fold??''}
              onChange={e=>setAdjustment(prev=>prev?{...prev,fold:e.target.value as 'earlier'|'later'|undefined}:prev)}>
              <option value="">Choose the first or second occurrence</option>
              <option value="earlier">First ({offsetLabel(options[0])})</option>
              <option value="later">Second ({offsetLabel(options[1])})</option>
            </select></label>:null
        })()}
        {adjustmentReview.error&&<p role="alert" className="error">{adjustmentReview.error}</p>}
        {adjustmentReview.proposal&&<>
          <p className="adjust-new-time">Proposed: {new Date(adjustmentReview.proposal.start).toLocaleString()} – {new Date(adjustmentReview.proposal.end).toLocaleString()}</p>
          {calendar.records.find(r=>r.id===adjustment.item.recordId)?.repeat&&
            <p className="readonly-note">This adjusts only the selected occurrence. Other dates in the recurring series remain unchanged.</p>}
          {adjustmentReview.proposal.conflicts.length>0&&<div className="adjust-conflicts" role="alert">
            <strong><AlertTriangle size={16}/> {adjustmentReview.proposal.conflicts.length} overlapping saved commitment(s)</strong>
            <p>Including imported and hidden sources; no event is silently moved or deleted. Find a different time before accepting an overlap.</p>
            <ul>{adjustmentReview.proposal.conflicts.slice(0,8).map(item=><li key={item.key}>{item.title} ({item.source==='ics'?'imported, read-only':'personal'})</li>)}</ul>
            <label><input type="checkbox" checked={adjustAck} onChange={event=>setAdjustAck(event.target.checked)}/> Save despite these overlaps</label>
          </div>}
          <section className="adjust-alternatives" aria-label="Conflict-free adjustment alternatives">
            <button className="secondary" type="button" aria-expanded={adjustAlternativesOpen}
              aria-controls="adjust-alternative-results" onClick={()=>setAdjustAlternativesOpen(current=>!current)}>
              <Clock3 size={15}/>{adjustAlternativesOpen?'Hide alternatives':'Find conflict-free alternatives'}
            </button>
            {adjustAlternativesOpen&&<div id="adjust-alternative-results" className="adjust-alternative-results">
              <p className="fine-print">Choose a suggested date and time for this one personal occurrence. All other personal series instances and every imported or hidden source remain busy. No changes are saved until you confirm.</p>
              <div className="adjust-alternative-options">
                <label>Search ahead<select aria-label="Alternative search days" value={adjustAlternativeDays}
                  onChange={event=>setAdjustAlternativeDays(Number(event.target.value) as 1|3|7)}>
                  <option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>7 days</option>
                </select></label>
                <label>Spacing<select aria-label="Alternative spacing" value={adjustAlternativeBuffer}
                  onChange={event=>setAdjustAlternativeBuffer(Number(event.target.value) as 0|15|30)}>
                  <option value={0}>Back-to-back allowed</option><option value={15}>15-minute gap</option><option value={30}>30-minute gap</option>
                </select></label>
              </div>
              {adjustmentAlternatives.error?<p role="alert" className="error">{adjustmentAlternatives.error}</p>:
                adjustmentAlternatives.items.length?<div className="adjust-alternative-list">
                  {adjustmentAlternatives.items.map(slot=><button type="button" key={slot.start}
                    aria-label={'Use alternative '+slot.date+' '+new Date(slot.start).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}
                    onClick={()=>chooseAdjustmentAlternative(slot)}>
                    <span><strong>{dateLabel(slot.date,{weekday:'short',month:'short',day:'numeric'})}</strong>
                      <small>{new Date(slot.start).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})} – {new Date(slot.end).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</small></span>
                    <span>Use time <ChevronRight size={14}/></span>
                  </button>)}
                </div>:<p className="empty-note">No free alternative within this search. Try more days or less spacing; long events may require manual scheduling.</p>}
              <p className="fine-print">Suggestions use 07:00–23:00 device-local hours, a 15-minute grid and durations up to 4 hours. DST gaps and repeated hours are excluded. Source availability is rechecked when selecting a suggestion, then checked again during the guarded save.</p>
            </div>}
          </section>
        </>}
        <footer className="editor-actions"><button className="secondary" type="button" onClick={()=>setAdjustment(null)}>Cancel</button>
          <button className="primary" type="button" onClick={confirmAdjustment}
            disabled={!adjustmentReview.proposal||(adjustmentReview.proposal.conflicts.length>0&&!adjustAck)}>Confirm change</button></footer>
      </section>
    </div>}
    {active&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setActive(null)}}>
      <section className="details dialog-surface" role="dialog" aria-modal="true" aria-label="Event details">
        <header className="editor-head"><span className="eyebrow">{active.source==='ics'?'IMPORTED SNAPSHOT — READ ONLY':'PERSONAL EVENT'}</span><button className="icon-button" aria-label="Close event" onClick={()=>setActive(null)}><X size={19}/></button></header>
        <nav className="details-navigation" aria-label="Browse nearby visible events">
          <button type="button" className="secondary compact" aria-label="Previous visible event"
            disabled={!detailsNavigation?.previous}
            onClick={()=>{if(detailsNavigation?.previous)open(detailsNavigation.previous)}}>
            <ChevronLeft size={16}/><span>Previous</span>
          </button>
          <div className="details-navigation-current" aria-live="polite">
            <strong>{detailsNavigation?.included?
              'Event '+detailsNavigation.position+' of '+detailsNavigation.count:'Event outside current display filter'}</strong>
            <small>Shown events · within 30 days either side</small>
          </div>
          <button type="button" className="secondary compact" aria-label="Next visible event"
            disabled={!detailsNavigation?.next}
            onClick={()=>{if(detailsNavigation?.next)open(detailsNavigation.next)}}>
            <span>Next</span><ChevronRight size={16}/>
          </button>
        </nav>
        <h2>{active.title}</h2><p className="details-dates">{active.allDay?'All day · '+friendlyRange(active.startDate,addDays(active.endDateExclusive,-1)):new Date(active.start).toLocaleString()+' – '+new Date(active.end).toLocaleString()}</p>
        {activeRecord?.sourceTimeZone&&!active.allDay&&<p className="details-event-zone"><strong>Imported source timezone:</strong> {activeRecord.sourceTimeZone} · {zoneWall(active.start,activeRecord.sourceTimeZone)} – {zoneWall(active.end,activeRecord.sourceTimeZone)} (read only)</p>}
        {activeRecord?.timeZone&&!active.allDay&&<p className="details-event-zone"><strong>Event time zone:</strong> {activeRecord.timeZone} · {zoneWall(active.start,activeRecord.timeZone)}–{zoneWall(active.end,activeRecord.timeZone).slice(11)} (device: {deviceTimeZone()})</p>}
        <div className="details-compare-actions">
        <button type="button" className="secondary compact"
          onClick={()=>showOverlapInbox(active.allDay?active.date:localDate(new Date(active.start)))}>
          Review overlaps</button>
        {returnToComparison&&<button type="button" className="secondary compact"
          onClick={()=>{setActive(null);setAgendaCompareOpen(true);setReturnToComparison(false)}}>
          Return to day comparison</button>}
        <button type="button" className="secondary compact"
          onClick={()=>showAgendaComparison(active.allDay?active.date:localDate(new Date(active.start)))}>
          Compare this day</button>
        </div>
        <button type="button" className="details-show-day secondary compact"
          onClick={()=>{setMode('day');setSelected(active.allDay?active.date:localDate(new Date(active.start)));setActive(null)}}>
          <CalendarDays size={15}/> Show this day
        </button>
        {active.location&&<p><strong>Location:</strong> {active.location}</p>}{active.description&&<p className="description">{active.description}</p>}
        {active.transparent&&<div className="nonblocking-note">Imported as free (TRANSP:TRANSPARENT). This event remains visible but does not block Find time or produce overlap warnings. A separate personal copy is an ordinary busy event.</div>}
         {active.source==='ics'&&<div className="readonly-note"><AlertTriangle size={16}/> Imported from {active.sourceCalendar}. Editing the original requires the source calendar. This is only a local copy. You may create a separate personal event without modifying this snapshot.</div>}
        {activeRecord?.recurrenceParentId&&<div className="readonly-note">Edited occurrence from a recurring series. Original series date: {activeRecord.recurrenceDate}.</div>}
        {active.source==='personal'&&<div className="move-control"><label>Move to date<input type="date" value={moveDate} onChange={ev=>setMoveDate(ev.target.value)}/></label>
          <button className="secondary" type="button" disabled={!moveDate||moveDate===active.startDate} onClick={()=>move(active)}>Move event</button>
          <button className="secondary" type="button" onClick={()=>duplicateToDate(active)}>Duplicate to selected date</button>
          <p className="fine-print">Moving one repeating occurrence keeps the remaining series unchanged. All changes remain on this device.</p>
        </div>}
        <footer className="editor-actions">
          {(active.source==='ics'&&Boolean(activeRecord?.sourceCalendar)||
            active.source==='personal'&&Boolean(activeRecord?.repeat||activeRecord?.recurrenceParentId))&&
            <button className="secondary" onClick={()=>openAgendaTrailFromEvent(active)}>
              <CalendarDays size={15}/> Browse source trail</button>}
          {active.source==='ics'&&<button className="secondary" onClick={()=>copyImportedToPersonal(active)}><Plus size={15}/> Make personal copy</button>}
          {activeRecord?.repeat&&<button className="secondary" onClick={()=>nextRecurring(active)}><ChevronRight size={15}/> Next occurrence</button>}
          {activeRecord?.repeat&&<button className="secondary" onClick={()=>skip(active)}><RotateCcw size={15}/> Skip this date</button>}
          {activeRecord?.recurrenceParentId&&<button className="secondary" onClick={()=>restore(active)}><RotateCcw size={15}/> Restore original date</button>}
          {active.source==='personal'&&activeRecord?.repeat&&<button className="secondary" onClick={()=>edit(active,'instance')}><Pencil size={15}/> Edit this occurrence</button>}
          {active.source==='personal'&&activeRecord?.repeat&&<button className="secondary" onClick={()=>edit(active,'future')}><Pencil size={15}/> Edit this and future</button>}
          {active.source==='personal'&&activeRecord?.repeat&&<button className="secondary" onClick={()=>stopAfter(active)}><RotateCcw size={15}/> End after this date</button>}
          {active.source==='personal'&&active.allDay&&<button className="secondary" onClick={()=>
            requestAllDayAdjustment(active,active.startDate,addDays(active.endDateExclusive,-1))}>
            <CalendarDays size={15}/> Adjust all-day dates</button>}
          {active.source==='personal'&&!active.allDay&&<button className="secondary" onClick={()=>{
            const date=new Date(active.start)
            requestAdjustment(active,'move',localDate(date),date.getHours()*60+date.getMinutes(),
              Math.round((Date.parse(active.end)-Date.parse(active.start))/60000),
              (()=>{
                const opts=localInstantOptions(localDateTime(active.start))
                return opts.length===2?(opts[0]===active.start?'earlier':'later'):undefined
              })())
          }}><Clock3 size={15}/> Adjust time & duration</button>}
          {active.source==='personal'&&<button className="secondary" onClick={()=>edit(active)}><Pencil size={15}/> {activeRecord?.repeat?'Edit whole series':'Edit event'}</button>}
          <button className="secondary" onClick={()=>{setEcosystemHandoff(active);setActive(null)}}>
            <Download size={15}/> Share read-only snapshot</button>
          <button className="danger" onClick={()=>remove(active.recordId)}><Trash2 size={15}/> {active.source==='ics'?'Remove copy':activeRecord?.repeat?'Delete series':'Delete'}</button>
        </footer>
      </section>
    </div>}
    {pending&&<div className="modal-backdrop"><section className="import-dialog dialog-surface" role="dialog" aria-modal="true" aria-label="ICS import review">
      <header className="editor-head"><h2>Review ICS snapshot</h2><button className="icon-button" aria-label="Close import" onClick={closeIcsReview}><X size={19}/></button></header>
      <p><strong>{pending.name}</strong> · {pending.records.length} supported events</p>
      {pendingFeed&&<p role="status">Checked subscribed feed. No imported event has changed yet. Only Apply reviewed changes writes local records.</p>}
      {pending.skippedEvents>0&&<p className="incomplete-ics-notice" role="status">
        {pending.skippedEvents} source event{pending.skippedEvents===1?'':'s'} could not be read. Update matching UIDs retains earlier read-only copies; full replacement is blocked to prevent deletion of omitted records.
      </p>}
      <div className="import-preview">{pending.records.slice(0,7).map(r=><div key={r.id}><span>{r.title}</span><small>{r.startDate??new Date(r.start).toLocaleString()}{r.sourceTimeZone?' · '+r.sourceTimeZone:''}</small></div>)}{pending.records.length>7&&<p>+{pending.records.length-7} additional entries</p>}</div>
      {pending.warnings.length>0&&<div className="import-warnings"><b>{pending.warnings.length} skipped or warned events</b>{pending.warnings.slice(0,12).map((w,i)=><p key={i}>{w}</p>)}</div>}
      <fieldset className="import-options"><legend>How to handle this calendar</legend>
        <label><input type="radio" checked={importMode==='update'} onChange={()=>setImportMode('update')}/> Add new entries and refresh matching event UIDs; keep others</label>
        <label><input type="radio" checked={importMode==='replace'} onChange={()=>setImportMode('replace')}/> Replace the earlier imported snapshot named “{pending.name}” entirely</label>
      </fieldset>
      {importReview?.error&&<p role="alert" className="error">Import cannot be applied: {importReview.error}</p>}
      {importReview?.result&&<p className="import-delta" aria-label="Import change preview">
        Preview: <strong>{importReview.result.added} new</strong> · {importReview.result.updated} updated · {importReview.result.duplicates} unchanged · {importReview.result.removed} removed from this local snapshot.
      </p>}
      {importReview?.changes&&<section className="import-change-review" aria-label="Imported changes by event">
        <header><strong>Exactly what changes in this local snapshot</strong>
          <small>{importMode==='replace'?'Full source replacement':'Add or update matching source UIDs; omissions retained'}</small>
        </header>
        {importReview.changes.counts.removed>0&&<p className="import-deletion-warning" role="status">
          {importReview.changes.counts.removed} imported event(s) will be removed locally because they are missing from this replacement file.
          Your external source and personal events are not modified.
        </p>}
        <div className="import-change-items">
          {importReview.changes.changes.filter(item=>item.kind!=='unchanged').slice(0,35).map((item,index)=>{
            const before=item.original,after=item.incoming
            return <div key={(after?.sourceKey??before?.sourceKey??'change')+'-'+index}
              className={'import-change-row change-'+item.kind}>
              <span className="import-change-kind">{item.kind}</span>
              <strong>{after?.title??before?.title}</strong>
              {before&&<small>Before: {before.allDay?before.startDate:new Date(before.start).toLocaleString()}
                {after&&before.title!==after.title?' · '+before.title:''}</small>}
              {after&&<small>After: {after.allDay?after.startDate:new Date(after.start).toLocaleString()}</small>}
              {after?.transparent&&<small>Free · does not block time</small>}
              {item.changedFields.length>0&&<small>Changed: {item.changedFields.map(field=>field==='transparent'?'free/busy status':field==='sourceTimeZone'?'source time zone':field).join(', ')}</small>}
            </div>
          })}
          {!importReview.changes.changes.some(item=>item.kind!=='unchanged')&&
            <p className="empty-note">No additions, changes or removals in this mode.</p>}
        </div>
        {importReview.changes.changes.filter(item=>item.kind!=='unchanged').length>35&&
          <p className="fine-print">Showing the first 35 changes. Download the complete report to review the others.</p>}
        <button type="button" className="secondary small" onClick={()=>{
          try{
            download('thiepn-calendar-import-review.csv',exportImportedChangeCsv(importReview.changes!),'text/csv;charset=utf-8')
            setNotice('Downloaded the local event-level source change report. No data was uploaded.')
          }catch(error){setNotice('Change report export failed: '+String(error))}
        }}><Download size={14}/> Download complete change report ({importReview.changes.changes.length} entries)</button>
      </section>}
      <p className="fine-print">Read-only local snapshot; not live sync. Unsupported RRULE masters are skipped with warnings. Neither method modifies Google, Folio, KLIPS or personal events.</p>
      <footer className="editor-actions"><button className="secondary" onClick={closeIcsReview}>Cancel</button><button className="primary" onClick={applyImport} disabled={!importReview?.result}>Apply reviewed changes</button></footer>
    </section></div>}
    {overlapInboxOpen&&<OverlapInbox state={calendar} initialDate={overlapInboxDate}
      hiddenSources={hiddenImportedCalendars}
      onOpen={inspectOverlapParticipant} onClose={()=>setOverlapInboxOpen(false)}/>}
    {agendaCompareOpen&&<AgendaCompareDialog records={visible}
      first={compareFirst} second={compareSecond}
      onFirst={setCompareFirst} onSecond={setCompareSecond}
      sourceDescription={filter==='personal'?'Personal events':filter==='ics'?'Displayed imported events':'Displayed personal and imported events'}
      onOpen={openComparedOccurrence} onClose={()=>setAgendaCompareOpen(false)}/>}
    {agendaTrail&&<AgendaTrail state={calendar} target={agendaTrail.target}
      initialDate={agendaTrail.initialDate} hiddenSources={hiddenImportedCalendars}
      onOpen={openAgendaTrailRow} onClose={closeAgendaTrail}/>}
    {ecosystemHandoff!==null&&<EcosystemHandoff
      state={calendar} selectedDate={selected}
      occurrence={ecosystemHandoff===true?null:ecosystemHandoff}
      onExport={downloadHubProjection} subscriptions={subscriptions.items}
      receipt={lastHandoff} onLocate={locateHandoffOrigin}
      onClearReceipt={()=>setLastHandoff(null)} onClose={()=>{
        const origin=ecosystemHandoff===true?null:ecosystemHandoff
        setEcosystemHandoff(null)
        if(origin){
          const valid=calendar.records.some(r=>r.id===origin.recordId)
          if(valid)setActive(origin)
        }else setSourcePanel(true)
      }}/>}
    {personalExportOpen&&<PersonalExportDialog state={calendar} selected={selected}
      onClose={()=>setPersonalExportOpen(false)} onExport={exportReviewedPersonalIcs}/>}
    {sourcePanel&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSourcePanel(false)}}>
      <section className="sources-dialog dialog-surface" role="dialog" aria-modal="true" aria-label="Calendar data management">
        <header className="editor-head"><h2>Sources & data</h2><button className="icon-button" aria-label="Close sources" onClick={()=>setSourcePanel(false)}><X size={19}/></button></header>
        <div className="source-card"><strong>Personal <span>{personalCount} records</span></strong><p>Editable device-local events. This is not Folio's schedule.</p></div>
        <p className="fine-print">Show or hide each imported snapshot without deleting its source records. Hidden snapshots are excluded from calendar views, search, workload and visible agenda exports; Find Time and overlap checks still include every saved commitment.</p>
        <SourcePicker sources={sources} hidden={hiddenImportedCalendars} onApply={applyImportedVisibility}
          onToggle={toggleImported} onRemove={removeSource} onExplore={name=>{
            setSourcePanel(false)
            setAgendaTrail({target:{kind:'source',name},initialDate:selected})
          }} error={sourcePickerError}/>
        {!sources.length&&<p className="empty-note">No imported ICS snapshots.</p>}
        {lastHandoff&&<HandoffContinuity receipt={lastHandoff} calendar={calendar}
          onLocate={locateHandoffOrigin} onClear={()=>setLastHandoff(null)}/>}
        <button type="button" className="secondary" onClick={()=>{
          setSourcePanel(false);setEcosystemHandoff(true)
        }}><Download size={16}/> Share selected events to Hub</button>
        <SubscriptionManager subscriptions={subscriptions.items} error={subscriptionError}
          activeId={checkingFeedId} onAdd={addFeed} onCheck={checkFeed}
          onCancel={cancelFeed} onRemove={removeFeed}/>
        <hr/><h3>Backups & interop</h3><div className="button-stack">
          <button className="secondary" onClick={()=>importInput.current?.click()}><Upload size={16}/> Import ICS snapshot</button>
          <button className="secondary" onClick={()=>{setSourcePanel(false);setPersonalExportOpen(true)}}><Download size={16}/> Review personal ICS export</button>
          <button className="secondary" onClick={()=>download('thiepn-calendar-backup.json',exportBackup(calendar),'application/json')}><Download size={16}/> Save full JSON backup</button>
          <button className="secondary" onClick={()=>restoreInput.current?.click()}><Upload size={16}/> Review JSON backup restoration</button>
          <button className="secondary" disabled={!recovery} onClick={proposeRecovery}><RotateCcw size={16}/> Review previous-version checkpoint</button>
          <button className="secondary" disabled={!recovery} onClick={()=>{
            try{
              const latest=readRecovery()
              if(!latest)throw new Error('Recovery checkpoint no longer exists')
              download('thiepn-calendar-recovery-'+latest.savedAt.slice(0,10)+'.json',exportBackup(latest.state),'application/json')
              setNotice('Exported the validated previous-version checkpoint as a portable JSON backup')
            }catch(error){setNotice('Checkpoint export failed: '+String(error))}
          }}><Download size={16}/> Export previous-version checkpoint JSON</button>
          {recovery&&<p className="fine-print">Checkpoint: {new Date(recovery.savedAt).toLocaleString()} — {recovery.label}. Stores one prior complete version on this device.</p>}
          {unreadable&&<button className="danger" onClick={downloadUnreadable}><Download size={16}/> Download unreadable original bytes</button>}
          {rescuedUnparsedCalendar()!==null&&<button className="secondary" onClick={()=>{
            const raw=rescuedUnparsedCalendar()
            if(raw!==null)download('thiepn-calendar-unreadable-rescue.txt',raw,'text/plain')
          }}><Download size={16}/> Download retained raw rescue snapshot</button>}
        </div>
        <section className="display-preferences" aria-label="Calendar display preferences">
          <h3>Saved display</h3>
          <p className="fine-print">Current view ({mode}), source filter ({filter}), hidden imported snapshot choices ({hiddenImportedCalendars.filter(name=>sourceCounts.has(name)).length}) and agenda options are saved on this device. Display-only choices are not included in event JSON backups. The selected date resets to today.</p>
          <button type="button" className="secondary small" onClick={resetDisplayPreferences}><RotateCcw size={14}/> Reset display preferences</button>
        </section>
        <OfflineReadiness/>
        <div className="readonly-note"><AlertTriangle size={16}/> No Account, Google or Folio sync is connected. Keep a backup before clearing browser data.</div>
        <a target="_blank" rel="noopener noreferrer" href="https://github.com/thiepn/folio" className="external-inline">Open source-owned Folio <ExternalLink size={14}/></a>
      </section></div>}
  </div>
}
