import {useMemo} from 'react'
import {CalendarDays,ChevronRight,Clock3} from 'lucide-react'
import type {CalendarOccurrence,CalendarRecord,LocalDate} from '../types'
import {dateLabel,displayTime} from '../core/dates'
import {nowNextVisible,type NowNextEntry} from '../core/now-next'

type Props={records:CalendarRecord[];nowIso:string;onOpen:(item:CalendarOccurrence)=>void;
  onShowDay:(date:LocalDate)=>void;hasQuery:boolean}
const dateOf=(entry:NowNextEntry,nowDate:LocalDate)=>{
  const x=entry.item
  return x.allDay?x.startDate:
    entry.phase==='happening'?nowDate:x.date
}
function EventLink({entry,today,onOpen,onShowDay}:{
  entry:NowNextEntry;today:LocalDate;onOpen:(x:CalendarOccurrence)=>void;onShowDay:(d:LocalDate)=>void
}){
  const {item,phase}=entry
  const date=dateOf(entry,today)
  const time=phase==='happening'?'Until '+displayTime(item.end):
    phase==='all-day-today'?'All day today':
    item.allDay?'All day · '+dateLabel(item.startDate,{weekday:'short',month:'short',day:'numeric'}):
    dateLabel(item.date,{weekday:'short',month:'short',day:'numeric'})+' · '+displayTime(item.start)
  return <div className={'now-next-event '+(item.source==='ics'?'imported':'')}>
    <div className="now-next-event-main">
      <span className="now-next-time">{time}</span>
      <strong>{item.title}</strong>
      <small>{item.source==='ics'?'Imported · read only':'Personal'}
        {item.transparent?' · Free (non-blocking)':''}
        {item.startDate<today&&phase!=='upcoming'?' · Continues from earlier date':''}</small>
    </div>
    <div className="now-next-event-actions">
      <button className="secondary compact" type="button" aria-label={'Open details '+item.key}
        onClick={()=>onOpen(item)}>Details <ChevronRight size={13}/></button>
      <button className="secondary compact" type="button" aria-label={'Open day for '+item.key}
        onClick={()=>onShowDay(date)}>Day</button>
    </div>
  </div>
}
export function NowNext({records,nowIso,onOpen,onShowDay,hasQuery}:Props){
  const result=useMemo(()=>nowNextVisible(records,nowIso),[records,nowIso])
  const empty=!result.happeningCount&&!result.upcomingCount&&!result.allDayTodayCount
  return <section className="now-next-panel" aria-label="Now and next visible calendar events">
    <header className="now-next-header">
      <div><h3><Clock3 size={16}/> Now & next</h3><p>Live device time · shown calendar sources{hasQuery?' · search filtered':''}</p></div>
      <span>Next {result.horizonDays} calendar days</span>
    </header>
    {empty?<p className="now-next-empty">No visible ongoing or upcoming events in this window. Try showing another source or clearing your search.</p>:
    <div className="now-next-groups">
      {result.happeningCount>0&&<div className="now-next-group">
        <h4>Happening now <small>{result.happeningCount} timed</small></h4>
        {result.happening.map(x=><EventLink key={x.item.key} entry={x} today={result.today} onOpen={onOpen} onShowDay={onShowDay}/>)}
        {result.happeningCount>result.happening.length&&<p className="now-next-extra">+{result.happeningCount-result.happening.length} other ongoing event(s) · open Day for the complete list.</p>}
      </div>}
      {result.upcomingCount>0&&<div className="now-next-group">
        <h4>Coming up <small>{result.upcomingCount} in range</small></h4>
        {result.upcoming.map(x=><EventLink key={x.item.key} entry={x} today={result.today} onOpen={onOpen} onShowDay={onShowDay}/>)}
        {result.upcomingCount>result.upcoming.length&&<p className="now-next-extra">+{result.upcomingCount-result.upcoming.length} other upcoming event(s) · browse Day/List for more.</p>}
      </div>}
      {result.allDayTodayCount>0&&<div className="now-next-group">
        <h4>All day today <small>{result.allDayTodayCount} visible</small></h4>
        {result.allDayToday.map(x=><EventLink key={x.item.key} entry={x} today={result.today} onOpen={onOpen} onShowDay={onShowDay}/>)}
        {result.allDayTodayCount>result.allDayToday.length&&<p className="now-next-extra">+{result.allDayTodayCount-result.allDayToday.length} additional all-day item(s).</p>}
      </div>}
    </div>}
    <p className="now-next-footnote"><CalendarDays size={12}/> This is a read-only preview, not an alarm or availability guarantee. Hidden busy imports still block Find time even when they are not displayed here.</p>
  </section>
}
