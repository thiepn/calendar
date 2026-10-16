import {useMemo,useState} from 'react'
import {previewMissingPersonal} from '../core/recover-missing'
import {AlertTriangle,X,DatabaseBackup} from 'lucide-react'
import type {CalendarRecord,CalendarState} from '../types'

function stats(records:CalendarRecord[]){
  return {personal:records.filter(r=>r.source==='personal').length,
    imported:records.filter(r=>r.source==='ics').length,
    recurring:records.filter(r=>Boolean(r.repeat)).length,
    overrides:records.filter(r=>Boolean(r.recurrenceParentId)).length,
    sources:Array.from(new Set(records.filter(r=>r.source==='ics').map(r=>r.sourceCalendar??'Imported'))).sort()}
}
export function RestoreDialog({current,candidate,origin,unreadableCurrent=false,onClose,onConfirm,onRecoverMissing}:{
  current:CalendarState;candidate:CalendarState;origin:string;unreadableCurrent?:boolean;onClose:()=>void;onConfirm:()=>void;onRecoverMissing?:()=>void
}){
  const [confirmed,setConfirmed]=useState(false)
  const [confirmedMissing,setConfirmedMissing]=useState(false)
  const missingReview=useMemo(()=>{
    if(unreadableCurrent||!onRecoverMissing)return {added:[] as CalendarRecord[],error:''}
    try{return {added:previewMissingPersonal(current,candidate).added,error:''}}
    catch(error){return {added:[] as CalendarRecord[],error:error instanceof Error?error.message:String(error)}}
  },[current,candidate,unreadableCurrent,onRecoverMissing])
  const before=stats(current.records),after=stats(candidate.records)
  const currentIds=new Set(current.records.map(r=>r.id))
  const candidateIds=new Set(candidate.records.map(r=>r.id))
  const removed=current.records.filter(r=>!candidateIds.has(r.id))
  const introduced=candidate.records.filter(r=>!currentIds.has(r.id))
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="restore-dialog dialog-surface" role="dialog" aria-modal="true" aria-label="Review calendar restoration">
      <header className="editor-head"><div className="heading-inline"><DatabaseBackup size={20}/><h2>Review calendar restoration</h2></div>
        <button className="icon-button" aria-label="Close restoration" onClick={onClose}><X size={18}/></button></header>
      <p className="fine-print">Source: <strong>{origin}</strong>. Restore replaces this browser's complete Calendar dataset, not Folio or any original imported provider. No change is made until you confirm.</p>
      <div className="restore-compare">
        <section><h3>Saved now</h3>{unreadableCurrent?<><strong>Unreadable</strong><p>Current record counts unknown; raw bytes remain unchanged until confirmed repair.</p></>:
          <><strong>{current.records.length} record{current.records.length===1?'':'s'}</strong>
          <p>{before.personal} personal · {before.imported} imported</p>
          <p>{before.recurring} recurring series · {before.overrides} detached edits</p></>}</section>
        <section><h3>In proposed backup</h3><strong>{candidate.records.length} record{candidate.records.length===1?'':'s'}</strong>
          <p>{after.personal} personal · {after.imported} imported</p>
          <p>{after.recurring} recurring series · {after.overrides} detached edits</p></section>
      </div>
      <p className="restore-delta">{unreadableCurrent?'Current record differences unknown until repaired':introduced.length+' introduced record IDs · '+removed.length+' existing record IDs not in this backup.'}</p>
      {unreadableCurrent&&<p className="restore-corrupt" role="alert">The current local storage is unreadable. Repair keeps its exact original bytes in a separate raw rescue snapshot before applying the valid backup. Download that raw rescue afterward.</p>}
      <div className="restore-source-diff"><b>Imported snapshot sources</b>
        <p>Current: {unreadableCurrent?'Unknown (unreadable)':before.sources.join(', ')||'None'}</p>
        <p>Backup: {after.sources.join(', ')||'None'}</p></div>
      {!unreadableCurrent&&(removed.length>0||introduced.length>0)&&<div className="restore-samples">
        {removed.length>0&&<p>Not in backup: {removed.slice(0,4).map(r=>r.title).join(' · ')}{removed.length>4?' …':''}</p>}
        {introduced.length>0&&<p>Introduced: {introduced.slice(0,4).map(r=>r.title).join(' · ')}{introduced.length>4?' …':''}</p>}
      </div>}
      {onRecoverMissing&&!unreadableCurrent&&<section className="restore-additive" aria-label="Selective personal recovery">
        <h3>Recover missing personal events only</h3>
        <p className="fine-print">This alternative appends only personal records whose original IDs are absent on this device. Every existing event, imported snapshot and recurring source remains unchanged. It never adopts imported provider copies, and it cannot repair an unreadable original.</p>
        {missingReview.error?<p className="error" role="alert">Selective recovery unavailable: {missingReview.error}. Keep the original data and use the full restoration preview only if appropriate.</p>:
          missingReview.added.length===0?<p className="empty-note">No missing personal records in this backup.</p>:<>
            <p><strong>{missingReview.added.length} personal record{missingReview.added.length===1?'':'s'}</strong> can be recovered, including {missingReview.added.filter(r=>Boolean(r.recurrenceParentId)).length} detached occurrence edit(s).</p>
            <p className="fine-print">First entries: {missingReview.added.slice(0,4).map(r=>r.title).join(' · ')}{missingReview.added.length>4?' …':''}</p>
            <label className="restore-ack"><input type="checkbox" checked={confirmedMissing} onChange={e=>setConfirmedMissing(e.target.checked)}/>
              Append only these missing personal records; keep all currently saved and imported entries.</label>
            <button className="secondary" type="button" disabled={!confirmedMissing} onClick={onRecoverMissing}>
              Recover {missingReview.added.length} missing personal record{missingReview.added.length===1?'':'s'}
            </button>
          </>}
      </section>}
      <p className="readonly-note"><AlertTriangle size={15}/> Save a full JSON backup first if you need a durable copy. The app also maintains a single device-local previous-version checkpoint, which may be overwritten by later edits.</p>
      <label className="restore-ack"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
        I understand that restoring replaces this Calendar's locally saved events and imported copies.</label>
      <footer className="editor-actions">
        <button className="secondary" type="button" onClick={onClose}>Cancel</button>
        <button className="primary" type="button" disabled={!confirmed} onClick={onConfirm}>Restore this version</button></footer>
    </section>
  </div>
}
