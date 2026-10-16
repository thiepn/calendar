import {Plus,AlertTriangle} from 'lucide-react'
import type {CalendarRecord,CalendarOccurrence,LocalDate} from '../types'
import {dateLabel,localDate} from '../core/dates'
import {dayOccurrences,conflictsOnDay} from '../core/occurrences'
import {TimelineView} from './TimelineView'
type Mode='month'|'week'|'day'|'agenda'
type Props={mode:Mode;days:LocalDate[];selected:LocalDate;records:CalendarRecord[];
  onSelect:(date:LocalDate)=>void;onOpen:(event:CalendarOccurrence)=>void;onCreate:(date:LocalDate)=>void;onCreateAt:(date:LocalDate,start:string,end:string)=>void;
  onAdjust:(item:CalendarOccurrence,action:'move'|'resize',date:LocalDate,minute:number,length:number)=>void;
  onAllDaySlot:(from:LocalDate,through:LocalDate)=>void;
  onAllDayAdjust:(item:CalendarOccurrence,from:LocalDate,through:LocalDate)=>void}
const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
function belongs(event:CalendarOccurrence,date:LocalDate) {
  return event.allDay ? event.startDate<=date&&event.endDateExclusive>date :
    localDate(new Date(event.start))===date
}
function shortTime(event:CalendarOccurrence){return event.allDay?'All day':new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(new Date(event.start))}
function Events({date,records,onOpen,limit=30}:Pick<Props,'records'|'onOpen'>&{date:LocalDate;limit?:number}){
  const all=dayOccurrences(records,date)
  const conflicts=conflictsOnDay(all)
  const visible=all.slice(0,limit)
  return <div className="event-list">
    {visible.map(item=><button key={item.key} className={'event-chip '+(item.source==='ics'?'imported ':'')+(conflicts.has(item.key)?'conflicted ':'')}
      type="button" onClick={e=>{e.stopPropagation();onOpen(item)}}>
      <span className="event-dot"/><span className="event-text"><span className="event-title">{item.title}</span>
        <small>{shortTime(item)}{!belongs(item,date)?' · continues':''}</small></span>
      {conflicts.has(item.key)&&<AlertTriangle size={12} aria-label="Overlapping event" />}
    </button>)}
    {all.length>limit&&<span className="more-events">+{all.length-limit} more</span>}
  </div>
}
export function CalendarViews({mode,days,selected,records,onSelect,onOpen,onCreate,onCreateAt,onAdjust,onAllDaySlot,onAllDayAdjust}:Props){
  if(mode==='month')return <section className="month-view" aria-label="Month grid">
    <div className="weekday-head">{dayNames.map(name=><span key={name}>{name}</span>)}</div>
    <div className="month-grid">
      {days.map(d=><div key={d} className={'month-cell '+(d===selected?'selected ':'')+(d.slice(0,7)!==selected.slice(0,7)?'out-month ':'')+(d===localDate()?'is-today':'')}>
        <div className="cell-top">
          <button type="button" className="date-number" aria-label={'Select '+dateLabel(d)} onClick={()=>onSelect(d)}>{Number(d.slice(-2))}</button>
          <button type="button" className="cell-add" aria-label={'New event '+d} onClick={()=>onCreate(d)}><Plus size={13}/></button>
        </div>
        <Events date={d} records={records} onOpen={onOpen} limit={3}/>
      </div>)}
    </div>
  </section>
  if(mode==='week'||mode==='day')return <TimelineView key={mode} days={days} selected={selected} records={records} onSelect={onSelect} onOpen={onOpen} onSlot={onCreateAt} onAdjust={onAdjust} onAllDaySlot={onAllDaySlot} onAllDayAdjust={onAllDayAdjust}/>
  return <section className="agenda-view" aria-label="Upcoming agenda">{days.map(d=>{
    const n=dayOccurrences(records,d).length
    return <div className={'agenda-row '+(d===selected?'selected':'')} key={d}>
      <div className="agenda-date"><button onClick={()=>onSelect(d)}><strong>{dateLabel(d,{weekday:'short'})}</strong>
        <span>{dateLabel(d,{month:'short',day:'numeric'})}</span></button></div>
      <div className="agenda-events">{n?<Events date={d} records={records} onOpen={onOpen}/>:<p className="empty-note">No commitments</p>}</div>
      <button className="icon-button" onClick={()=>onCreate(d)} aria-label={'New event '+d}><Plus size={16}/></button>
    </div>})}</section>
}
export type {Mode}
