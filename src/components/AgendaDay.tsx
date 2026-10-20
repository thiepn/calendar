import {useState} from 'react'
import {AlertTriangle,CalendarDays,ChevronLeft,ChevronRight,Plus} from 'lucide-react'
import type {CalendarRecord,CalendarOccurrence,LocalDate} from '../types'
import {dateLabel} from '../core/dates'
import {conflictsOnDay,dayOccurrences} from '../core/occurrences'
import {dayJumpPage} from '../core/day-navigator'

type Props={
  date:LocalDate
  selected:boolean
  records:CalendarRecord[]
  onOpen:(occurrence:CalendarOccurrence)=>void
  onCreate:(date:LocalDate)=>void
  onShowDay:(date:LocalDate)=>void
}
/** Day-scoped, paged original occurrences. Pages are presentation only.
 * There is no copied record, independent recurrence engine, or writer. */
export function AgendaDay({date,selected,records,onOpen,onCreate,onShowDay}:Props){
  const [requestedPage,setRequestedPage]=useState(0)
  const result=dayJumpPage(records,date,requestedPage,12)
  const conflicts=conflictsOnDay(dayOccurrences(records,date))
  return <article className={'agenda-row '+(selected?'selected':'')} aria-label={'Agenda for '+date}>
    <div className="agenda-date"><button type="button"
      aria-label={'Open day view '+date} onClick={()=>onShowDay(date)}>
      <strong>{dateLabel(date,{weekday:'short'})}</strong>
      <span>{dateLabel(date,{month:'short',day:'numeric'})}</span></button>
      <small>{result.total} event{result.total===1?'':'s'}</small>
    </div>
    <div className="agenda-events">
      {result.items.length?<div className="event-list agenda-page-events">
        {result.items.map(({occurrence:item,timeLabel})=><button key={item.key}
          type="button" onClick={()=>onOpen(item)}
          className={'event-chip '+(item.source==='ics'?'imported ':'')+(conflicts.has(item.key)?'conflicted ':'')}>
          <span className="event-dot" aria-hidden="true"/>
          <span className="event-text"><span className="event-title">{item.title}</span>
            <small>{timeLabel}{item.startDate<date?' · continues':''}
              {item.source==='ics'?' · imported, read only':''}
              {item.transparent?' · Free (non-blocking)':''}</small></span>
          {conflicts.has(item.key)&&<AlertTriangle size={12} aria-label="Overlapping event" />}
        </button>)}
      </div>:<p className="empty-note">No commitments</p>}
      {result.pages>1&&<nav className="agenda-day-pages" aria-label={'Event pages for '+date}>
        <button className="secondary compact" type="button" disabled={!result.hasPrevious}
          aria-label={'Previous events on '+date} onClick={()=>setRequestedPage(result.page-1)}>
          <ChevronLeft size={14}/> Previous</button>
        <span aria-live="polite">Events {result.fromIndex}–{result.throughIndex} of {result.total} · Page {result.page+1} of {result.pages}</span>
        <button className="secondary compact" type="button" disabled={!result.hasNext}
          aria-label={'Next events on '+date} onClick={()=>setRequestedPage(result.page+1)}>
          Next <ChevronRight size={14}/></button>
      </nav>}
      {result.total>0&&<button className="agenda-open-day" type="button" onClick={()=>onShowDay(date)}>
        <CalendarDays size={14}/> Open graphical Day view
      </button>}
    </div>
    <button className="icon-button agenda-create" onClick={()=>onCreate(date)}
      aria-label={'New event '+date}><Plus size={16}/></button>
  </article>
}
