import {useMemo,useState} from 'react'
import type {CalendarOccurrence,CalendarState} from '../types'
import {addDays} from '../core/dates'
import {reviewHubHandoff,type HubHandoffOptions} from '../core/ics'
import type {PersonalIcsPrivacy} from '../core/ics'

/** Verified main-branch landing routes only; none accepts calendar source IDs
 * or time state in a supported query protocol. */
export const OWNER_ROUTES={
  hub:'https://thiepn.dev/home/calendar/',
  study:'https://study.thiepn.dev/',
  folio:'https://thiepn.dev/folio/'
} as const

interface Props{
  state:CalendarState
  selectedDate:string
  occurrence:CalendarOccurrence|null
  onClose:()=>void
  onExport:(options:HubHandoffOptions)=>boolean
}
export function EcosystemHandoff({state,selectedDate,occurrence,onClose,onExport}:Props){
  const [scope,setScope]=useState<'instance'|'window'>(occurrence?'instance':'window')
  const [from,setFrom]=useState(occurrence?.date??selectedDate)
  const [through,setThrough]=useState(occurrence?.date??addDays(selectedDate,6))
  const [privacy,setPrivacy]=useState<PersonalIcsPrivacy>('titles')
  const [includeImported,setIncludeImported]=useState(false)
  const [ack,setAck]=useState(false)
  const [error,setError]=useState('')
  const options:HubHandoffOptions={from:scope==='instance'&&occurrence?occurrence.date:from,
    through:scope==='instance'&&occurrence?occurrence.date:through,privacy,includeImported,
    ...(scope==='instance'&&occurrence?{occurrenceKey:occurrence.key}:{})}
  const prepared=useMemo(()=>{
    try{return {review:reviewHubHandoff(state,options),error:''}}
    catch(error){return {review:null,error:error instanceof Error?error.message:String(error)}}
  },[state,options.from,options.through,options.privacy,options.includeImported,options.occurrenceKey])
  function exportReviewed(){
    if(!ack||!prepared.review)return
    try{
      if(!onExport(options))throw new Error('The calendar changed or export could not be completed')
      setError('')
    }catch(error){setError(String(error))}
  }
  const review=prepared.review
  return <div className="modal-backdrop ecosystem-handoff-backdrop">
    <section className="ecosystem-handoff dialog-surface" role="dialog" aria-modal="true"
      aria-label="Calendar ecosystem handoff">
      <header className="editor-head"><h2>Share calendar snapshot</h2>
        <button type="button" className="icon-button" aria-label="Close handoff" onClick={onClose}>×</button>
      </header>
      <fieldset className="handoff-scope"><legend>Original events</legend>
        {occurrence&&<label><input type="radio" name="handoff-scope" checked={scope==='instance'}
          onChange={()=>{setScope('instance');setAck(false)}}/> Selected occurrence</label>}
        <label><input type="radio" name="handoff-scope" checked={scope==='window'}
          onChange={()=>{setScope('window');setAck(false)}}/> Date range</label>
      </fieldset>
      {scope==='window'&&<div className="handoff-dates">
        <label>From<input type="date" aria-label="Handoff from date" value={from} onChange={event=>{
          setFrom(event.target.value);setAck(false)}}/></label>
        <label>Through<input type="date" aria-label="Handoff through date" value={through} onChange={event=>{
          setThrough(event.target.value);setAck(false)}}/></label>
      </div>}
      <div className="handoff-options">
        <label>Snapshot privacy
          <select aria-label="Handoff privacy" value={privacy} onChange={event=>{
            setPrivacy(event.target.value as PersonalIcsPrivacy);setAck(false)}}>
            <option value="busy">Busy only — no names or source IDs</option>
            <option value="titles">Event titles and original source IDs</option>
            <option value="details">Titles, locations, notes and original source IDs</option>
          </select>
        </label>
        <label className="handoff-check"><input type="checkbox" aria-label="Include imported read-only sources"
          checked={includeImported} onChange={event=>{setIncludeImported(event.target.checked);setAck(false)}}/>
          Include imported ICS events</label>
      </div>
      {review?<section className="handoff-review" aria-label="Handoff source preview">
        <strong>{review.count} original occurrence{review.count===1?'':'s'}</strong>
        <p>{review.personal} personal · {review.imported} imported · {review.from} → {review.through}</p>
        {privacy!=='busy'&&<p>Sources: {review.sources.join(', ')}</p>}
        <ol>{review.items.slice(0,8).map(item=><li key={item.key}>
          <span>{privacy==='busy'?'Busy':item.title}</span>
          <small>{item.allDay?item.startDate+' · all day':
            new Date(item.start).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}
            {item.source==='ics'?' · imported read-only':''}</small>
        </li>)}</ol>
        {review.count>8&&<p>{review.count-8} more events included</p>}
      </section>:<p role="alert" className="error">{prepared.error}</p>}
      <label className="handoff-check"><input type="checkbox" aria-label="Confirm read-only handoff"
        checked={ack} onChange={event=>setAck(event.target.checked)}/>
        Download this local .ics file for Hub's read-only external-calendar panel. Its preview expires
        after 24 hours. This does not connect accounts or change any app's calendar.</label>
      {error&&<p role="alert" className="error">{error}</p>}
      <div className="handoff-actions">
        <button className="primary" type="button" disabled={!ack||!review}
          onClick={exportReviewed}>Download reviewed snapshot</button>
        <a href={OWNER_ROUTES.hub} target="_blank" rel="noopener noreferrer">Open Hub calendar</a>
      </div>
      <section className="handoff-owner-links" aria-label="Original owner navigation">
        <div><strong>StudyOS</strong><p>Academic Calendar is owned by StudyOS and its authorized Google connection.
          No Calendar-file intake is verified there.</p>
          <a href={OWNER_ROUTES.study} target="_blank" rel="noopener noreferrer">Open StudyOS Today</a></div>
        <div><strong>Folio</strong><p>Folio owns its tasks and time blocks. Its ICS import creates
          separately confirmed Folio records, not a read-only connection.</p>
          <a href={OWNER_ROUTES.folio} target="_blank" rel="noopener noreferrer">Open Folio</a></div>
      </section>
      <footer className="editor-actions"><button type="button" className="secondary" onClick={onClose}>
        Return to Calendar</button></footer>
    </section>
  </div>
}
