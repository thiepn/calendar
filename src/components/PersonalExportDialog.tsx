import {useMemo,useState} from 'react'
import {Download,ShieldCheck,X} from 'lucide-react'
import type {CalendarState,LocalDate} from '../types'
import {addDays,dateLabel} from '../core/dates'
import {reviewPersonalExport,type ReviewedPersonalExportOptions} from '../core/personal-export'
import type {PersonalIcsPrivacy} from '../core/ics'

export function PersonalExportDialog({state,selected,onClose,onExport}:{
  state:CalendarState
  selected:LocalDate
  onClose:()=>void
  onExport:(options:ReviewedPersonalExportOptions)=>void
}){
  const [from,setFrom]=useState(selected)
  const [through,setThrough]=useState(()=>addDays(selected,30))
  const [privacy,setPrivacy]=useState<PersonalIcsPrivacy>('busy')
  const [includeReminders,setIncludeReminders]=useState(false)
  const options:ReviewedPersonalExportOptions={from,through,privacy,includeReminders}
  const preview=useMemo(()=>{
    try{return {value:reviewPersonalExport(state,options),error:''}}
    catch(error){return {value:null,error:error instanceof Error?error.message:String(error)}}
  },[state,from,through,privacy,includeReminders])
  const selected=preview.value
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section className="personal-export-dialog dialog-surface" role="dialog" aria-modal="true"
      aria-label="Personal ICS export review">
      <header className="editor-head">
        <div className="heading-inline"><ShieldCheck size={19}/><h2>Review personal calendar export</h2></div>
        <button type="button" className="icon-button" aria-label="Close personal export" onClick={onClose}><X size={18}/></button>
      </header>
      <p className="fine-print">
        Make a finite ICS snapshot for another calendar. No download occurs until you review and select Download.
        <strong> Only original personal events</strong> are included — never read-only imported calendars,
        even when their source is visible. This is not a full recovery backup or live synchronization.
      </p>
      <div className="personal-export-range">
        <label>From date
          <input aria-label="ICS export from date" type="date" value={from} onChange={event=>setFrom(event.target.value)}/>
        </label>
        <label>Through date (inclusive)
          <input aria-label="ICS export through date" type="date" value={through}
            onChange={event=>setThrough(event.target.value)}/>
        </label>
      </div>
      <p className="fine-print">Choose any contiguous 1–366-day date window. Repeating personal events are expanded into independent occurrences; events outside this window do not appear in the ICS. For complete device recovery, use the full JSON backup instead.</p>
      <fieldset className="personal-export-levels">
        <legend>Information to share</legend>
        <label><input type="radio" name="personal-ics-privacy" checked={privacy==='busy'}
            onChange={()=>{setPrivacy('busy');setIncludeReminders(false)}}/>
          <span><strong>Busy only — default</strong><small>Share occupied dates/times without titles, descriptions, locations or alerts. Fresh opaque event IDs each export.</small></span>
        </label>
        <label><input type="radio" name="personal-ics-privacy" checked={privacy==='titles'}
            onChange={()=>{setPrivacy('titles');setIncludeReminders(false)}}/>
          <span><strong>Event titles</strong><small>Include titles and calendar times, but not descriptions, locations or reminder alarms.</small></span>
        </label>
        <label><input type="radio" name="personal-ics-privacy" checked={privacy==='details'}
            onChange={()=>setPrivacy('details')}/>
          <span><strong>Full event details</strong><small>Include original titles, descriptions and locations. These may contain private information.</small></span>
        </label>
      </fieldset>
      {privacy==='details'&&<label className="personal-export-alarm">
        <input type="checkbox" aria-label="Include reminder alarms in ICS"
          checked={includeReminders} onChange={event=>setIncludeReminders(event.target.checked)}/>
        Include reminder alarms (off by default; recipient devices may display event details)
      </label>}
      <section className="personal-export-preview" aria-label="Personal ICS export contents">
        <header><strong>Export contents</strong>{selected&&<small>{dateLabel(from,{month:'short',day:'numeric',year:'numeric'})} to {dateLabel(through,{month:'short',day:'numeric',year:'numeric'})}</small>}</header>
        {preview.error?<p className="error" role="alert">Export unavailable: {preview.error}</p>:
          selected?<><div className="personal-export-counts">
            <strong>{selected.total} personal occurrence{selected.total===1?'':'s'}</strong>
            <span>{selected.allDayInstances} all-day · {selected.timedInstances} timed · {selected.recurringInstances} expanded repeat{selected.recurringInstances===1?'':'s'}</span>
            <small>{selected.importedExcluded} imported record{selected.importedExcluded===1?'':'s'} excluded ·
              {includeReminders?' '+selected.reminderInstances+' personal alarm(s) eligible':' no reminder alarms'}</small>
          </div>
          <div className="personal-export-items">
            {selected.occurrences.slice(0,6).map(item=><div key={item.key}>
              <time dateTime={item.startDate}>{dateLabel(item.startDate,{month:'short',day:'numeric',year:'numeric'})}</time>
              <span>{privacy==='busy'?'Busy':item.title}</span>
              <small>{item.allDay?'All day':new Date(item.start).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</small>
            </div>)}
            {selected.total>6&&<p className="fine-print">And {selected.total-6} more personal occurrence(s) within this window.</p>}
            {selected.total===0&&<p className="empty-note">No personal events in this date window. Adjust the range before downloading.</p>}
          </div>
          </>:null}
      </section>
      <p className="fine-print">Busy-only downloads use fresh opaque UIDs, so importing multiple separate copies may duplicate appointments. Title/full exports retain stable source identities for repeat downloads. No information leaves this device until you choose the file destination or share it yourself.</p>
      <footer className="editor-actions">
        <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" disabled={!selected||selected.total===0}
          onClick={()=>onExport(options)}><Download size={15}/> Download reviewed personal ICS</button>
      </footer>
    </section>
  </div>
}
