import {Plus,AlertTriangle} from 'lucide-react'
import type {CalendarRecord,CalendarOccurrence,LocalDate} from '../types'
import {dateLabel,localDate} from '../core/dates'
import {dayOccurrences,conflictsOnDay} from '../core/occurrences'
import {TimelineView} from './TimelineView'
import {AgendaDay} from './AgendaDay'
type Mode='month'|'week'|'day'|'agenda'
type Props={mode:Mode;days:LocalDate[];selected:LocalDate;records:CalendarRecord[];
  onSelect:(date:LocalDate)=>void;onOpen:(event:CalendarOccurrence)=>void;onCreate:(date:LocalDate)=>void;onCreateAt:(date:LocalDate,start:string,end:string)=>void;
  onAdjust:(item:CalendarOccurrence,action:'move'|'resize',date:LocalDate,minute:number,length:number,fold?:'earlier'|'later')=>void;
  hideEmptyAgenda?:boolean;
  onAllDaySlot:(from:LocalDate,through:LocalDate)=>void;
  onAllDayAdjust:(item:CalendarOccurrence,from:LocalDate,through:LocalDate)=>void;
  onPeek:(date:LocalDate)=>void;
  onShowDay:(date:LocalDate)=>void}
const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
function belongs(event:CalendarOccurrence,date:LocalDate) {
  return event.allDay ? event.startDate<=date&&event.endDateExclusive>date :
    localDate(new Date(event.start))===date
}
function shortTime(event:CalendarOccurrence){return event.allDay?'All day':new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(new Date(event.start))}
function Events({date,records,onOpen,onPeek,limit=30}:Pick<Props,'records'|'onOpen'>&{date:LocalDate;limit?:number;onPeek?:(date:LocalDate)=>void}){
  const all=dayOccurrences(records,date)
  const conflicts=conflictsOnDay(all)
  const visible=all.slice(0,limit)
  return <div className="event-list">
    {visible.map(item=><button key={item.key} className={'event-chip '+(item.source==='ics'?'imported ':'')+(conflicts.has(item.key)?'conflicted ':'')}
      type="button" onClick={e=>{e.stopPropagation();onOpen(item)}}>
      <span className="event-dot"/><span className="event-text"><span className="event-title">{item.title}</span>
        <small>{shortTime(item)}{!belongs(item,date)?' · continues':''}{item.transparent?' · Free (non-blocking)':''}</small></span>
      {conflicts.has(item.key)&&<AlertTriangle size={12} aria-label="Overlapping event" />}
    </button>)}
    {all.length>limit&&(onPeek?
      <button className="more-events" type="button" aria-label={'View all '+all.length+' events on '+date}
        onClick={()=>onPeek(date)}>+{all.length-limit} more · View all</button>:
      <span className="more-events">+{all.length-limit} more</span>)}
  </div>
}
export function CalendarViews({mode,days,selected,records,onSelect,onOpen,onCreate,onCreateAt,onAdjust,onAllDaySlot,onAllDayAdjust,onPeek,onShowDay,hideEmptyAgenda=false}:Props){
  if(mode==='month')return <section className="month-view" aria-label="Month grid">
    <div className="weekday-head">{dayNames.map(name=><span key={name}>{name}</span>)}</div>
    <div className="month-grid">
      {days.map(d=><div key={d} className={'month-cell '+(d===selected?'selected ':'')+(d.slice(0,7)!==selected.slice(0,7)?'out-month ':'')+(d===localDate()?'is-today':'')}>
        <div className="cell-top">
          <button type="button" className="date-number" aria-label={'View events '+d}
            onClick={()=>onPeek(d)}>{Number(d.slice(-2))}</button>
          <button type="button" className="cell-add" aria-label={'New event '+d} onClick={()=>onCreate(d)}><Plus size={13}/></button>
        </div>
        <Events date={d} records={records} onOpen={onOpen} onPeek={onPeek} limit={3}/>
      </div>)}
    </div>
  </section>
  if(mode==='week'||mode==='day')return <TimelineView key={mode} days={days} selected={selected} records={records} onSelect={onSelect} onOpen={onOpen} onSlot={onCreateAt} onAdjust={onAdjust} onAllDaySlot={onAllDaySlot} onAllDayAdjust={onAllDayAdjust}/>
  return <section className="agenda-view" aria-label="Upcoming agenda">{days.filter(d=>!hideEmptyAgenda||dayOccurrences(records,d).length>0).map(d=>
    <AgendaDay key={d} date={d} selected={d===selected} records={records} onOpen={onOpen}
      onCreate={onCreate} onShowDay={onShowDay}/>)}
    {hideEmptyAgenda&&!days.some(d=>dayOccurrences(records,d).length>0)&&
      <p className="empty-note agenda-empty">No commitments in this period. Try showing empty days or moving to another date.</p>}
  </section>
}
export type {Mode}
