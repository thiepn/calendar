import {useEffect,useRef,useState} from 'react'
import {ChevronRight,Plus,X,CalendarDays} from 'lucide-react'
import type {CalendarOccurrence,CalendarRecord,LocalDate} from '../types'
import {dateLabel} from '../core/dates'
import {searchOccurrencePage} from '../core/search-pages'

type Props={
  date:LocalDate
  records:CalendarRecord[]
  onClose:()=>void
  onOpen:(occurrence:CalendarOccurrence)=>void
  onShowDay:(date:LocalDate)=>void
  onCreate:(date:LocalDate)=>void
}
/** Read-only month cell expansion, using the exact existing source-filtered
 * occurrence projection and paging. The canonical editor is not mounted here. */
export function MonthDayPeek({date,records,onClose,onOpen,onShowDay,onCreate}:Props){
  const [page,setPage]=useState(0)
  const close=useRef<HTMLButtonElement>(null)
  const results=searchOccurrencePage(records,date,date,'forward',page,20)
  useEffect(()=>{close.current?.focus()},[])
  useEffect(()=>{if(page!==results.page)setPage(results.page)},[page,results.page])
  return <div className="modal-backdrop month-peek-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="month-peek-dialog dialog-surface" role="dialog" aria-modal="true" aria-label={'Events on '+date}>
      <header className="editor-head month-peek-head">
        <div><span className="eyebrow">MONTH · ORIGINAL VISIBLE EVENTS</span>
          <h2>{dateLabel(date,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</h2>
          <p>{results.total} visible event{results.total===1?'':'s'} · personal and shown imports</p></div>
        <button ref={close} className="icon-button" type="button" aria-label="Close day preview" onClick={onClose}><X size={19}/></button>
      </header>
      <div className="month-peek-scroll">
        {results.items.length?<div className="month-peek-events">
          {results.items.map(item=><button type="button" key={item.key} className={'month-peek-event '+(item.source==='ics'?'imported':'')}
            onClick={()=>onOpen(item)}>
            <span className="month-peek-time">{item.allDay?'All day':new Date(item.start).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</span>
            <span className="month-peek-copy"><strong>{item.title}</strong>
              <small>{item.source==='ics'?'Imported · read only':'Personal'}{item.transparent?' · Free (non-blocking)':''}{item.startDate<date?' · Continues':''}</small></span>
            <ChevronRight size={16}/>
          </button>)}
        </div>:<p className="empty-note month-peek-empty">No visible events for this day. Hidden imported sources are not shown here.</p>}
      </div>
      {results.pages>1&&<nav className="month-peek-pages" aria-label="Day event pages">
        <button type="button" className="secondary compact" disabled={!results.hasPrevious}
          onClick={()=>setPage(results.page-1)}>Previous events</button>
        <span>Showing {results.fromIndex}–{results.throughIndex} of {results.total} · Page {results.page+1} of {results.pages}</span>
        <button type="button" className="secondary compact" disabled={!results.hasNext}
          onClick={()=>setPage(results.page+1)}>Next events</button>
      </nav>}
      <p className="fine-print month-peek-footnote">Only shown calendars appear here. Hidden busy imports still count for Find time and overlap checks. Imported events are read only.</p>
      <footer className="month-peek-actions">
        <button type="button" className="secondary" onClick={()=>onShowDay(date)}><CalendarDays size={16}/> Open Day view</button>
        <button type="button" className="primary" onClick={()=>onCreate(date)}><Plus size={16}/> New personal event</button>
      </footer>
    </section>
  </div>
}
