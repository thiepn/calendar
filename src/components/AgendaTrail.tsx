import {useMemo,useState} from 'react'
import type {CalendarState,LocalDate} from '../types'
import {addDays} from '../core/dates'
import {originalTrailPage,type TrailRow,type TrailTarget} from '../core/agenda-trail'

interface Props{
  state:CalendarState;target:TrailTarget
  initialDate:LocalDate
  hiddenSources:readonly string[]
  onOpen:(row:TrailRow,from:LocalDate,days:30|90)=>void
  onClose:()=>void
}
export function AgendaTrail({state,target,initialDate,hiddenSources,onOpen,onClose}:Props){
  const [from,setFrom]=useState(initialDate)
  const [days,setDays]=useState<30|90>(30)
  const [page,setPage]=useState(0)
  const {view,error}=useMemo(()=>{
    try{return {view:originalTrailPage(state,target,from,days,page),error:''}}
    catch(e){return {view:null,error:e instanceof Error?e.message:String(e)}}
  },[state,target.kind,target.kind==='series'?target.recordId:target.name,from,days,page])
  function moveWindow(direction:-1|1){
    try{setFrom(addDays(from,direction*days));setPage(0)}
    catch{setFrom(initialDate);setPage(0)}
  }
  return <div className="modal-backdrop trail-backdrop">
    <section className="dialog-surface trail-dialog" role="dialog" aria-modal="true" aria-label="Series and source trail">
      <header className="editor-head">
        <h2>{target.kind==='source'?'Imported source trail':'Recurring series trail'}</h2>
        <button type="button" className="icon-button" aria-label="Close trail" onClick={onClose}>×</button>
      </header>
      {view&&<h3 className="trail-title">{view.title}</h3>}
      <div className="trail-controls">
        <label>From<input type="date" aria-label="Trail start date" value={from}
          onChange={e=>{setFrom(e.target.value);setPage(0)}}/></label>
        <label>Range<select aria-label="Trail range" value={days}
          onChange={e=>{setDays(Number(e.target.value) as 30|90);setPage(0)}}>
          <option value={30}>30 days</option><option value={90}>90 days</option>
        </select></label>
      </div>
      <nav className="trail-window-navigation" aria-label="Browse original source periods">
        <button type="button" className="secondary" onClick={()=>moveWindow(-1)}>Previous {days} days</button>
        <button type="button" className="secondary" onClick={()=>moveWindow(1)}>Next {days} days</button>
      </nav>
      {target.kind==='source'&&hiddenSources.includes(target.name)&&
        <p role="status" className="trail-warning">This source is hidden in Calendar views. You opened its original records explicitly; no visibility preference was changed.</p>}
      {error&&<p role="alert" className="error">{error}</p>}
      {view&&<>
        <p className="trail-count" role="status">{view.active} original occurrence{view.active===1?'':'s'} ·
          {view.skipped} skipped{view.scope==='series'?' · '+view.detached+' edited occurrence(s)':''} ·
          {view.from} – {view.through}</p>
        <ol className="trail-rows" aria-label="Original source occurrences">
          {view.rows.map(row=><li key={row.key} className={'trail-row '+(row.kind==='skipped'?'trail-skipped':'')}>
            <div className="trail-row-details">
              <time dateTime={row.date}>{row.date}</time>
              <strong>{row.title}</strong>
              {row.kind==='skipped'?<span>Skipped original series date</span>:<>
                <span>{row.item!.allDay?'All day':new Date(row.item!.start).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})+
                  ' – '+new Date(row.item!.end).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</span>
                {row.originalDate&&<span>Edited original series date: {row.originalDate}</span>}
                {row.sourceName&&<span>Imported · {row.sourceName} · read only</span>}
                {row.sourceTimeZone&&<span>Original timezone: {row.sourceTimeZone}</span>}
                {row.transparent&&<span>Free · does not block time</span>}
              </>}
            </div>
            {row.kind==='occurrence'&&<button type="button" className="secondary"
              aria-label={'Open trail event '+row.title+' '+row.date}
              onClick={()=>onOpen(row,from,days)}>Open event</button>}
          </li>)}
        </ol>
        {view.total===0&&<p>No original occurrences in this period.</p>}
        {view.pages>1&&<nav className="trail-page-navigation" aria-label="Original trail pages">
          <button type="button" className="secondary" disabled={!view.previous} onClick={()=>setPage(view.page-1)}>
            Previous entries</button>
          <span>{view.start}–{view.end} of {view.total} · Page {view.page+1}/{view.pages}</span>
          <button type="button" className="secondary" disabled={!view.next} onClick={()=>setPage(view.page+1)}>
            Next entries</button>
        </nav>}
      </>}
      <footer className="editor-actions"><button type="button" className="secondary" onClick={onClose}>Return to Calendar</button></footer>
    </section>
  </div>
}
