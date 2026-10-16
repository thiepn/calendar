import {useMemo,useState,type FormEvent} from 'react'
import {X,CalendarPlus,AlertTriangle} from 'lucide-react'
import type {CalendarRecord,Frequency,LocalDate,RepeatRule} from '../types'
import {addDays,day,localDateTime,dateLabel} from '../core/dates'
import {draftTimedRange,reviewDraft} from '../core/draft'
const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
type Props={date:LocalDate;event?:CalendarRecord;initialRange?:{start:string;end:string};initialAllDay?:{from:LocalDate;through:LocalDate};records:CalendarRecord[];ignoreOccurrence?:{id:string;date:LocalDate};ignoreParentFrom?:{id:string;date:LocalDate};scope?:'instance'|'future';onSave:(record:CalendarRecord)=>void;onClose:()=>void}
export function EventEditor({date,event,initialRange,initialAllDay,records,ignoreOccurrence,ignoreParentFrom,scope,onSave,onClose}:Props){
  const [title,setTitle]=useState(event?.title??'')
  const [description,setDescription]=useState(event?.description??'')
  const [location,setLocation]=useState(event?.location??'')
  const [allDay,setAllDay]=useState(event?.allDay??Boolean(initialAllDay))
  const [start,setStart]=useState(event ? event.allDay?event.startDate!:localDateTime(event.start) : initialAllDay?initialAllDay.from:initialRange?localDateTime(initialRange.start):date+'T09:00')
  const [end,setEnd]=useState(event ? event.allDay?addDays(event.endDateExclusive!,-1):localDateTime(event.end) : initialAllDay?initialAllDay.through:initialRange?localDateTime(initialRange.end):date+'T10:00')
  const [frequency,setFrequency]=useState<'none'|Frequency>(event?.repeat?.frequency??'none')
  const [interval,setInterval]=useState(event?.repeat?.interval??1)
  const [until,setUntil]=useState(event?.repeat?.until??'')
  const [weekdaysSet,setWeekdaysSet]=useState<number[]>(event?.repeat?.weekdays??[])
  const [error,setError]=useState('')
  const [acceptedSignature,setAcceptedSignature]=useState('')
  const signature=[title,start,end,allDay,frequency,interval,until,weekdaysSet.join(',')].join('|')
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
      const range=draftTimedRange(start,end)
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
      ...(repeat?{repeat}:{}),updatedAt:new Date().toISOString(),
      ...(event?.excludedDates?{excludedDates:event.excludedDates}:{})}
  }
  const inspection=useMemo(()=>{
    try{return {review:reviewDraft(records,construct(event?.id??'__draft_preview__'),{
      ignoreRecordId:scope==='instance'||scope==='future'?undefined:event?.id,
      ignoreOccurrence,ignoreParentFrom,horizonDays:90
    }),error:''}}
    catch(e){return {review:null,error:e instanceof Error?e.message:String(e)}}
    // Review depends on all form inputs, original record and canonical calendar records.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[title,description,location,allDay,start,end,frequency,interval,until,weekdaysSet,event,scope,records,ignoreOccurrence,ignoreParentFrom])
  const needsAck=Boolean(inspection.review&&(inspection.review.collisionCount||inspection.review.affectedClockCount))
  function toggleAllDay(value:boolean){
    if(value===allDay)return
    setStart(v=>value?v.slice(0,10):v.slice(0,10)+'T09:00')
    setEnd(v=>value?v.slice(0,10):v.slice(0,10)+'T10:00')
    setAllDay(value)
  }
  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault()
    try{
      if(!title.trim())throw new Error('Enter an event title')
      if(inspection.error||!inspection.review)throw new Error(inspection.error||'Check the proposed dates')
      if(needsAck&&!accepted)throw new Error('Acknowledge overlapping events or recurring clock warnings before saving')
      const startDay=start.slice(0,10)
      const endDay=end.slice(0,10)
      if(until && until<startDay)throw new Error('Repeat end cannot precede the first occurrence')
      const startIso=allDay ? new Date(startDay+'T00:00:00').toISOString() : draftTimedRange(start,end).start
      const endExclusive=addDays(endDay,1)
      const endIso=allDay ? new Date(endExclusive+'T00:00:00').toISOString() : draftTimedRange(start,end).end
      if(Date.parse(endIso)<=Date.parse(startIso))throw new Error('End must follow start')
      if(allDay && endDay<startDay)throw new Error('End day must not precede start')
      const repeat:RepeatRule|undefined=scope==='instance'||frequency==='none'?undefined:{
        frequency,interval:Math.floor(interval),...(until?{until}:{}),
        ...(frequency==='weekly'&&weekdaysSet.length?{weekdays:weekdaysSet}:{}),
      }
      if(repeat && (repeat.interval<1||repeat.interval>30))throw new Error('Repeat interval must be between 1 and 30')
      const record:CalendarRecord={id:event?.id??crypto.randomUUID(),title:title.trim(),
        description:description.trim(),location:location.trim(),source:'personal',
        allDay,start:startIso,end:endIso,...(allDay?{startDate:startDay,endDateExclusive:endExclusive}:{}),
        ...(repeat?{repeat}:{}),updatedAt:new Date().toISOString(),
        ...(event?.excludedDates?{excludedDates:event.excludedDates}:{}),
      }
      onSave({...record,...construct(record.id),title:record.title})
    }catch(err){setError(err instanceof Error?err.message:String(err))}
  }
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="editor dialog-surface" role="dialog" aria-modal="true" aria-label={scope==='instance'?'Edit one occurrence':scope==='future'?'Edit this and future':event?'Edit event':'New event'}>
      <header className="editor-head"><div className="heading-inline"><CalendarPlus size={20}/><h2>{scope==='instance'?'Edit one occurrence':scope==='future'?'Edit this and future':event?'Edit event':'New event'}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Close editor"><X size={19}/></button></header>
      <form onSubmit={submit} className="editor-form">
        <label>Event name<input autoFocus required maxLength={240} value={title} onChange={e=>setTitle(e.target.value)} placeholder="What are you planning?"/></label>
        <label className="checkline"><input type="checkbox" checked={allDay} onChange={e=>toggleAllDay(e.target.checked)}/> All-day event</label>
        <div className="editor-grid">
          <label>Starts<input required type={allDay?'date':'datetime-local'} value={start} onChange={e=>setStart(e.target.value)}/></label>
          <label>{allDay?'Last day (inclusive)':'Ends'}<input required type={allDay?'date':'datetime-local'} value={end} onChange={e=>setEnd(e.target.value)}/></label>
        </div>
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
        <label>Location<input value={location} maxLength={500} onChange={e=>setLocation(e.target.value)} placeholder="Optional"/></label>
        <label>Notes<textarea rows={3} maxLength={4000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Optional details"/></label>
        <div className="draft-review" aria-label="Calendar conflict review" aria-live="polite">
          <strong>Calendar review — all saved calendars</strong>
          {inspection.error?<p className="error" role="alert">{inspection.error}</p>:inspection.review&&<>
            <p>{inspection.review.collisionCount} overlapping commitment(s) through {dateLabel(inspection.review.checkedThrough,{year:'numeric',month:'short',day:'numeric'})}{inspection.review.repeating?' — first 90 days only':' — this event'}.</p>
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
        <p className="fine-print">Times use this device's local time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Start/end local times that do not exist or occur twice are rejected. Recurring collision review is limited to 90 days; further conflicts may exist.</p>
        {error&&<div className="error" role="alert">{error}</div>}
        <footer className="editor-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={Boolean(inspection.error)}>{scope==='instance'?'Save this occurrence':scope==='future'?'Save future series':event?'Save changes':'Create event'}</button></footer>
      </form>
    </section>
  </div>
}
