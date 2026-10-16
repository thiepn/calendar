import {useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react'
import {CalendarDays,ChevronLeft,ChevronRight,Bell,Plus,Upload,Download,Search,Database,ExternalLink,AlertTriangle,Trash2,Pencil,X,RotateCcw,Menu,Clock3} from 'lucide-react'
import type {CalendarOccurrence,CalendarRecord,CalendarState,LocalDate} from './types'
import {addDays,addMonths,dateLabel,dateSeries,friendlyRange,localDate,monday,monthGridStart,localDateTime,localInstantOptions,offsetLabel} from './core/dates'
import {dayOccurrences,excludeOccurrence,occurrencesBetween} from './core/occurrences'
import {replaceOccurrence,restoreOccurrence,saveWholeEvent,shiftOccurrence,splitSeriesAt,endSeriesAt} from './core/series'
import {findFreeSlots,type FreeSlot} from './core/availability'
import {proposeTimedChange,applyTimedChange,type TimedAction} from './core/reschedule'
import {exportBackup,importBackup,loadState,saveState,readRecovery,rawCalendarBackup,rescuedUnparsedCalendar,restoreUnreadableCalendar,STORAGE_KEY,type RecoverySnapshot} from './core/storage'
import {exportIcs,mergeIcs,previewIcs,type IcsPreview} from './core/ics'
import {EventEditor} from './components/EventEditor'
import {AllDayDialog} from './components/AllDayDialog'
import {RestoreDialog} from './components/RestoreDialog'
import {ReminderCenter} from './components/ReminderCenter'
import {OfflineReadiness} from './components/OfflineReadiness'
import {loadViewPreferences,saveViewPreferences,resetViewPreferences,VIEW_PREFERENCES_KEY,type ViewPreferences} from './core/view-preferences'
import {reminderItems,readReminderActions,saveReminderActions,actionForReminder,deliverableReminders,proposedSnooze,REMINDER_ACTIONS_KEY,REMINDER_DELIVERED_KEY,type ReminderItem,type ReminderActions} from './core/reminders'
import {DEFAULT_REMINDER_SETTINGS,loadReminderSettings,saveReminderSettings,inQuietHours,REMINDER_SETTINGS_KEY,type ReminderSettings} from './core/reminder-settings'
import {applyAllDayChange,type AllDayProposal} from './core/all-day'
import {CalendarViews,type Mode} from './components/CalendarViews'

type Filter='all'|'personal'|'ics'
function download(name:string,contents:string,type:string){
  const link=document.createElement('a')
  const url=URL.createObjectURL(new Blob([contents],{type}))
  link.href=url;link.download=name;document.body.append(link);link.click();link.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}
const initial=loadState()
const initialView=(()=>{try{return loadViewPreferences()}catch{return {mode:'week' as const,filter:'all' as const,agendaSpan:14 as const,agendaBusyOnly:false}}})()
export default function App(){
  const [calendar,setCalendar]=useState<CalendarState>(initial.state)
  const [remindersOpen,setRemindersOpen]=useState(false)
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
  const [query,setQuery]=useState('')
  const [editing,setEditing]=useState<CalendarRecord|null>(null)
  const [copyDraft,setCopyDraft]=useState(false)
  const [editInstance,setEditInstance]=useState<{parentId:string;date:LocalDate}|null>(null)
  const [editFuture,setEditFuture]=useState<{parentId:string;date:LocalDate;newId:string}|null>(null)
  const [moveDate,setMoveDate]=useState<LocalDate>(localDate())
  const [adjustment,setAdjustment]=useState<{item:CalendarOccurrence;action:TimedAction;date:LocalDate;minute:number;length:number;fold?:'earlier'|'later'}|null>(null)
  const [adjustAck,setAdjustAck]=useState(false)
  const [importMode,setImportMode]=useState<'update'|'replace'>('update')
  const [finderOpen,setFinderOpen]=useState(false)
  const [finderDuration,setFinderDuration]=useState(60)
  const [finderDays,setFinderDays]=useState(7)
  const [finderWindow,setFinderWindow]=useState<'daytime'|'evening'>('daytime')
  const [finderBlockAllDay,setFinderBlockAllDay]=useState(true)
  const [newEventRange,setNewEventRange]=useState<{start:string;end:string}|null>(null)
  const [newAllDay,setNewAllDay]=useState<{from:LocalDate;through:LocalDate}|null>(null)
  const [allDayAdjustment,setAllDayAdjustment]=useState<{item:CalendarOccurrence;from:LocalDate;through:LocalDate}|null>(null)
  const [editorDate,setEditorDate]=useState<LocalDate|null>(null)
  const [active,setActive]=useState<CalendarOccurrence|null>(null)
  const [pending,setPending]=useState<IcsPreview|null>(null)
  const [sourcePanel,setSourcePanel]=useState(false)
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
  const reminders=useMemo(()=>reminderItems(calendar,reminderNow,reminderActions),[calendar,reminderNow,reminderActions])
  const dueReminderCount=reminders.filter(x=>x.status==='due').length
  const dismissedReminders=useMemo(()=>reminderItems(calendar,reminderNow,{}).filter(x=>reminderActions[x.key]?.kind==='dismiss'),[calendar,reminderNow,reminderActions])
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
  function updateReminderAction(item:ReminderItem,kind:'dismiss'|'snooze',minutes=15){
    try{
      // Re-read right before changing independent reminder preferences, so other-tab changes are retained.
      const latest=readReminderActions()
      const now=new Date().toISOString()
      const action=kind==='dismiss'?actionForReminder(item.key,{kind:'dismiss'},now):
        proposedSnooze(item,minutes as 5|15|60,now)
      const next={...latest,[item.key]:action}
      saveReminderActions(next);setReminderActions(next)
      setReminderNow(new Date().toISOString())
    }catch(error){setNotice('Reminder preference not saved: '+String(error))}
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
        new Notification('THIEPN Calendar · '+item.occurrence.title,{
          body:'Local reminder · '+new Date(item.occurrence.start).toLocaleString(),tag:identity})
      }
      localStorage.setItem(REMINDER_DELIVERED_KEY,JSON.stringify(Array.from(next).slice(-250)))
    }catch(error){setNotice('Foreground notification unavailable: '+String(error))}
  },[notifyEnabled,notifyPermission,reminders,reminderNow,reminderSettings.quietHours])
  useEffect(()=>{
    try{saveViewPreferences({mode,filter,agendaSpan,agendaBusyOnly})}
    catch(error){setNotice('Display preferences could not be saved: '+String(error))}
  },[mode,filter,agendaSpan,agendaBusyOnly])
  function resetDisplayPreferences(){
    try{
      resetViewPreferences()
      setMode('week');setFilter('all');setAgendaSpan(14);setAgendaBusyOnly(false)
      setNotice('Local display preferences reset to defaults')
    }catch(error){setNotice('Display preferences could not be reset: '+String(error))}
  }
  useEffect(()=>{
    const sync=(e:StorageEvent)=>{
      if(e.key===REMINDER_ACTIONS_KEY){try{setReminderActions(readReminderActions())}catch{}}
      if(e.key===REMINDER_SETTINGS_KEY){try{setReminderSettings(loadReminderSettings())}catch{}}
      if(e.key===VIEW_PREFERENCES_KEY){
        try{
          const updated:ViewPreferences=loadViewPreferences()
          setMode(updated.mode);setFilter(updated.filter)
          setAgendaSpan(updated.agendaSpan);setAgendaBusyOnly(updated.agendaBusyOnly)
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
      if(e.key==='Escape'){setEditorDate(null);setActive(null);setPending(null);setSourcePanel(false);setFinderOpen(false);setRemindersOpen(false);setAdjustment(null);setAllDayAdjustment(null)}
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
  },[selected,mode,agendaSpan])
  const visible=useMemo(()=>calendar.records.filter(x=>(filter==='all'||x.source===filter)&&
    (!query.trim()||[x.title,x.description,x.location,x.sourceCalendar??''].some(s=>s.toLowerCase().includes(query.toLowerCase().trim())))),[calendar,filter,query])
  const days=useMemo(()=>{
    const start=mode==='month'?monthGridStart(selected):mode==='week'?monday(selected):selected
    return dateSeries(start,addDays(start,mode==='month'?41:mode==='week'?6:mode==='agenda'?agendaSpan-1:0))
  },[mode,selected,agendaSpan])
  const title=mode==='month'?dateLabel(selected,{month:'long',year:'numeric'}):
    friendlyRange(days[0],days[days.length-1])
  const selectedEvents=dayOccurrences(visible,selected)
  const searchMatches=useMemo(()=>{
    if(!query.trim())return []
    const q=query.toLocaleLowerCase().trim()
    const matches=calendar.records.filter(x=>(filter==='all'||x.source===filter)&&
      [x.title,x.description,x.location,x.sourceCalendar??''].some(v=>v.toLocaleLowerCase().includes(q)))
    return occurrencesBetween(matches,selected,addDays(selected,364)).slice(0,30)
  },[calendar,selected,query,filter])
  const sources=calendar.records.filter(x=>x.source==='ics').reduce<Record<string,number>>((a,x)=>{
    const key=x.sourceCalendar??'Imported';a[key]=(a[key]??0)+1;return a
  },{})
  const personalCount=calendar.records.filter(x=>x.source==='personal').length
  const activeRecord=active?calendar.records.find(x=>x.id===active.recordId):undefined
  const adjustmentReview=useMemo(()=>{
    if(!adjustment)return {proposal:null,error:''}
    try{return {proposal:proposeTimedChange(calendar,adjustment.item,adjustment.action,adjustment.date,
      adjustment.minute,adjustment.length,adjustment.fold),error:''}}
    catch(error){return {proposal:null,error:error instanceof Error?error.message:String(error)}}
  },[calendar,adjustment])
  const freeSlots=useMemo(()=>finderOpen?findFreeSlots(calendar.records,{
    from:selected<localDate()?localDate():selected,days:finderDays,durationMinutes:finderDuration,
    startHour:finderWindow==='daytime'?8:17,endHour:finderWindow==='daytime'?19:23,
    blockAllDay:finderBlockAllDay,maxResults:18
  }):[],[finderOpen,calendar,selected,finderDays,finderDuration,finderWindow,finderBlockAllDay])

  function create(date:LocalDate){setCopyDraft(false);setActive(null);setEditing(null);setEditInstance(null);setEditFuture(null);setNewEventRange(null);setNewAllDay(null);setEditorDate(date)}
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
  function open(item:CalendarOccurrence){setActive(item);setSelected(item.date);setMoveDate(item.startDate)}
  function requestAdjustment(item:CalendarOccurrence,action:TimedAction,date:LocalDate,minute:number,length:number,fold?:'earlier'|'later'){
    if(item.source!=='personal'||item.allDay)return
    setActive(null);setAdjustAck(false)
    setAdjustment({item,action,date,minute,length,fold})
  }
  function confirmAdjustment(){
    if(!adjustmentReview.proposal||!adjustment)return
    if(adjustmentReview.proposal.conflicts.length&&!adjustAck)return
    try{
      const next=applyTimedChange(calendar,adjustmentReview.proposal,()=>crypto.randomUUID())
      if(commit(next,'Timed event change saved locally')){
        setAdjustment(null);setAdjustAck(false);setSelected(adjustment.date)
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
    setActive(next);setSelected(next.date);setMoveDate(next.startDate)
  }
  function save(record:CalendarRecord){
    try{
      const next=editFuture?saveWholeEvent(splitSeriesAt(calendar,editFuture.parentId,editFuture.date,editFuture.newId),record):
        editInstance?replaceOccurrence(calendar,editInstance.parentId,editInstance.date,record):
        calendar.records.some(r=>r.id===record.id)?saveWholeEvent(calendar,record):
        {schemaVersion:1 as const,records:[...calendar.records,record]}
      if(commit(next,'Event saved locally')){
        setEditorDate(null);setEditing(null);setCopyDraft(false);setEditInstance(null);setEditFuture(null);setNewEventRange(null);setNewAllDay(null)
      }
    }catch(error){setNotice('Not saved: '+String(error))}
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
  function step(direction:number){
    setSelected(s=>mode==='month'?addMonths(s,direction):addDays(s,direction*(mode==='week'?7:mode==='agenda'?agendaSpan:1)))
  }
  async function readIcs(e:ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0];e.target.value='';if(!f)return
    try{setPending(previewIcs(await f.text()));setImportMode('update');setNotice('Review the import before applying')}
    catch(error){setNotice('ICS import failed: '+String(error))}
  }
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
      setRestoreCandidate(null);setActive(null);setEditorDate(null);setPending(null)
      setQuery('');setFilter('all');setSelected(localDate())
    }
  }
  const importReview=useMemo(()=>{
    if(!pending)return null
    try{return {result:mergeIcs(calendar,pending,importMode),error:''}}
    catch(error){return {result:null,error:error instanceof Error?error.message:String(error)}}
  },[calendar,pending,importMode])
  function applyImport(){
    if(!pending)return
    const count=calendar.records.filter(x=>x.source==='ics'&&x.sourceCalendar===pending.name).length
    if(importMode==='replace'&&count>0&&!window.confirm('Replace all '+count+' imported copies from '+pending.name+' with this file? Personal events will be preserved.'))return
    const result=mergeIcs(calendar,pending,importMode)
    if(commit(result.state,`Imported ${result.added}; updated ${result.updated}; unchanged ${result.duplicates}; removed from prior snapshot ${result.removed}`))setPending(null)
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
          <div className="search-field"><Search size={16}/><input ref={searchInput} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search events" aria-label="Search calendar events"/>{query&&<button aria-label="Clear search" onClick={()=>setQuery('')}><X size={14}/></button>}</div>
          <button className="secondary compact reminder-launch" aria-label={'Local reminders'+(dueReminderCount?' ('+dueReminderCount+' due)':'')} onClick={()=>setRemindersOpen(true)}>
            <Bell size={15}/><span className="desktop-text">Reminders</span>{dueReminderCount>0&&<span className="reminder-count">{dueReminderCount}</span>}</button>
          <button className="secondary compact" onClick={()=>setFinderOpen(true)}><Clock3 size={15}/><span className="desktop-text">Find time</span></button>
          <button className="secondary compact" onClick={()=>importInput.current?.click()}><Upload size={15}/><span className="desktop-text">Import ICS</span></button>
          <button className="icon-button" title="Export personal events as finite ICS snapshot" aria-label="Export personal events" onClick={()=>{
            try{download('thiepn-calendar-snapshot.ics',exportIcs(calendar,addDays(selected,-30),addDays(selected,365)),'text/calendar');setNotice('Exported a finite 395-day personal event snapshot, not continuous sync')}
            catch(error){setNotice('Export failed: '+String(error))}}}><Download size={17}/></button>
          <button className="primary top-create" onClick={()=>create(selected)}><Plus size={16}/> <span>New event</span></button>
        </div>
      </header>
      <main className="main-panel">
        <div className="date-toolbar">
          <div className="date-navigation"><button className="secondary compact" onClick={()=>setSelected(localDate())}>Today</button>
            <button className="icon-button" aria-label="Previous period" onClick={()=>step(-1)}><ChevronLeft size={19}/></button>
            <button className="icon-button" aria-label="Next period" onClick={()=>step(1)}><ChevronRight size={19}/></button>
            <h2>{title}</h2>
            <label className="date-jump">Jump <input ref={jumpInput} aria-label="Jump to date" type="date" value={selected} onChange={e=>{if(e.target.value)setSelected(e.target.value)}}/></label></div>
          <div className="view-switch">{(['month','week','day','agenda'] as const).map(m=><button key={m} onClick={()=>setMode(m)} className={mode===m?'active':''}>{m==='agenda'?'List':m[0].toUpperCase()+m.slice(1)}</button>)}</div>
          <details className="calendar-shortcuts"><summary>Keyboard</summary><p>n — new event · t — today · g — jump to date · / — search · j/k — next/previous period · 1–4 — change view. When editing timed blocks, Alt+arrows move and Alt+Shift+vertical arrows resize; for all-day blocks use Alt+Left/Right and add Shift to resize.</p></details>
        </div>
        {notice&&<div className={'notice '+(/failed|rejected|not saved|could not/i.test(notice)?'notice-error':'')} role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss message"><X size={14}/></button></div>}
        {unreadable&&<div className="recovery-danger" role="alert">The saved calendar could not be read. No replacement has been written. <button className="secondary compact" onClick={downloadUnreadable}>Download original raw data</button> before attempting recovery.</div>}
        {query.trim()&&<section className="search-results-panel" aria-label="Calendar search results">
          <header><strong>Search across the next 365 days</strong><span>{searchMatches.length} match{searchMatches.length===1?'':'es'} shown (maximum 30)</span></header>
          <div className="search-results-items">{searchMatches.map(item=><button key={item.key} type="button" onClick={()=>{setMode('day');open(item)}}>
            <span className="search-result-date">{dateLabel(item.startDate,{month:'short',day:'numeric',year:'numeric'})}</span>
            <span className="search-result-title">{item.title}</span>
            <small>{item.source==='ics'?'Imported · read only':'Personal'} · {item.allDay?'All day':new Date(item.start).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</small>
          </button>)}
          {!searchMatches.length&&<p className="empty-note">No matching saved events during this 365-day window. Change the selected date to search another period.</p>}</div>
        </section>}
        {mode==='agenda'&&<div className="agenda-options">
          <label>Agenda range<select aria-label="Agenda range" value={agendaSpan} onChange={e=>setAgendaSpan(Number(e.target.value) as 14|30)}>
            <option value={14}>14 days</option><option value={30}>30 days</option>
          </select></label>
          <label><input type="checkbox" checked={agendaBusyOnly} onChange={e=>setAgendaBusyOnly(e.target.checked)}/> Only days with commitments</label>
        </div>}
        <div className="content-grid">
          <div className="calendar-surface"><CalendarViews mode={mode} days={days} selected={selected} records={visible} onSelect={setSelected} onOpen={open} onCreate={create} onCreateAt={(date,start,end)=>startSlot({date,start,end})}
              onAdjust={requestAdjustment} onAllDaySlot={startAllDay} onAllDayAdjust={requestAllDayAdjustment}
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
    {editorDate!==null&&<EventEditor key={(editing?.id??'new')+editorDate+(newEventRange?.start??'')+(newAllDay?.through??'')} date={editorDate} event={editing??undefined} initialRange={newEventRange??undefined} initialAllDay={newAllDay??undefined} records={calendar.records} isCopy={copyDraft} defaultReminderMinutes={reminderSettings.defaultLead}
      ignoreOccurrence={editInstance?{id:editInstance.parentId,date:editInstance.date}:undefined}
      ignoreParentFrom={editFuture?{id:editFuture.parentId,date:editFuture.date}:undefined}
      scope={editInstance?'instance':editFuture?'future':undefined} onSave={save} onClose={()=>{setEditorDate(null);setEditing(null);setCopyDraft(false);setEditInstance(null);setEditFuture(null);setNewEventRange(null);setNewAllDay(null)}}/>}
    {restoreCandidate&&<RestoreDialog current={calendar} candidate={restoreCandidate.state} origin={restoreCandidate.origin} unreadableCurrent={unreadable}
      onClose={()=>setRestoreCandidate(null)} onConfirm={confirmRestore}/>}
    {remindersOpen&&<ReminderCenter items={reminders} dismissed={dismissedReminders}
      snoozedKeys={new Set(Object.entries(reminderActions).filter(([,action])=>action.kind==='snooze').map(([key])=>key))}
      onCancelSnooze={undoReminderDismissal} settings={reminderSettings} onSettingsChange={changeReminderSettings} onUndoDismiss={undoReminderDismissal} onClose={()=>setRemindersOpen(false)}
      onOpen={item=>{setRemindersOpen(false);setMode('day');open(item.occurrence)}}
      onDismiss={item=>updateReminderAction(item,'dismiss')}
      onSnooze={(item,minutes)=>updateReminderAction(item,'snooze',minutes)}
      onEnableNotifications={enableForegroundNotifications} onDisableNotifications={disableForegroundNotifications}
      foregroundEnabled={notifyEnabled&&notifyPermission==='granted'} permission={notifyPermission}/>}
    {finderOpen&&<div className="modal-backdrop" onMouseDown={ev=>{if(ev.target===ev.currentTarget)setFinderOpen(false)}}>
      <section className="finder-dialog dialog-surface" role="dialog" aria-modal="true" aria-label="Find an available time">
        <header className="editor-head"><div className="heading-inline"><Clock3 size={20}/><h2>Find time</h2></div><button className="icon-button" aria-label="Close time finder" onClick={()=>setFinderOpen(false)}><X size={19}/></button></header>
        <p className="fine-print">Find a free time from {dateLabel(selected<localDate()?localDate():selected)} onward. All saved calendars are checked, including hidden imported events. A slot is only booked after you save a new personal event.</p>
        <div className="finder-options">
          <label>Duration<select value={finderDuration} onChange={ev=>setFinderDuration(Number(ev.target.value))}><option value={30}>30 minutes</option><option value={60}>60 minutes</option><option value={90}>90 minutes</option><option value={120}>120 minutes</option></select></label>
          <label>Look ahead<select value={finderDays} onChange={ev=>setFinderDays(Number(ev.target.value))}><option value={7}>7 days</option><option value={14}>14 days</option></select></label>
          <label>Hours<select value={finderWindow} onChange={ev=>setFinderWindow(ev.target.value as 'daytime'|'evening')}><option value="daytime">08:00–19:00</option><option value="evening">17:00–23:00</option></select></label>
        </div>
        <label className="finder-checkbox"><input type="checkbox" checked={finderBlockAllDay} onChange={ev=>setFinderBlockAllDay(ev.target.checked)}/> Treat all-day entries as unavailable</label>
        <h3>Available start times <small>({freeSlots.length} shown)</small></h3>
        <div className="finder-results">{freeSlots.map(slot=><button key={slot.start} type="button" className="finder-slot" onClick={()=>startSlot(slot)}>
          <span><strong>{dateLabel(slot.date,{weekday:'short',month:'short',day:'numeric'})}</strong><small>{new Date(slot.start).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})} – {new Date(slot.end).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</small></span>
          <span className="finder-plan">Plan event <ChevronRight size={14}/></span>
        </button>)}
        {!freeSlots.length&&<p className="empty-note">No available slots in this window. Try a shorter duration, evening hours or more days.</p>}</div>
        <p className="fine-print">Suggestions are calculated locally, can become outdated and are rechecked against saved calendar changes when you save. This is not a multi-user booking system.</p>
      </section></div>}
    {allDayAdjustment&&<AllDayDialog key={allDayAdjustment.item.key+allDayAdjustment.from+allDayAdjustment.through}
      item={allDayAdjustment.item} initial={{from:allDayAdjustment.from,through:allDayAdjustment.through}}
      state={calendar} onApply={confirmAllDay} onClose={()=>setAllDayAdjustment(null)}/>}
    {adjustment&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setAdjustment(null)}}>
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
            <p>Including imported and hidden sources; no event is silently moved or deleted.</p>
            <ul>{adjustmentReview.proposal.conflicts.slice(0,8).map(item=><li key={item.key}>{item.title} ({item.source==='ics'?'imported, read-only':'personal'})</li>)}</ul>
            <label><input type="checkbox" checked={adjustAck} onChange={event=>setAdjustAck(event.target.checked)}/> Save despite these overlaps</label>
          </div>}
        </>}
        <footer className="editor-actions"><button className="secondary" type="button" onClick={()=>setAdjustment(null)}>Cancel</button>
          <button className="primary" type="button" onClick={confirmAdjustment}
            disabled={!adjustmentReview.proposal||(adjustmentReview.proposal.conflicts.length>0&&!adjustAck)}>Confirm change</button></footer>
      </section>
    </div>}
    {active&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setActive(null)}}>
      <section className="details dialog-surface" role="dialog" aria-modal="true" aria-label="Event details">
        <header className="editor-head"><span className="eyebrow">{active.source==='ics'?'IMPORTED SNAPSHOT — READ ONLY':'PERSONAL EVENT'}</span><button className="icon-button" aria-label="Close event" onClick={()=>setActive(null)}><X size={19}/></button></header>
        <h2>{active.title}</h2><p className="details-dates">{active.allDay?'All day · '+friendlyRange(active.startDate,addDays(active.endDateExclusive,-1)):new Date(active.start).toLocaleString()+' – '+new Date(active.end).toLocaleString()}</p>
        {active.location&&<p><strong>Location:</strong> {active.location}</p>}{active.description&&<p className="description">{active.description}</p>}
        {active.source==='ics'&&<div className="readonly-note"><AlertTriangle size={16}/> Imported from {active.sourceCalendar}. Editing the original requires the source calendar. This is only a local copy.</div>}
        {activeRecord?.recurrenceParentId&&<div className="readonly-note">Edited occurrence from a recurring series. Original series date: {activeRecord.recurrenceDate}.</div>}
        {active.source==='personal'&&<div className="move-control"><label>Move to date<input type="date" value={moveDate} onChange={ev=>setMoveDate(ev.target.value)}/></label>
          <button className="secondary" type="button" disabled={!moveDate||moveDate===active.startDate} onClick={()=>move(active)}>Move event</button>
          <button className="secondary" type="button" onClick={()=>duplicateToDate(active)}>Duplicate to selected date</button>
          <p className="fine-print">Moving one repeating occurrence keeps the remaining series unchanged. All changes remain on this device.</p>
        </div>}
        <footer className="editor-actions">
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
          <button className="danger" onClick={()=>remove(active.recordId)}><Trash2 size={15}/> {active.source==='ics'?'Remove copy':activeRecord?.repeat?'Delete series':'Delete'}</button>
        </footer>
      </section>
    </div>}
    {pending&&<div className="modal-backdrop"><section className="import-dialog dialog-surface" role="dialog" aria-modal="true" aria-label="ICS import review">
      <header className="editor-head"><h2>Review ICS snapshot</h2><button className="icon-button" aria-label="Close import" onClick={()=>setPending(null)}><X size={19}/></button></header>
      <p><strong>{pending.name}</strong> · {pending.records.length} supported events</p>
      {pending.skippedEvents>0&&<p className="incomplete-ics-notice" role="status">
        {pending.skippedEvents} source event{pending.skippedEvents===1?'':'s'} could not be read. Update matching UIDs retains earlier read-only copies; full replacement is blocked to prevent deletion of omitted records.
      </p>
      <div className="import-preview">{pending.records.slice(0,7).map(r=><div key={r.id}><span>{r.title}</span><small>{r.startDate??new Date(r.start).toLocaleString()}</small></div>)}{pending.records.length>7&&<p>+{pending.records.length-7} additional entries</p>}</div>
      {pending.warnings.length>0&&<div className="import-warnings"><b>{pending.warnings.length} skipped or warned events</b>{pending.warnings.slice(0,12).map((w,i)=><p key={i}>{w}</p>)}</div>}
      <fieldset className="import-options"><legend>How to handle this calendar</legend>
        <label><input type="radio" checked={importMode==='update'} onChange={()=>setImportMode('update')}/> Add new entries and refresh matching event UIDs; keep others</label>
        <label><input type="radio" checked={importMode==='replace'} onChange={()=>setImportMode('replace')}/> Replace the earlier imported snapshot named “{pending.name}” entirely</label>
      </fieldset>
      {importReview?.error&&<p role="alert" className="error">Import cannot be applied: {importReview.error}</p>}
      {importReview?.result&&<p className="import-delta" aria-label="Import change preview">
        Preview: <strong>{importReview.result.added} new</strong> · {importReview.result.updated} updated · {importReview.result.duplicates} unchanged · {importReview.result.removed} removed from this local snapshot.
      </p>}
      <p className="fine-print">Read-only local snapshot; not live sync. Unsupported RRULE masters are skipped with warnings. Neither method modifies Google, Folio, KLIPS or personal events.</p>
      <footer className="editor-actions"><button className="secondary" onClick={()=>setPending(null)}>Cancel</button><button className="primary" onClick={applyImport} disabled={!importReview?.result}>Apply reviewed changes</button></footer>
    </section></div>}
    {sourcePanel&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSourcePanel(false)}}>
      <section className="sources-dialog dialog-surface" role="dialog" aria-modal="true" aria-label="Calendar data management">
        <header className="editor-head"><h2>Sources & data</h2><button className="icon-button" aria-label="Close sources" onClick={()=>setSourcePanel(false)}><X size={19}/></button></header>
        <div className="source-card"><strong>Personal <span>{personalCount} records</span></strong><p>Editable device-local events. This is not Folio's schedule.</p></div>
        {Object.entries(sources).map(([name,count])=><div key={name} className="source-card"><strong>{name}<span>{count} entries</span></strong><p>ICS snapshot · no ongoing provider connection</p><button className="danger small" onClick={()=>removeSource(name)}>Remove local copy</button></div>)}
        {!Object.keys(sources).length&&<p className="empty-note">No imported ICS snapshots.</p>}
        <hr/><h3>Backups & interop</h3><div className="button-stack">
          <button className="secondary" onClick={()=>importInput.current?.click()}><Upload size={16}/> Import ICS snapshot</button>
          <button className="secondary" onClick={()=>download('thiepn-calendar-backup.json',exportBackup(calendar),'application/json')}><Download size={16}/> Save full JSON backup</button>
          <button className="secondary" onClick={()=>restoreInput.current?.click()}><Upload size={16}/> Review JSON backup restoration</button>
          <button className="secondary" disabled={!recovery} onClick={proposeRecovery}><RotateCcw size={16}/> Review previous-version checkpoint</button>
          {recovery&&<p className="fine-print">Checkpoint: {new Date(recovery.savedAt).toLocaleString()} — {recovery.label}. Stores one prior complete version on this device.</p>}
          {unreadable&&<button className="danger" onClick={downloadUnreadable}><Download size={16}/> Download unreadable original bytes</button>}
          {rescuedUnparsedCalendar()!==null&&<button className="secondary" onClick={()=>{
            const raw=rescuedUnparsedCalendar()
            if(raw!==null)download('thiepn-calendar-unreadable-rescue.txt',raw,'text/plain')
          }}><Download size={16}/> Download retained raw rescue snapshot</button>}
        </div>
        <section className="display-preferences" aria-label="Calendar display preferences">
          <h3>Saved display</h3>
          <p className="fine-print">Current view ({mode}), source filter ({filter}) and agenda options are saved on this device and reused when Calendar reopens. The selected date resets to today.</p>
          <button type="button" className="secondary small" onClick={resetDisplayPreferences}><RotateCcw size={14}/> Reset display preferences</button>
        </section>
        <OfflineReadiness/>
        <div className="readonly-note"><AlertTriangle size={16}/> No Account, Google or Folio sync is connected. Keep a backup before clearing browser data.</div>
        <a target="_blank" rel="noopener noreferrer" href="https://github.com/thiepn/folio" className="external-inline">Open source-owned Folio <ExternalLink size={14}/></a>
      </section></div>}
  </div>
}
