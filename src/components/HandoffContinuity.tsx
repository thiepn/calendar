import type {CalendarState} from '../types'
import type {HandoffReceipt} from '../core/handoff-continuity'
import {resolveHandoffOrigin} from '../core/handoff-continuity'

interface Props {
  receipt:HandoffReceipt
  calendar:CalendarState
  onLocate:(key:string)=>void
  onClear:()=>void
}
export function HandoffContinuity({receipt,calendar,onLocate,onClear}:Props){
  return <section className="handoff-continuity" aria-label="Last shared Calendar snapshot">
    <header className="handoff-continuity-heading">
      <h3>Last downloaded snapshot</h3>
      <button type="button" className="secondary" onClick={onClear}>Clear history</button>
    </header>
    <p><strong>{receipt.filename}</strong></p>
    <p>{receipt.count} events · {receipt.from} – {receipt.through} · {receipt.privacy} ·
      downloaded {new Date(receipt.exportedAt).toLocaleString()}</p>
    <p>Hub may show {receipt.estimatedHubVisible} of these in its current seven-day view
      using this device's {receipt.viewerZone} timezone. Its own timezone and filters can differ.</p>
    <p>Downloaded locally. Not uploaded to Hub; no import confirmation is available.</p>
    <div className="handoff-continuity-events">
      {receipt.owners.slice(0,30).map((source,index)=>{
        const result=resolveHandoffOrigin(calendar,source)
        return <div className="handoff-continuity-row" key={source.key}>
          <div>
            <strong>{index+1}. {source.title}</strong>
            <span>{source.date} · {source.source==='personal'?'Personal':'Imported · '+source.sourceCalendar}</span>
            {result.status!=='exact'&&<span role="status">
              {result.status==='changed'?'Original changed since download':'Original is no longer in this Calendar'}
            </span>}
          </div>
          <button type="button" className="secondary" disabled={!result.current}
            aria-label={'Locate original '+source.title}
            onClick={()=>onLocate(source.key)}>
            {result.status==='changed'?'Inspect changed original':'Locate original'}
          </button>
        </div>
      })}
      {receipt.owners.length>30&&<p>{receipt.owners.length-30} additional original events were included</p>}
    </div>
  </section>
}
