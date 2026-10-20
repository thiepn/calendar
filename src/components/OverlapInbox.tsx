import {useMemo,useState} from 'react'
import type {CalendarState,CalendarOccurrence,LocalDate} from '../types'
import {addDays} from '../core/dates'
import {overlapInbox,type OriginalOverlapParticipant} from '../core/overlap-inbox'

interface Props {
  state:CalendarState;initialDate:LocalDate;hiddenSources:readonly string[]
  onOpen:(participant:OriginalOverlapParticipant,action:'inspect'|'adjust')=>void
  onClose:()=>void
}
export function OverlapInbox({state,initialDate,hiddenSources,onOpen,onClose}:Props){
  const [from,setFrom]=useState(initialDate)
  const [days,setDays]=useState<7|14|30>(14)
  const [page,setPage]=useState(0)
  const [revealHidden,setRevealHidden]=useState(false)
  const {inbox,error}=useMemo(()=>{
    try{return {inbox:overlapInbox(state,from,days,hiddenSources,page),error:''}}
    catch(e){return {inbox:null,error:e instanceof Error?e.message:String(e)}}
  },[state,from,days,hiddenSources,page])
  function navigate(n:-1|1){
    try{setFrom(addDays(from,days*n));setPage(0)}catch{}
  }
  function sourceName(participant:OriginalOverlapParticipant):string{
    if(participant.hidden&&!revealHidden)return 'Hidden imported commitment'
    return participant.item.title
  }
  function controls(participant:OriginalOverlapParticipant){
    const permitted=!participant.hidden||revealHidden
    const original=participant.item
    return <div className="overlap-participant">
      <strong>{sourceName(participant)}</strong>
      <span>{participant.hidden&&!revealHidden?'Hidden imported source':
        original.source==='personal'?'Personal':original.sourceCalendar??'Imported ICS'}
        {original.transparent?' · free (non-blocking)':''}
        {participant.originalTimeZone?' · '+participant.originalTimeZone:''}</span>
      <div className="overlap-participant-actions">
        <button type="button" className="secondary" disabled={!permitted}
          aria-label={'Inspect '+(participant.hidden&&!revealHidden?'hidden imported commitment':original.title)}
          onClick={()=>onOpen(participant,'inspect')}>Inspect original</button>
        {original.source==='personal'&&<button type="button" className="secondary"
          onClick={()=>onOpen(participant,'adjust')}>Adjust personal time</button>}
      </div>
    </div>
  }
  return <div className="modal-backdrop overlap-inbox-backdrop">
    <section className="dialog-surface overlap-inbox-dialog" role="dialog" aria-modal="true"
      aria-label="Saved calendar overlap inbox">
      <header className="editor-head"><h2>Overlapping appointments</h2>
        <button className="icon-button" type="button" aria-label="Close overlap inbox" onClick={onClose}>×</button>
      </header>
      <div className="overlap-inbox-controls">
        <label>From<input aria-label="Overlap inbox start date" type="date" value={from}
          onChange={e=>{setFrom(e.target.value);setPage(0)}}/></label>
        <label>Range<select aria-label="Overlap inbox range" value={days}
          onChange={e=>{setDays(Number(e.target.value) as 7|14|30);setPage(0)}}>
          <option value={7}>7 days</option><option value={14}>14 days</option>
          <option value={30}>30 days</option>
        </select></label>
        <button type="button" className="secondary" onClick={()=>navigate(-1)}>Previous period</button>
        <button type="button" className="secondary" onClick={()=>navigate(1)}>Next period</button>
      </div>
      {error&&<p role="alert" className="error">{error}</p>}
      {inbox&&<>
        <p role="status" className="overlap-inbox-total">{inbox.total} timed overlaps ·
          {inbox.hiddenPairs} include hidden imports · {inbox.importedPairs} include imported appointments</p>
        {inbox.hiddenPairs>0&&<label className="overlap-reveal">
          <input type="checkbox" aria-label="Reveal hidden imported source details" checked={revealHidden}
            onChange={e=>setRevealHidden(e.target.checked)}/>
          Reveal hidden imported source details in this review
        </label>}
        <ol className="overlap-pairs" aria-label="Actual overlapping original appointments">
          {inbox.visible.map(pair=><li key={pair.id} className="overlap-pair">
            <time dateTime={pair.start}>{new Date(pair.start).toLocaleString(undefined,{
              dateStyle:'medium',timeStyle:'short'})} – {new Date(pair.end).toLocaleTimeString(undefined,{
              hour:'2-digit',minute:'2-digit'})}</time>
            <div className="overlap-participants">
              {controls(pair.first)}
              {controls(pair.second)}
            </div>
          </li>)}
        </ol>
        {!inbox.total&&<p className="overlap-empty">No overlapping timed appointments in this period.</p>}
        {inbox.pages>1&&<nav className="overlap-inbox-pages" aria-label="Overlap pages">
          <button className="secondary" type="button" disabled={inbox.page===0}
            onClick={()=>setPage(inbox.page-1)}>Previous overlaps</button>
          <span>{inbox.start}–{inbox.end} of {inbox.total}</span>
          <button className="secondary" type="button" disabled={inbox.page>=inbox.pages-1}
            onClick={()=>setPage(inbox.page+1)}>Next overlaps</button>
        </nav>}
        {inbox.allDayCount>0&&<p className="overlap-inbox-note">{inbox.allDayCount} all-day occurrence(s) not assessed as timed overlaps.</p>}
      </>}
      <footer className="editor-actions"><button type="button" className="secondary" onClick={onClose}>Return to Calendar</button></footer>
    </section>
  </div>
}
