import {useMemo,useState} from 'react'
import type {CalendarOccurrence,CalendarRecord,LocalDate} from '../types'
import {addDays} from '../core/dates'
import {compareAgendaDays,type ComparedAgendaDay} from '../core/agenda-compare'

interface Props {
  records:CalendarRecord[]
  first:LocalDate;second:LocalDate
  onFirst:(date:LocalDate)=>void;onSecond:(date:LocalDate)=>void
  sourceDescription:string
  onOpen:(item:CalendarOccurrence,date:LocalDate)=>void
  onClose:()=>void
}
function DayColumn({view,onPage,onOpen}:{
  view:ComparedAgendaDay;onPage:(page:number)=>void
  onOpen:(item:CalendarOccurrence,date:LocalDate)=>void
}){
  return <section className="agenda-compare-column" aria-label={'Compared day '+view.date}>
    <header>
      <h3>{view.date}</h3>
      <strong>{view.events.total} events · {view.busyMinutes} timed busy minutes</strong>
      <span>{view.allDayCount} all-day · {view.importedCount} imported
        {view.overlaps?' · '+view.overlaps+' overlapping events':''}</span>
      <span>{view.sourceCounts.map(s=>s.name+' ('+s.count+')').join(' · ')||'No visible events'}</span>
    </header>
    <div className="agenda-compare-items">
      {view.events.items.map(({occurrence:item,timeLabel})=><button type="button" key={item.key}
        className={'agenda-compare-event '+(item.source==='ics'?'is-imported ':'')}
        aria-label={'Inspect compared event '+item.title+' '+view.date}
        onClick={()=>onOpen(item,view.date)}>
        <span className="agenda-compare-event-time">{timeLabel}{item.date<view.date?' · continues':''}</span>
        <strong>{item.title}</strong>
        <span>{item.source==='personal'?'Personal':item.sourceCalendar??'Imported, read only'}
          {item.transparent?' · free (non-blocking)':''}
          {view.sharedKeys.has(item.key)?' · also on other day':''}
          {view.conflicts.has(item.key)?' · overlaps':''}</span>
      </button>)}
      {!view.events.total&&<p className="agenda-compare-empty">No visible events</p>}
    </div>
    {view.events.pages>1&&<nav className="agenda-compare-pages" aria-label={'Comparison pages for '+view.date}>
      <button type="button" className="secondary" disabled={!view.events.hasPrevious}
        onClick={()=>onPage(view.events.page-1)}>Previous</button>
      <span>{view.events.fromIndex}–{view.events.throughIndex} of {view.events.total}</span>
      <button type="button" className="secondary" disabled={!view.events.hasNext}
        onClick={()=>onPage(view.events.page+1)}>Next</button>
    </nav>}
  </section>
}
/** Read-only, source-filtered compare. The canonical Calendar is never
 * duplicated, scheduled or modified; each cell navigates to the original. */
export function AgendaCompareDialog({
  records,first,second,onFirst,onSecond,sourceDescription,onOpen,onClose
}:Props){
  const [firstPage,setFirstPage]=useState(0)
  const [secondPage,setSecondPage]=useState(0)
  const result=useMemo(()=>{
    try{return {comparison:compareAgendaDays(records,first,second,firstPage,secondPage),error:''}}
    catch(error){return {comparison:null,error:error instanceof Error?error.message:String(error)}}
  },[records,first,second,firstPage,secondPage])
  const comparison=result.comparison
  return <div className="modal-backdrop agenda-compare-backdrop">
    <section role="dialog" aria-modal="true" aria-label="Compare original calendar days"
      className="dialog-surface agenda-compare-dialog">
      <header className="editor-head"><h2>Compare days</h2>
        <button type="button" className="icon-button" aria-label="Close day comparison" onClick={onClose}>×</button>
      </header>
      <div className="agenda-compare-controls">
        <label>First day<input type="date" aria-label="First comparison date" value={first}
          onChange={e=>{onFirst(e.target.value);setFirstPage(0)}}/></label>
        <label>Second day<input type="date" aria-label="Second comparison date" value={second}
          onChange={e=>{onSecond(e.target.value);setSecondPage(0)}}/></label>
        <button type="button" className="secondary" onClick={()=>{
          onFirst(second);onSecond(first);setFirstPage(0);setSecondPage(0)
        }}>Swap dates</button>
        <button type="button" className="secondary" onClick={()=>{
          onSecond(addDays(second,7));setSecondPage(0)
        }}>Next comparison week</button>
      </div>
      <p className="agenda-compare-scope">{sourceDescription}. Original visible sources only; hidden imported busy events still affect Find time independently.</p>
      {result.error&&<p role="alert" className="error">{result.error}</p>}
      {comparison&&<>
        <p className="agenda-compare-common" role="status">{comparison.sharedOwnerCount} original event/series owner{comparison.sharedOwnerCount===1?'':'s'} appear on both days</p>
        <div className="agenda-compare-grid">
          <DayColumn view={comparison.first} onPage={setFirstPage} onOpen={onOpen}/>
          <DayColumn view={comparison.second} onPage={setSecondPage} onOpen={onOpen}/>
        </div>
      </>}
      <footer className="editor-actions">
        <button type="button" className="secondary" onClick={onClose}>Return to Calendar</button>
      </footer>
    </section>
  </div>
}
