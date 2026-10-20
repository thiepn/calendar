import {useMemo,useState} from 'react'
import {AlertTriangle,X} from 'lucide-react'
import type {CalendarOccurrence,CalendarState,LocalDate} from '../types'
import {dateLabel,addDays} from '../core/dates'
import {proposeAllDayChange,type AllDayProposal} from '../core/all-day'

type Props={item:CalendarOccurrence;state:CalendarState;initial?:{from:LocalDate;through:LocalDate};
  onApply:(proposal:AllDayProposal)=>void;onClose:()=>void}
export function AllDayDialog({item,state,initial,onApply,onClose}:Props){
  const [from,setFrom]=useState(initial?.from??item.startDate)
  const [through,setThrough]=useState(initial?.through??addDays(item.endDateExclusive,-1))
  const [consent,setConsent]=useState('')
  const signature=from+'|'+through
  const review=useMemo(()=>{
    try{return {proposal:proposeAllDayChange(state,item,from,through),error:''}}
    catch(e){return {proposal:null,error:e instanceof Error?e.message:String(e)}}
  },[state,item,from,through])
  const overlaps=review.proposal?.collisionCount??0
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="adjust-dialog dialog-surface" role="dialog" aria-modal="true" aria-label="Confirm all-day adjustment">
      <header className="editor-head"><h2>Adjust all-day dates</h2>
        <button className="icon-button" aria-label="Close all-day adjustment" onClick={onClose}><X size={19}/></button></header>
      <h3>{item.title}</h3>
      <p className="fine-print">Original: {dateLabel(item.startDate)} – {dateLabel(addDays(item.endDateExclusive,-1))}.
        Editing a repeating event changes only this occurrence. Imported entries remain read-only.</p>
      <div className="editor-grid adjust-fields">
        <label>First day<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setConsent('')}}/></label>
        <label>Last day (inclusive)<input type="date" value={through} onChange={e=>{setThrough(e.target.value);setConsent('')}}/></label>
      </div>
      {review.error&&<div role="alert" className="error">{review.error}</div>}
      {review.proposal&&<>
        <p className="adjust-new-time">Proposed: {dateLabel(from)} – {dateLabel(through)}</p>
        {overlaps>0&&<div className="adjust-conflicts" role="alert">
          <strong><AlertTriangle size={16}/> {overlaps} overlapping saved commitment(s)</strong>
          <p>All personal and imported sources were checked, including those hidden by search or filtering.</p>
          <ul>{review.proposal.conflicts.slice(0,8).map(x=><li key={x.key}>{x.title} — {x.source==='ics'?'imported, read-only':'personal'}</li>)}</ul>
          <label><input type="checkbox" checked={consent===signature} onChange={e=>setConsent(e.target.checked?signature:'')}/>
            Save despite these overlaps</label>
        </div>}
      </>}
      <footer className="editor-actions"><button className="secondary" type="button" onClick={onClose}>Cancel</button>
        <button className="primary" type="button" disabled={!review.proposal||(overlaps>0&&consent!==signature)}
          onClick={()=>{if(review.proposal)onApply(review.proposal)}}>Confirm all-day change</button></footer>
    </section>
  </div>
}
