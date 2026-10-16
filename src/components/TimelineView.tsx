import {useEffect,useRef,useState,type PointerEvent,type KeyboardEvent} from 'react'
import {AlertTriangle,GripHorizontal,Plus} from 'lucide-react'
import type {CalendarRecord,CalendarOccurrence,LocalDate} from '../types'
import {addDays,daysBetween,dateLabel,displayTime,localDate} from '../core/dates'
import {dayOccurrences} from '../core/occurrences'
import {layoutTimedDay,dayAxis,slotAt,TIMELINE_HOUR_HEIGHT,SLOT_MINUTES} from '../core/timeline'
import {nudgeTimed,type TimedAction} from '../core/reschedule'

type Props={days:LocalDate[];selected:LocalDate;records:CalendarRecord[];
  onSelect:(date:LocalDate)=>void;onOpen:(item:CalendarOccurrence)=>void;
  onSlot:(date:LocalDate,start:string,end:string)=>void;
  onAdjust:(item:CalendarOccurrence,action:TimedAction,date:LocalDate,minute:number,length:number)=>void;
  onAllDaySlot:(from:LocalDate,through:LocalDate)=>void;
  onAllDayAdjust:(item:CalendarOccurrence,from:LocalDate,through:LocalDate)=>void}
type Preview={date:LocalDate;minute:number;length:number;kind:'create'|'move'|'resize';label:string}
type Gesture={pointerId:number;kind:'create'|'move'|'resize'|'day-create'|'day-move';fromY:number;fromX:number;scrollTop:number;date:LocalDate;
  minute:number;length:number;item?:CalendarOccurrence;moved:boolean;preview:Preview|null;dayPreview?:{from:LocalDate;through:LocalDate}}
const durations=[30,60,90,120] as const
const snap=(value:number)=>Math.round(value/30)*30
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value))
const clock=(minute:number)=>String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0')
const eventLength=(event:CalendarOccurrence)=>Math.round((Date.parse(event.end)-Date.parse(event.start))/60000)
const eventMinute=(event:CalendarOccurrence,date:LocalDate)=>Math.max(0,Math.round((Date.parse(event.start)-dayAxis(date).start)/60000))
function slot(date:LocalDate,minute:number,duration:number){
  try{return slotAt(dayAxis(date),minute,duration)}catch{return null}
}
/** Pointer gestures are staged here, never mutate sources. App confirms canonical changes. */
export function TimelineView({days,selected,records,onSelect,onOpen,onSlot,onAdjust,onAllDaySlot,onAllDayAdjust}:Props){
  const scroll=useRef<HTMLDivElement>(null)
  const gesture=useRef<Gesture|null>(null)
  const suppressClick=useRef(false)
  const [preview,setPreview]=useState<Preview|null>(null)
  const [dayPreview,setDayPreview]=useState<{from:LocalDate;through:LocalDate}|null>(null)
  const [duration,setDuration]=useState<number>(60)
  const [touchDrag,setTouchDrag]=useState(false)
  const week=days.length>1
  useEffect(()=>{if(scroll.current)scroll.current.scrollTop=7*TIMELINE_HOUR_HEIGHT},[week])
  useEffect(()=>{
    if(!scroll.current||!week)return
    const index=days.indexOf(selected)
    if(index>=0)scroll.current.scrollLeft=Math.max(0,index*172)
  },[selected,week,days])
  function dateAtX(clientX:number):LocalDate|null {
    const columns=scroll.current?.querySelectorAll<HTMLElement>('.timeline-day')
    if(!columns)return null
    for(let i=0;i<columns.length;i++){
      const bounds=columns[i].getBoundingClientRect()
      if(clientX>=bounds.left&&clientX<bounds.right)return days[i]??null
    }
    return null
  }
  function begin(event:PointerEvent<HTMLElement>,kind:Gesture['kind'],date:LocalDate,
    minute:number,length:number,item?:CalendarOccurrence){
    if(event.button!==0||(event.pointerType==='touch'&&!touchDrag))return
    suppressClick.current=false
    gesture.current={pointerId:event.pointerId,kind,fromY:event.clientY,fromX:event.clientX,scrollTop:scroll.current?.scrollTop??0,
      date,minute,length,item,moved:false,preview:null}
    event.currentTarget.setPointerCapture(event.pointerId)
    if(event.pointerType==='mouse')event.preventDefault()
    event.stopPropagation()
  }
  function movePointer(event:PointerEvent<HTMLElement>){
    const active=gesture.current
    if(!active||active.pointerId!==event.pointerId)return
    const scroller=scroll.current
    if(scroller){
      const rect=scroller.getBoundingClientRect()
      if(event.clientX>rect.right-25)scroller.scrollLeft+=17
      if(event.clientX<rect.left+25)scroller.scrollLeft-=17
      if(active.kind!=='day-create'&&active.kind!=='day-move'){
        if(event.clientY>rect.bottom-30)scroller.scrollTop+=13
        if(event.clientY<rect.top+95)scroller.scrollTop-=13
      }
    }
    const dy=event.clientY-active.fromY+((scroller?.scrollTop??0)-active.scrollTop)
    const selectedDate=active.kind==='move'||active.kind==='day-create'||active.kind==='day-move'
      ?dateAtX(event.clientX)??active.date:active.date
    if(Math.abs(dy)<10&&Math.abs(event.clientX-active.fromX)<14&&!active.moved)return
    active.moved=true
    if(active.kind==='day-create'||active.kind==='day-move'){
      const from=active.kind==='day-create'?(active.date<selectedDate?active.date:selectedDate):
        addDays(active.item!.startDate,daysBetween(active.date,selectedDate))
      const through=active.kind==='day-create'?(active.date>selectedDate?active.date:selectedDate):
        addDays(active.item!.endDateExclusive,daysBetween(active.date,selectedDate)-1)
      active.dayPreview={from,through}
      setDayPreview({from,through})
      return
    }
    const delta=snap(dy/TIMELINE_HOUR_HEIGHT*60)
    let minute=active.minute
    let length=active.length
    if(active.kind==='create'){
      const endpoint=clamp(active.minute+30+delta,0,1440)
      minute=clamp(Math.min(active.minute,endpoint-30),0,1410)
      length=clamp(Math.abs(endpoint-active.minute),30,240)
      length=Math.min(length,1440-minute)
    }else if(active.kind==='move'){
      minute=clamp(active.minute+delta,0,1439)
    }else{
      length=clamp(active.length+delta,15,1440)
    }
    const visual:Preview={date:selectedDate,minute,length,kind:active.kind,
      label:active.kind==='create'?'New event':active.item?.title??'Event'}
    active.preview=visual
    setPreview(visual)
  }
  function endPointer(event:PointerEvent<HTMLElement>){
    const active=gesture.current
    if(!active||active.pointerId!==event.pointerId)return
    gesture.current=null
    setPreview(null);setDayPreview(null)
    if(!active.moved)return
    if(active.dayPreview){
      suppressClick.current=true
      if(active.kind==='day-create')onAllDaySlot(active.dayPreview.from,active.dayPreview.through)
      else if(active.item)onAllDayAdjust(active.item,active.dayPreview.from,active.dayPreview.through)
      return
    }
    if(!active.preview)return
    suppressClick.current=true
    const result=active.preview
    if(active.kind==='create'){
      const range=slot(result.date,result.minute,result.length)
      if(range)onSlot(result.date,range.start,range.end)
    }else if(active.item&&(active.kind==='move'||active.kind==='resize')){
      onAdjust(active.item,active.kind,result.date,result.minute,result.length)
    }
  }
  function keyNudge(event:KeyboardEvent<HTMLButtonElement>,item:CalendarOccurrence){
    if(item.source!=='personal'||!event.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return
    const action=event.key==='ArrowUp'?(event.shiftKey?'shorter':'earlier'):
      event.key==='ArrowDown'?(event.shiftKey?'longer':'later'):
      event.key==='ArrowLeft'?'previous-day':'next-day'
    event.preventDefault();event.stopPropagation()
    try{
      const update=nudgeTimed(item,item.date,action)
      onAdjust(item,update.kind,update.date,update.minute,update.length)
    }catch{
      // Invalid movements are declined; users can enter an exact value in the details editor.
    }
  }
  const axes=days.map(dayAxis)
  const height=Math.max(...axes.map(a=>a.minutes))/60*TIMELINE_HOUR_HEIGHT
  return <section className={'timeline-view '+(touchDrag?'timeline-touch-drag':'')} aria-label={week?'Graphical weekly schedule':'Graphical daily schedule'}
    onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={()=>{gesture.current=null;setPreview(null);setDayPreview(null)}}>
    <div className="timeline-tools">
      <p>Drag timed slots to create/move/resize. In the all-day row, drag across days to create a multi-day event or move a personal all-day event. Saves require confirmation.</p>
      <div className="timeline-controls">
        <label>Slot length <select aria-label="New event duration" value={duration} onChange={event=>setDuration(Number(event.target.value))}>
          {durations.map(value=><option value={value} key={value}>{value} min</option>)}
        </select></label>
        <label className="timeline-touch-toggle"><input type="checkbox" checked={touchDrag} onChange={event=>setTouchDrag(event.target.checked)}/>
          Touch drag mode</label>
      </div>
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
              return <div className={'timeline-all-day-col '+(dayPreview&&date>=dayPreview.from&&date<=dayPreview.through?'is-preview':'')} key={date}>
                <button type="button" className="timeline-all-day-create" aria-label={'Plan all-day event on '+date}
                  onPointerDown={e=>begin(e,'day-create',date,0,0)}
                  onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}onAllDaySlot(date,date)}}><Plus size={12} aria-hidden="true"/> All day</button>
                {events.map(item=><button key={item.key} className={'timeline-all-day-event '+(item.source==='ics'?'imported':'')}
                  type="button" onPointerDown={e=>{if(item.source==='personal')begin(e,'day-move',date,0,0,item)}}
                  onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}onOpen(item)}}
                  title={item.source==='ics'?'Read-only imported event':'Drag across days to move; select for date editor'}>{item.title}</button>)}
                {dayPreview&&date>=dayPreview.from&&date<=dayPreview.through&&<span className="timeline-all-day-preview">{dayPreview.from} → {dayPreview.through}</span>}
              </div>
            })}
          </div>
        </div>
        <div className="timeline-main">
          <div className="timeline-hour-labels" aria-hidden="true" style={{height}}>
            {axes[0].hours.map(h=><span key={h.minute} style={{top:h.minute/60*TIMELINE_HOUR_HEIGHT}}>{h.label}{h.repeated?' '+h.offset:''}</span>)}
          </div>
          {days.map(date=>{
            const axis=dayAxis(date)
            const blocks=layoutTimedDay(dayOccurrences(records,date),date)
            return <div key={date} className={'timeline-day '+(date===localDate()?'is-today':'')} style={{height:axis.minutes/60*TIMELINE_HOUR_HEIGHT}}>
              {axis.hours.filter(h=>h.repeated).map(h=><span key={h.minute} className="timeline-dst-marker"
                style={{top:h.minute/60*TIMELINE_HOUR_HEIGHT}}>{h.label} {h.offset}</span>)}
              {axis.slots.map(({minute,label,offset,repeated})=>{
                const available=slot(date,minute,duration)
                return <button key={minute} type="button" className="timeline-slot"
                  style={{top:minute/60*TIMELINE_HOUR_HEIGHT,height:SLOT_MINUTES/60*TIMELINE_HOUR_HEIGHT}}
                  disabled={!available}
                  aria-label={available?'Plan '+duration+' minute event on '+dateLabel(date,{weekday:'long',month:'short',day:'numeric'})+' at '+label+(repeated?' '+offset:''):'Unavailable local time '+label}
                  title={available?'New event · '+label+(repeated?' '+offset:''):'Invalid local time'}
                  onPointerDown={event=>{if(available)begin(event,'create',date,minute,duration)}}
                  onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}if(available)onSlot(date,available.start,available.end)}}
                  ><Plus size={13} aria-hidden="true"/></button>
              })}
              {blocks.map(block=>{
                const {occurrence,lane,lanes,overlaps,startMinute,endMinute}=block
                const width=100/lanes
                const editable=occurrence.source==='personal'
                return <div key={occurrence.key} className="timeline-event-frame"
                  style={{top:startMinute/60*TIMELINE_HOUR_HEIGHT+1,
                    height:Math.max(19,Math.min(axis.minutes,endMinute)-startMinute)/60*TIMELINE_HOUR_HEIGHT-2,
                    left:'calc(34px + (100% - 38px) * '+(lane/lanes)+')',width:'calc((100% - 38px) * '+(width/100)+' - 4px)'}}>
                  <button type="button"
                    className={'timeline-block '+(occurrence.source==='ics'?'imported ':'')+(overlaps?'overlap':'')}
                    aria-label={occurrence.title+', '+displayTime(occurrence.start)+' to '+displayTime(occurrence.end)+(overlaps?', overlapping event':'')}
                    title={editable?'Drag to move · Alt+arrows to move · Alt+Shift+vertical arrows to resize':'Imported snapshot — read only'}
                    onPointerDown={event=>{if(editable)begin(event,'move',date,eventMinute(occurrence,date),eventLength(occurrence),occurrence)}}
                    onKeyDown={event=>keyNudge(event,occurrence)}
                    onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}onOpen(occurrence)}}>
                    <strong>{occurrence.title}</strong>
                    <span>{displayTime(occurrence.start)} – {displayTime(occurrence.end)}</span>
                    {overlaps&&<AlertTriangle size={12} aria-label="Overlap" />}
                  </button>
                  {editable&&<button type="button" className="timeline-resize-handle"
                    aria-label={'Resize '+occurrence.title}
                    title="Drag to resize · Alt+Shift+Up/Down"
                    onPointerDown={event=>{event.stopPropagation();begin(event,'resize',date,eventMinute(occurrence,date),eventLength(occurrence),occurrence)}}
                    onKeyDown={event=>keyNudge(event,occurrence)}
                    onClick={()=>{if(suppressClick.current){suppressClick.current=false;return}onOpen(occurrence)}}>
                    <GripHorizontal size={12} aria-hidden="true"/></button>}
                </div>
              })}
              {preview?.date===date&&<div className="timeline-gesture-preview"
                style={{top:preview.minute/60*TIMELINE_HOUR_HEIGHT,
                  height:Math.max(30,preview.length)/60*TIMELINE_HOUR_HEIGHT}}>
                <strong>{preview.label}</strong><span>{clock(preview.minute)} · {preview.length} min</span>
              </div>}
            </div>
          })}
        </div>
      </div>
    </div>
    <div className="timeline-footer">
      Keyboard: focus a personal event, Alt+↑/↓ moves 30 min; Alt+←/→ moves one day; Alt+Shift+↑/↓ resizes 30 min.
      Touch drag mode disables native panning on selectable event surfaces; switch it off to scroll normally. Drag toward the timeline edges to scroll.
      Times are in {Intl.DateTimeFormat().resolvedOptions().timeZone}. Spring gaps are omitted; the repeated autumn hour has separate labelled ISO-backed rows.
    </div>
  </section>
}
