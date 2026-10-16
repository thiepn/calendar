import {useState,type FormEvent} from 'react'
import {X,CalendarPlus} from 'lucide-react'
import type {CalendarRecord,Frequency,LocalDate,RepeatRule} from '../types'
import {addDays,fromLocalDateTime,localDateTime} from '../core/dates'
const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
type Props={date:LocalDate;event?:CalendarRecord;initialRange?:{start:string;end:string};scope?:'instance'|'future';onSave:(record:CalendarRecord)=>void;onClose:()=>void}
export function EventEditor({date,event,initialRange,scope,onSave,onClose}:Props){
  const [title,setTitle]=useState(event?.title??'')
  const [description,setDescription]=useState(event?.description??'')
  const [location,setLocation]=useState(event?.location??'')
  const [allDay,setAllDay]=useState(event?.allDay??false)
  const [start,setStart]=useState(event ? event.allDay?event.startDate!:localDateTime(event.start) : initialRange?localDateTime(initialRange.start):date+'T09:00')
  const [end,setEnd]=useState(event ? event.allDay?addDays(event.endDateExclusive!,-1):localDateTime(event.end) : initialRange?localDateTime(initialRange.end):date+'T10:00')
  const [frequency,setFrequency]=useState<'none'|Frequency>(event?.repeat?.frequency??'none')
  const [interval,setInterval]=useState(event?.repeat?.interval??1)
  const [until,setUntil]=useState(event?.repeat?.until??'')
  const [weekdaysSet,setWeekdaysSet]=useState<number[]>(event?.repeat?.weekdays??[])
  const [error,setError]=useState('')
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
      const startDay=start.slice(0,10)
      const endDay=end.slice(0,10)
      if(until && until<startDay)throw new Error('Repeat end cannot precede the first occurrence')
      const startIso=allDay ? new Date(startDay+'T00:00:00').toISOString() : fromLocalDateTime(start)
      const endExclusive=addDays(endDay,1)
      const endIso=allDay ? new Date(endExclusive+'T00:00:00').toISOString() : fromLocalDateTime(end)
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
      onSave(record)
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
        <p className="fine-print">Times use this device's local time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Repeating timed events preserve local clock time across daylight saving changes.</p>
        {error&&<div className="error" role="alert">{error}</div>}
        <footer className="editor-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" type="submit">{scope==='instance'?'Save this occurrence':scope==='future'?'Save future series':event?'Save changes':'Create event'}</button></footer>
      </form>
    </section>
  </div>
}
