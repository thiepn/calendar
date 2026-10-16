import {useEffect,useRef,useState} from 'react'
import {AlertTriangle,Plus} from 'lucide-react'
import type {CalendarRecord,CalendarOccurrence,LocalDate} from '../types'
import {dateLabel,displayTime,localDate} from '../core/dates'
import {dayOccurrences} from '../core/occurrences'
import {layoutTimedDay,slotRange,TIMELINE_HOUR_HEIGHT,SLOT_MINUTES} from '../core/timeline'

type Props={days:LocalDate[];selected:LocalDate;records:CalendarRecord[];
  onSelect:(date:LocalDate)=>void;onOpen:(item:CalendarOccurrence)=>void;
  onSlot:(date:LocalDate,start:string,end:string)=>void}
const durations=[30,60,90,120] as const
const label=(minute:number)=>String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0')
function slot(date:LocalDate,minute:number,duration:number){
  try{return slotRange(date,minute,duration)}catch{return null}
}
/** Explicit half-hour buttons work with mouse, touch and keyboard without drag-only controls. */
export function TimelineView({days,selected,records,onSelect,onOpen,onSlot}:Props){
  const scroll=useRef<HTMLDivElement>(null)
  const [duration,setDuration]=useState<number>(60)
  const week=days.length>1
  useEffect(()=>{if(scroll.current)scroll.current.scrollTop=7*TIMELINE_HOUR_HEIGHT},[week])
  useEffect(()=>{
    if(!scroll.current||!week)return
    const index=days.indexOf(selected)
    if(index>=0)scroll.current.scrollLeft=Math.max(0,index*172)
  },[selected,week,days])
  const height=24*TIMELINE_HOUR_HEIGHT
  return <section className="timeline-view" aria-label={week?'Graphical weekly schedule':'Graphical daily schedule'}>
    <div className="timeline-tools"><p>Select a time to plan an event. Overlapping events appear side by side; imported events are read-only.</p>
      <label>Slot length <select aria-label="New event duration" value={duration} onChange={e=>setDuration(Number(e.target.value))}>
        {durations.map(value=><option value={value} key={value}>{value} min</option>)}
      </select></label>
    </div>
    <div className="timeline-scroll" ref={scroll} aria-label="Scroll calendar hours and days" tabIndex={0}>
      <div className={'timeline-page '+(week?'timeline-week':'timeline-single')} style={{minWidth:week?(60+days.length*172)+'px':'100%'}}>
        <div className="timeline-sticky">
          <div className="timeline-day-heads">
            <div className="timeline-gutter" aria-hidden="true">Local</div>
            {days.map(date=><button type="button" key={date} className={'timeline-day-head '+(date===selected?'is-selected ':'')+(date===localDate()?'is-today':'')}
              onClick={()=>onSelect(date)} aria-label={'Select '+dateLabel(date,{weekday:'long',month:'long',day:'numeric'})}>
              <span>{dateLabel(date,{weekday:'short'})}</span><strong>{Number(date.slice(-2))}</strong>
            </button>)}
          </div>
          <div className="timeline-all-day">
            <span className="timeline-all-day-label">All day</span>
            {days.map(date=>{
              const events=dayOccurrences(records,date).filter(item=>item.allDay)
              return <div className="timeline-all-day-col" key={date}>
                {events.map(item=><button key={item.key} className={'timeline-all-day-event '+(item.source==='ics'?'imported':'')}
                  type="button" onClick={()=>onOpen(item)} title={item.title}>{item.title}</button>)}
                {!events.length&&<span className="timeline-all-day-empty">—</span>}
              </div>
            })}
          </div>
        </div>
        <div className="timeline-main">
          <div className="timeline-hour-labels" aria-hidden="true" style={{height}}>
            {Array.from({length:24},(_,i)=><span key={i} style={{top:i*TIMELINE_HOUR_HEIGHT}}>{label(i*60)}</span>)}
          </div>
          {days.map(date=>{
            const blocks=layoutTimedDay(dayOccurrences(records,date),date)
            return <div key={date} className={'timeline-day '+(date===localDate()?'is-today':'')} style={{height}}>
              {Array.from({length:1440/SLOT_MINUTES},(_,index)=>{
                const minute=index*SLOT_MINUTES
                const available=slot(date,minute,duration)
                return <button key={minute} type="button" className="timeline-slot"
                  style={{top:minute/60*TIMELINE_HOUR_HEIGHT,height:SLOT_MINUTES/60*TIMELINE_HOUR_HEIGHT}}
                  disabled={!available}
                  aria-label={available?'Plan '+duration+' minute event on '+dateLabel(date,{weekday:'long',month:'short',day:'numeric'})+' at '+label(minute):'Unavailable local time '+label(minute)}
                  title={available?'New event · '+label(minute):'This local time does not exist'}
                  onClick={()=>{if(available)onSlot(date,available.start,available.end)}}><Plus size={13} aria-hidden="true"/></button>
              })}
              {blocks.map(block=>{
                const {occurrence,lane,lanes,overlaps,startMinute,endMinute}=block
                const width=100/lanes
                return <button key={occurrence.key} type="button"
                  className={'timeline-block '+(occurrence.source==='ics'?'imported ':'')+(overlaps?'overlap':'')}
                  style={{top:startMinute/60*TIMELINE_HOUR_HEIGHT+1,
                    height:Math.max(19,Math.min(1440,endMinute)-startMinute)/60*TIMELINE_HOUR_HEIGHT-2,
                    left:'calc('+(lane*width)+'% + 3px)',width:'calc('+width+'% - 6px)'}}
                  aria-label={occurrence.title+', '+displayTime(occurrence.start)+' to '+displayTime(occurrence.end)+(overlaps?', overlapping event':'')}
                  onClick={()=>onOpen(occurrence)}>
                  <strong>{occurrence.title}</strong>
                  <span>{displayTime(occurrence.start)} – {displayTime(occurrence.end)}</span>
                  {overlaps&&<AlertTriangle size={12} aria-label="Overlap" />}
                </button>
              })}
            </div>
          })}
        </div>
      </div>
    </div>
    <div className="timeline-footer">Local device time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Select an event to edit it. Week columns scroll horizontally on narrow screens.</div>
  </section>
}
