import {useMemo,useState} from 'react'
import type {CalendarRecord,LocalDate} from '../types'
import {day,localDate} from '../core/dates'
import {planWeeklyMeeting,type WeeklyCandidate,type WeeklyPlanOptions} from '../core/weekly-planner'

interface Props {
  records:CalendarRecord[]
  hiddenSources:readonly string[]
  initialDate:LocalDate
  onSelect:(options:WeeklyPlanOptions,clock:string)=>void
  onClose:()=>void
}
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
export function WeeklySeriesPlanner({records,hiddenSources,initialDate,onSelect,onClose}:Props){
  const [from,setFrom]=useState(initialDate<localDate()?localDate():initialDate)
  const [weekday,setWeekday]=useState(()=>day(initialDate<localDate()?localDate():initialDate).getDay())
  const [weeks,setWeeks]=useState<4|8>(4)
  const [duration,setDuration]=useState<30|60|90>(60)
  const [window,setWindow]=useState<'daytime'|'evening'>('daytime')
  const [buffer,setBuffer]=useState<0|15|30>(15)
  const [blockAllDay,setBlockAllDay]=useState(true)
  const [expanded,setExpanded]=useState<string|null>(null)
  const [revealHidden,setRevealHidden]=useState(false)
  const options:WeeklyPlanOptions={from,weekday,weeks,duration,window,buffer,blockAllDay}
  const {review,error}=useMemo(()=>{
    try{return {review:planWeeklyMeeting(records,options,hiddenSources),error:''}}
    catch(e){return {review:null,error:e instanceof Error?e.message:String(e)}}
  // Recomputing after a source update is critical, but these are only UI
  // selections: no custom scheduler or persistence is created.
  },[records,hiddenSources,from,weekday,weeks,duration,window,buffer,blockAllDay])
  function blockerText(blocker:WeeklyCandidate['meetings'][number]['blockers'][number]){
    return blocker.hidden&&!revealHidden?'Hidden imported commitment':
      blocker.title+' ('+(blocker.source==='personal'?'Personal':blocker.sourceCalendar??'Imported')+')'
  }
  return <div className="modal-backdrop weekly-plan-backdrop">
    <section className="dialog-surface weekly-plan-dialog" role="dialog" aria-modal="true"
      aria-label="Plan a weekly recurring meeting">
      <header className="editor-head"><h2>Plan a weekly series</h2>
        <button type="button" className="icon-button" aria-label="Close weekly planner" onClick={onClose}>×</button>
      </header>
      <div className="weekly-plan-controls">
        <label>From<input aria-label="Weekly planner start date" type="date"
          min={localDate()} value={from} onChange={e=>{setFrom(e.target.value);setExpanded(null)}}/></label>
        <label>Day<select aria-label="Weekly planner weekday" value={weekday}
          onChange={e=>{setWeekday(Number(e.target.value));setExpanded(null)}}>
          {weekdays.map((name,i)=><option key={i} value={i}>{name}</option>)}
        </select></label>
        <label>Length<select aria-label="Weekly planner weeks" value={weeks}
          onChange={e=>{setWeeks(Number(e.target.value) as 4|8);setExpanded(null)}}>
          <option value={4}>4 weeks</option><option value={8}>8 weeks</option>
        </select></label>
        <label>Duration<select aria-label="Weekly planner duration" value={duration}
          onChange={e=>{setDuration(Number(e.target.value) as 30|60|90);setExpanded(null)}}>
          <option value={30}>30 minutes</option><option value={60}>60 minutes</option>
          <option value={90}>90 minutes</option>
        </select></label>
        <label>Hours<select aria-label="Weekly planner hours" value={window}
          onChange={e=>{setWindow(e.target.value as 'daytime'|'evening');setExpanded(null)}}>
          <option value="daytime">08:00–19:00</option><option value="evening">17:00–23:00</option>
        </select></label>
        <label>Spacing<select aria-label="Weekly planner spacing" value={buffer}
          onChange={e=>{setBuffer(Number(e.target.value) as 0|15|30);setExpanded(null)}}>
          <option value={0}>No buffer</option><option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
        </select></label>
      </div>
      <label className="weekly-plan-all-day"><input type="checkbox" checked={blockAllDay}
        onChange={e=>{setBlockAllDay(e.target.checked);setExpanded(null)}}/>
        Treat all-day events as unavailable</label>
      {error&&<p className="error" role="alert">{error}</p>}
      {review&&<>
        <p className="weekly-plan-total" role="status">
          {review.fullyAvailable} times free for all {review.weeks} weeks ·
          {review.dates[0]} – {review.until}
        </p>
        <div className="weekly-plan-candidates">
          {review.candidates.map(candidate=><article key={candidate.clock} className="weekly-plan-candidate">
            <div className="weekly-plan-row">
              <div><strong>{candidate.clock}</strong><span>{candidate.available}/{weeks} weeks available</span></div>
              <div className="weekly-plan-actions">
                <button className="secondary" type="button" aria-expanded={expanded===candidate.clock}
                  aria-label={'Review weeks at '+candidate.clock}
                  onClick={()=>setExpanded(x=>x===candidate.clock?null:candidate.clock)}>Review weeks</button>
                <button className="primary" type="button" disabled={!candidate.fullyAvailable}
                  aria-label={'Plan weekly series at '+candidate.clock}
                  onClick={()=>onSelect(options,candidate.clock)}>Plan series</button>
              </div>
            </div>
            {expanded===candidate.clock&&<div className="weekly-plan-weeks" aria-label={'Original weekly checks at '+candidate.clock}>
              {candidate.meetings.map(meeting=><div key={meeting.date} className="weekly-plan-week">
                <strong>{meeting.date}</strong>
                {meeting.clockUnavailable?<span>Local clock unavailable or time already passed</span>:
                  meeting.blockers.length===0?<span>Free</span>:<span>{meeting.blockers.length} blocking commitment{meeting.blockers.length===1?'':'s'}</span>}
                {meeting.blockers.length>0&&<ul>{meeting.blockers.map(blocker=>
                  <li key={blocker.key}>{blockerText(blocker)}</li>)}</ul>}
              </div>)}
              {candidate.meetings.some(x=>x.blockers.some(b=>b.hidden))&&
                <label className="weekly-plan-reveal"><input type="checkbox" checked={revealHidden}
                  onChange={e=>setRevealHidden(e.target.checked)}/>
                  Reveal hidden imported calendar names in this review</label>}
            </div>}
          </article>)}
        </div>
        <p className="weekly-plan-scope">All saved calendars were checked, including hidden imports. Transparent events do not block time. Only fully free times can open a weekly event draft; saving remains a separate step.</p>
      </>}
      <footer className="editor-actions">
        <button className="secondary" type="button" onClick={onClose}>Return to Calendar</button>
      </footer>
    </section>
  </div>
}
