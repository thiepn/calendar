import {useEffect,useMemo,useRef,useState,type FormEvent,type KeyboardEvent as ReactKeyboardEvent} from 'react'
import {X,CalendarPlus,AlertTriangle} from 'lucide-react'
import type {CalendarRecord,Frequency,LocalDate,RepeatRule} from '../types'
import {addDays,day,localDateTime,dateLabel,localInstantOptions,offsetLabel} from '../core/dates'
import {draftTimedRange,reviewDraft} from '../core/draft'
import {mobileTimedChange,mobileAllDayShift,type MobileTimedAction} from '../core/mobile-editor'
import {changedEditorFields,type EventEditorFields} from '../core/editor-changes'
import {writeEventDraft,clearEventDraft,type EventDraftOrigin,type SavedEventDraft} from '../core/event-draft'
const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
type Props={date:LocalDate;event?:CalendarRecord;initialRange?:{start:string;end:string};initialAllDay?:{from:LocalDate;through:LocalDate};records:CalendarRecord[];ignoreOccurrence?:{id:string;date:LocalDate};ignoreParentFrom?:{id:string;date:LocalDate};scope?:'instance'|'future';isCopy?:boolean;defaultReminderMinutes?:number;draftOrigin:EventDraftOrigin;recoveredDraft?:SavedEventDraft;onSave:(record:CalendarRecord)=>boolean;onClose:()=>void}
export function EventEditor({date,event,initialRange,initialAllDay,records,ignoreOccurrence,ignoreParentFrom,scope,isCopy=false,defaultReminderMinutes=-1,draftOrigin,recoveredDraft,onSave,onClose}:Props){
  const [title,setTitle]=useState(recoveredDraft?.fields.title??event?.title??'')
  const [description,setDescription]=useState(recoveredDraft?.fields.description??event?.description??'')
  const [location,setLocation]=useState(recoveredDraft?.fields.location??event?.location??'')
  const [reminder,setReminder]=useState<number>(recoveredDraft?.fields.reminder??event?.reminderMinutes??(event?-1:defaultReminderMinutes))
  const [allDay,setAllDay]=useState(recoveredDraft?.fields.allDay??event?.allDay??Boolean(initialAllDay))
  const [start,setStart]=useState(recoveredDraft?.fields.start??(event ? event.allDay?event.startDate!:localDateTime(event.start) : initialAllDay?initialAllDay.from:initialRange?localDateTime(initialRange.start):date+'T09:00'))
  const [end,setEnd]=useState(recoveredDraft?.fields.end??(event ? event.allDay?addDays(event.endDateExclusive!,-1):localDateTime(event.end) : initialAllDay?initialAllDay.through:initialRange?localDateTime(initialRange.end):date+'T10:00'))
  const [frequency,setFrequency]=useState<'none'|Frequency>(recoveredDraft?.fields.frequency??event?.repeat?.frequency??'none')
  const [interval,setInterval]=useState(recoveredDraft?.fields.interval??event?.repeat?.interval??1)
  const [until,setUntil]=useState(recoveredDraft?.fields.until??event?.repeat?.until??'')
  const [weekdaysSet,setWeekdaysSet]=useState<number[]>(recoveredDraft?.fields.weekdays??event?.repeat?.weekdays??[])
  const [error,setError]=useState('')
  function inferredFold(iso?:string):''|'earlier'|'later' {
    if(!iso)return ''
    try{
      const opts=localInstantOptions(localDateTime(iso))
      return opts.length===2?(opts[0]===iso?'earlier':'later'):''
    }catch{return ''}
  }
  const [startFold,setStartFold]=useState<''|'earlier'|'later'>(()=>recoveredDraft?.fields.startFold??inferredFold(event&&!event.allDay?event.start:initialRange?.start))
  const [endFold,setEndFold]=useState<''|'earlier'|'later'>(()=>recoveredDraft?.fields.endFold??inferredFold(event&&!event.allDay?event.end:initialRange?.end))
  const [reviewDays,setReviewDays]=useState<90|180|365>(90)
  const [discardReview,setDiscardReview]=useState(false)
  const keepEditingButton=useRef<HTMLButtonElement>(null)
  function ambiguousOptions(value:string):string[]{
    try{
      const options=localInstantOptions(value)
      return options.length===2?options:[]
    }catch{return []}
  }
  const firstFoldOptions=allDay?[]:ambiguousOptions(start)
  const lastFoldOptions=allDay?[]:ambiguousOptions(end)
  // Capture once per editor mount; no persistence or shadow event authority.
  const fields:EventEditorFields={title,description,location,reminder,allDay,start,end,
    startFold,endFold,frequency,interval,until,weekdays:weekdaysSet}
  const original=useRef<EventEditorFields>(recoveredDraft?.initial??fields)
  const draftOriginRef=useRef(draftOrigin)
  const draftId=useRef(recoveredDraft?.id??crypto.randomUUID())
  const draftRevision=useRef<string|null>(recoveredDraft?.revision??null)
  const [draftProblem,setDraftProblem]=useState('')
  const changed=changedEditorFields(original.current,fields)
  const dirty=changed.length>0
  useEffect(()=>{
    try{
      if(dirty){
        const saved=writeEventDraft({id:draftId.current,origin:draftOriginRef.current,initial:original.current,fields},draftRevision.current)
        draftRevision.current=saved.revision
      }else if(draftRevision.current){
        clearEventDraft(draftId.current,draftRevision.current)
        draftRevision.current=null
      }
      setDraftProblem('')
    }catch(error){setDraftProblem('Draft recovery unavailable: '+String(error))}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[title,description,location,reminder,allDay,start,end,startFold,endFold,frequency,interval,until,weekdaysSet,dirty])
  function discardSavedDraft(){
    try{clearEventDraft(draftId.current,draftRevision.current);draftRevision.current=null}
    catch(error){setDraftProblem('Draft changed in another tab: '+String(error));return false}
    return true
  }
  function closeAndDiscard(){if(discardSavedDraft())onClose()}
  useEffect(()=>{
    if(!dirty)return
    const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',guard)
    return ()=>window.removeEventListener('beforeunload',guard)
  },[dirty])
  useEffect(()=>{if(discardReview)keepEditingButton.current?.focus()},[discardReview])
  function requestClose(){
    if(dirty)setDiscardReview(true)
    else closeAndDiscard()
  }
  function resetEdits(){
    const old=original.current
    setTitle(old.title);setDescription(old.description);setLocation(old.location)
    setReminder(old.reminder);setAllDay(old.allDay)
    setStart(old.start);setEnd(old.end);setStartFold(old.startFold);setEndFold(old.endFold)
    setFrequency(old.frequency);setInterval(old.interval);setUntil(old.until)
    setWeekdaysSet([...old.weekdays]);setAcceptedSignature('');setError('')
    setDiscardReview(false)
  }
  function escapeEditor(event:ReactKeyboardEvent<HTMLDivElement>){
    if(event.key!=='Escape')return
    event.preventDefault();event.stopPropagation()
    if(discardReview)setDiscardReview(false)
    else requestClose()
  }
  const [acceptedSignature,setAcceptedSignature]=useState('')
  const signature=[title,start,end,startFold,endFold,reviewDays,allDay,frequency,interval,until,reminder,weekdaysSet.join(',')].join('|')
  const accepted=acceptedSignature===signature
  function construct(id:string):CalendarRecord {
    const first=start.slice(0,10),last=end.slice(0,10)
    day(first);day(last)
    if(until&&frequency!=='none'&&until<first)throw new Error('Repeat end cannot precede the first occurrence')
    let startIso:string,endIso:string
    const endExclusive=addDays(last,1)
    if(allDay){
      if(last<first)throw new Error('All-day last date must follow the first date')
      startIso=new Date(first+'T00:00:00').toISOString()
      endIso=new Date(endExclusive+'T00:00:00').toISOString()
    }else{
      const range=draftTimedRange(start,end,startFold||undefined,endFold||undefined)
      startIso=range.start;endIso=range.end
    }
    const repeat:RepeatRule|undefined=scope==='instance'||frequency==='none'?undefined:{
      frequency,interval,...(until?{until}:{}),
      ...(frequency==='weekly'&&weekdaysSet.length?{weekdays:weekdaysSet}:{})
    }
    if(repeat&&(!Number.isInteger(repeat.interval)||repeat.interval<1||repeat.interval>30))
      throw new Error('Repeat interval must be an integer between 1 and 30')
    return {id,title:title.trim()||'Draft event',description:description.trim(),location:location.trim(),
      source:'personal',allDay,start:startIso,end:endIso,
      ...(allDay?{startDate:first,endDateExclusive:endExclusive}:{}),
      ...(repeat?{repeat}:{}),...(reminder>=0?{reminderMinutes:reminder}:{}),updatedAt:new Date().toISOString(),
      ...(event?.excludedDates?{excludedDates:event.excludedDates}:{})}
  }
  const inspection=useMemo(()=>{
    try{return {review:reviewDraft(records,construct(event?.id??'__draft_preview__'),{
      ignoreRecordId:scope==='instance'||scope==='future'?undefined:event?.id,
      ignoreOccurrence,ignoreParentFrom,horizonDays:reviewDays
    }),error:''}}
    catch(e){return {review:null,error:e instanceof Error?e.message:String(e)}}
    // Review depends on all form inputs, original record and canonical calendar records.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[title,description,location,reminder,allDay,start,end,startFold,endFold,reviewDays,frequency,interval,until,weekdaysSet,event,scope,records,ignoreOccurrence,ignoreParentFrom])
  const needsAck=Boolean(inspection.review&&(inspection.review.collisionCount||inspection.review.affectedClockCount))
  function toggleAllDay(value:boolean){
    if(value===allDay)return
    setStart(v=>value?v.slice(0,10):v.slice(0,10)+'T09:00')
    setEnd(v=>value?v.slice(0,10):v.slice(0,10)+'T10:00')
    setAllDay(value)
  }
  function quickSchedule(action:MobileTimedAction|{kind:'day';days:-1|1}){
    setError('')
    try{
      if(allDay){
        if(action.kind!=='day')throw new Error('Select a timed event for duration controls')
        const shifted=mobileAllDayShift(start,end,action.days)
        setStart(shifted.start);setEnd(shifted.end)
      }else{
        const next=mobileTimedChange({start,end,startFold,endFold},action)
        setStart(next.start);setEnd(next.end)
        setStartFold(next.startFold);setEndFold(next.endFold)
      }
      setAcceptedSignature('')
    }catch(err){setError(err instanceof Error?err.message:String(err))}
  }
  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault()
    try{
      if(!title.trim())throw new Error('Enter an event title')
      if(inspection.error||!inspection.review)throw new Error(inspection.error||'Check the proposed dates')
      if(needsAck&&!accepted)throw new Error('Acknowledge overlapping events or recurring clock warnings before saving')
      if(onSave({...construct(event?.id??crypto.randomUUID()),title:title.trim()})){
        try{clearEventDraft(draftId.current,draftRevision.current);draftRevision.current=null}
        catch(error){setDraftProblem('Event saved; draft changed in another tab: '+String(error))}
      }
    }catch(err){setError(err instanceof Error?err.message:String(err))}
  }
  return <div className="modal-backdrop" onKeyDown={escapeEditor} onMouseDown={e=>{if(e.target===e.currentTarget)requestClose()}}>
    <section className="editor dialog-surface" role="dialog" aria-modal="true" aria-label={isCopy?'Duplicate event':scope==='instance'?'Edit one occurrence':scope==='future'?'Edit this and future':event?'Edit event':'New event'}>
      <header className="editor-head"><div className="heading-inline"><CalendarPlus size={20}/><h2>{isCopy?'Duplicate event':scope==='instance'?'Edit one occurrence':scope==='future'?'Edit this and future':event?'Edit event':'New event'}</h2></div>
        <button className="icon-button" onClick={requestClose} aria-label="Close editor"><X size={19}/></button></header>
      <form onSubmit={submit} className="editor-form">
        <label>Event name<input autoFocus={typeof window!=='undefined'&&!window.matchMedia('(max-width:740px)').matches} required maxLength={240} value={title} onChange={e=>setTitle(e.target.value)} placeholder="What are you planning?"/></label>
        <label className="checkline"><input type="checkbox" checked={allDay} onChange={e=>toggleAllDay(e.target.checked)}/> All-day event</label>
        <div className="editor-grid">
          <label>Starts<input required type={allDay?'date':'datetime-local'} value={start} onChange={e=>{setStart(e.target.value);setStartFold('')}}/></label>
          <label>{allDay?'Last day (inclusive)':'Ends'}<input required type={allDay?'date':'datetime-local'} value={end} onChange={e=>{setEnd(e.target.value);setEndFold('')}}/></label>
        </div>
        <div className="mobile-editor-shortcuts" aria-label="Mobile quick scheduling">
          <div className="mobile-editor-shortcuts-head">
            <strong>Quick schedule</strong>
            <small>{allDay?'Shift the whole all-day range':'Change this draft before reviewing and saving'}</small>
          </div>
          <div className="mobile-editor-shortcut-row" aria-label="Change event day">
            <button type="button" className="secondary compact" onClick={()=>quickSchedule({kind:'day',days:-1})}>Previous day</button>
            <button type="button" className="secondary compact" onClick={()=>quickSchedule({kind:'day',days:1})}>Next day</button>
          </div>
          {!allDay&&<>
            <div className="mobile-editor-shortcut-row" aria-label="Shift event time">
              <button type="button" className="secondary compact" onClick={()=>quickSchedule({kind:'shift',minutes:-30})}>30 min earlier</button>
              <button type="button" className="secondary compact" onClick={()=>quickSchedule({kind:'shift',minutes:30})}>30 min later</button>
            </div>
            <fieldset className="mobile-duration-presets" aria-label="Set event duration">
              <legend>Duration from start</legend>
              {[30,60,90,120].map(n=><button key={n} type="button" className="secondary compact"
                onClick={()=>quickSchedule({kind:'duration',minutes:n as 30|60|90|120})}>
                {n<60?n+' min':n/60+' h'}
              </button>)}
            </fieldset>
          </>}
        </div>
        {firstFoldOptions.length===2&&<label className="fold-choice">Repeated start hour
          <select aria-label="Repeated start hour" value={startFold} onChange={e=>setStartFold(e.target.value as ''|'earlier'|'later')}>
            <option value="">Choose the first or second occurrence</option>
            <option value="earlier">First {start.slice(11)} ({offsetLabel(firstFoldOptions[0])})</option>
            <option value="later">Second {start.slice(11)} ({offsetLabel(firstFoldOptions[1])})</option>
          </select></label>}
        {lastFoldOptions.length===2&&<label className="fold-choice">Repeated end hour
          <select aria-label="Repeated end hour" value={endFold} onChange={e=>setEndFold(e.target.value as ''|'earlier'|'later')}>
            <option value="">Choose the first or second occurrence</option>
            <option value="earlier">First {end.slice(11)} ({offsetLabel(lastFoldOptions[0])})</option>
            <option value="later">Second {end.slice(11)} ({offsetLabel(lastFoldOptions[1])})</option>
          </select></label>}
        {scope==='instance'&&<p className="fine-print">Only this instance changes. The original date will be skipped in its series; other occurrences keep their schedule.</p>}
        {scope==='future'&&<p className="fine-print">Saving creates a future-only series while preserving earlier occurrences. Cancel leaves the calendar unchanged.</p>}
        {scope!=='instance'&&<div className="editor-grid">
          <label>Repeats<select value={frequency} onChange={e=>setFrequency(e.target.value as 'none'|Frequency)}>
            <option value="none">Does not repeat</option><option value="daily">Daily</option>
            <option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
          {frequency!=='none'&&<label>Every (interval)<input type="number" min={1} max={30} required value={interval} onChange={e=>setInterval(Number(e.target.value))}/></label>}
        </div>}
        {scope!=='instance'&&frequency==='weekly'&&<fieldset className="weekday-fields"><legend>On weekdays (none = start weekday)</legend>
          {weekdays.map((w,i)=><label key={w}><input type="checkbox" checked={weekdaysSet.includes(i)} onChange={e=>setWeekdaysSet(old=>e.target.checked?[...old,i]:old.filter(x=>x!==i))}/>{w}</label>)}
        </fieldset>}
        {scope!=='instance'&&frequency!=='none'&&<label>Repeat until (optional)<input type="date" min={start.slice(0,10)} value={until} onChange={e=>setUntil(e.target.value)}/></label>}
        <label className="reminder-setting">Local reminder<select aria-label="Local reminder" value={reminder}
          onChange={e=>setReminder(Number(e.target.value))}>
          <option value={-1}>None</option><option value={0}>At event start</option>
          <option value={5}>5 minutes before</option><option value={10}>10 minutes before</option>
          <option value={15}>15 minutes before</option><option value={30}>30 minutes before</option>
          <option value={60}>1 hour before</option><option value={120}>2 hours before</option>
          <option value={1440}>1 day before</option><option value={10080}>1 week before</option>
        </select></label>
        <p className="fine-print">Local reminders appear in the Reminders center. Optional browser notifications require explicit permission and only run while Calendar is open. Imported ICS calendars remain read-only.</p>
        <label>Location<input value={location} maxLength={500} onChange={e=>setLocation(e.target.value)} placeholder="Optional"/></label>
        <label>Notes<textarea rows={3} maxLength={4000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Optional details"/></label>
        <div className="draft-review" aria-label="Calendar conflict review" aria-live="polite">
          <strong>Calendar review — all saved calendars</strong>
          {frequency!=='none'&&scope!=='instance'&&<label className="review-horizon">Conflict planning horizon
            <select aria-label="Conflict planning horizon" value={reviewDays} onChange={e=>setReviewDays(Number(e.target.value) as 90|180|365)}>
              <option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>365 days</option>
            </select>
          </label>}
          {inspection.error?<p className="error" role="alert">{inspection.error}</p>:inspection.review&&<>
            <p>{inspection.review.collisionCount} overlapping commitment(s) through {dateLabel(inspection.review.checkedThrough,{year:'numeric',month:'short',day:'numeric'})}{inspection.review.repeating?' — first '+reviewDays+' days only':' — this event'}.</p>
            {inspection.review.collisions.length>0&&<ul className="draft-collisions">
              {inspection.review.collisions.map((hit,i)=><li key={i}><AlertTriangle size={13}/><span>{dateLabel(hit.candidate.date)}: {hit.existing.title} ({hit.existing.source==='ics'?'imported, read-only':'personal'})</span></li>)}
            </ul>}
            {inspection.review.collisionCount>inspection.review.collisions.length&&<p>+{inspection.review.collisionCount-inspection.review.collisions.length} additional overlaps not listed.</p>}
            {inspection.review.affectedClockCount>0&&<p className="draft-dst-warning" role="alert">
              <AlertTriangle size={14}/> {inspection.review.affectedClockCount} recurring date(s) in the next 365 days have nonexistent or repeated device-local clock times ({inspection.review.missingOrAmbiguousDates.join(', ')}). Generated events may be skipped or ambiguous.
            </p>}
            {needsAck&&<label className="checkline"><input type="checkbox" checked={accepted} onChange={e=>setAcceptedSignature(e.target.checked?signature:'')}/> Save despite these overlaps or recurrence time warnings</label>}
          </>}
        </div>
        <p className="fine-print">Times use this device's local time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Start/end local times that do not exist or occur twice are rejected. Recurring collision review uses the selected 90–365-day horizon; conflicts beyond it remain unchecked.</p>
        {error&&<div className="error" role="alert">{error}</div>}
        {draftProblem&&<div className="error" role="alert">{draftProblem}</div>}
        <div className="editor-unsaved-meta" aria-live="polite">
          {dirty?<><strong>Unsaved changes</strong><span>{changed.join(' · ')}</span>
            <button className="secondary compact" type="button" onClick={resetEdits}>Reset edits</button></>:
            <span>No changes to discard. Unfinished edits stay on this device until saved or discarded.</span>}
        </div>
        <footer className="editor-actions"><button type="button" className="secondary" onClick={requestClose}>Cancel</button><button className="primary" type="submit" disabled={Boolean(inspection.error)}>{isCopy?'Create duplicate':scope==='instance'?'Save this occurrence':scope==='future'?'Save future series':event?'Save changes':'Create event'}</button></footer>
      </form>
      {discardReview&&<div className="editor-discard-overlay">
        <section role="alertdialog" aria-modal="true" aria-labelledby="editor-discard-title"
          aria-describedby="editor-discard-description" className="editor-discard-dialog">
          <h3 id="editor-discard-title">Discard unsaved changes?</h3>
          <p id="editor-discard-description">This draft has changes to {changed.join(', ')}.
            Nothing has been saved. Your original calendar events and imported sources will remain unchanged.</p>
          <div className="editor-discard-actions">
            <button ref={keepEditingButton} type="button" className="primary" onClick={()=>setDiscardReview(false)}>Keep editing</button>
            <button type="button" className="danger" onClick={closeAndDiscard}>Discard changes</button>
          </div>
        </section>
      </div>}
    </section>
  </div>
}
