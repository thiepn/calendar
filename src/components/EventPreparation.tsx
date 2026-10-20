import {useMemo,useState} from 'react'
import type {CalendarState} from '../types'
import {planPreparationBlocks,type PreparationAnchor,type PreparationOptions} from '../core/event-preparation'
import type {FreeSlot} from '../core/availability'

interface Props {
  state:CalendarState
  anchor:PreparationAnchor
  onPrepare:(slot:FreeSlot,options:PreparationOptions)=>void
  onClose:()=>void
  externalError?:string
}
const time=(iso:string)=>new Date(iso).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})
export function EventPreparation({state,anchor,onPrepare,onClose,externalError}:Props){
  const [lookback,setLookback]=useState<7|14>(7)
  const [sessions,setSessions]=useState<2|3|4|5|6>(3)
  const [duration,setDuration]=useState<30|60|90>(60)
  const [hours,setHours]=useState<'morning'|'afternoon'|'evening'>('afternoon')
  const [days,setDays]=useState<'all'|'weekdays'|'weekends'>('all')
  const [buffer,setBuffer]=useState<0|15|30>(15)
  const [blockAllDay,setBlockAllDay]=useState(true)
  const options:PreparationOptions={lookback,sessions,duration,hours,days,buffer,blockAllDay}
  const {plan,error}=useMemo(()=>{
    try{return {plan:planPreparationBlocks(state,anchor,options),error:''}}
    catch(e){return {plan:null,error:e instanceof Error?e.message:String(e)}}
  },[state,anchor,lookback,sessions,duration,hours,days,buffer,blockAllDay])
  return <div className="modal-backdrop preparation-backdrop">
    <section className="dialog-surface preparation-dialog" role="dialog" aria-modal="true"
      aria-label="Plan preparation before original event">
      <header className="editor-head">
        <h2>Plan preparation</h2>
        <button className="icon-button" type="button" aria-label="Close preparation planner" onClick={onClose}>×</button>
      </header>
      <div className="preparation-anchor">
        <strong>{anchor.item.title}</strong>
        <time dateTime={anchor.item.start}>
          {anchor.item.allDay?anchor.item.startDate:new Date(anchor.item.start).toLocaleString()}
          {anchor.item.source==='ics'?' · imported, read only':''}
        </time>
      </div>
      <div className="preparation-controls">
        <label>Look back<select aria-label="Preparation lookback days" value={lookback}
          onChange={e=>setLookback(Number(e.target.value) as 7|14)}>
          <option value={7}>7 days</option><option value={14}>14 days</option>
        </select></label>
        <label>Sessions<select aria-label="Preparation session goal" value={sessions}
          onChange={e=>setSessions(Number(e.target.value) as 2|3|4|5|6)}>
          {[2,3,4,5,6].map(n=><option key={n} value={n}>{n} sessions</option>)}
        </select></label>
        <label>Duration<select aria-label="Preparation duration" value={duration}
          onChange={e=>setDuration(Number(e.target.value) as 30|60|90)}>
          <option value={30}>30 minutes</option><option value={60}>60 minutes</option>
          <option value={90}>90 minutes</option>
        </select></label>
        <label>Hours<select aria-label="Preparation time window" value={hours}
          onChange={e=>setHours(e.target.value as 'morning'|'afternoon'|'evening')}>
          <option value="morning">07:00–12:00</option>
          <option value="afternoon">12:00–18:00</option>
          <option value="evening">17:00–23:00</option>
        </select></label>
        <label>Days<select aria-label="Preparation days" value={days}
          onChange={e=>setDays(e.target.value as 'all'|'weekdays'|'weekends')}>
          <option value="all">All days</option>
          <option value="weekdays">Weekdays</option>
          <option value="weekends">Weekends</option>
        </select></label>
        <label>Spacing<select aria-label="Preparation buffer minutes" value={buffer}
          onChange={e=>setBuffer(Number(e.target.value) as 0|15|30)}>
          <option value={0}>No buffer</option><option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
        </select></label>
      </div>
      <label className="preparation-all-day">
        <input type="checkbox" checked={blockAllDay} onChange={e=>setBlockAllDay(e.target.checked)}/>
        Exclude days with all-day commitments
      </label>
      {externalError&&<p role="alert" className="error">{externalError}</p>}
      {error&&<p role="alert" className="error">{error}</p>}
      {plan&&<>
        <p className="preparation-summary" role="status">
          {plan.shortfall===0?
            plan.requested+' sessions possible on separate dates':
            plan.possible+' of '+plan.requested+' sessions possible; '+plan.shortfall+' still unplanned'}
          {' · '}Before {plan.anchorDate}
        </p>
        <div className="preparation-days" aria-label="Original-source preparation opportunities">
          {plan.days.filter(x=>x.choices.length>0).map(day=>
            <article className="preparation-day" key={day.date}>
              <header><strong>{day.date}</strong>
                {day.recommended&&<span>Suggested day</span>}</header>
              <div className="preparation-slots">
                {day.choices.map(slot=><button type="button" className="secondary" key={slot.start}
                  aria-label={'Prepare a personal block '+day.date+' '+time(slot.start)}
                  onClick={()=>onPrepare(slot,options)}>
                  {time(slot.start)}–{time(slot.end)} <span>Use time</span>
                </button>)}
              </div>
            </article>)}
        </div>
        {plan.possible===0&&<p className="preparation-empty">
          No free preparation blocks before this event in the selected hours and dates.
          Change the window, duration or lookback.</p>}
        <p className="preparation-scope">
          All saved sources, including hidden imported commitments, are checked. Each
          choice opens an independent personal event draft for review; no preparation
          blocks are saved or reserved automatically.
        </p>
      </>}
      <footer className="editor-actions">
        <button className="secondary" type="button" onClick={onClose}>Return to event</button>
      </footer>
    </section>
  </div>
}
