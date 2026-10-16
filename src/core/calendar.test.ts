import {describe,it,expect} from 'vitest'
import type {CalendarRecord,CalendarState} from '../types'
import {addDays,daysBetween,fromLocalDateTime} from './dates'
import {occurrencesBetween,excludeOccurrence,conflictsOnDay} from './occurrences'
import {previewIcs,mergeIcs,exportIcs} from './ics'
import {validateState} from './storage'
import {replaceOccurrence,restoreOccurrence,shiftOccurrence,saveWholeEvent,splitSeriesAt,endSeriesAt} from './series'
import {layoutTimedDay,slotRange} from './timeline'
import {findFreeSlots} from './availability'
const record=(patch:Partial<CalendarRecord>={}):CalendarRecord=>({
  id:'test',title:'Study',description:'',location:'',source:'personal',
  start:fromLocalDateTime('2026-10-12T10:00'),end:fromLocalDateTime('2026-10-12T11:00'),
  allDay:false,updatedAt:'2026-10-12T00:00:00Z',...patch
})
describe('Calendar domain',()=>{
  it('keeps local date movement intact over DST',()=>{
    expect(addDays('2026-03-28',2)).toBe('2026-03-30')
    expect(daysBetween('2026-03-28','2026-03-30')).toBe(2)
  })
  it('applies weekly weekdays and exclusions',()=>{
    const r=record({repeat:{frequency:'weekly',interval:1,weekdays:[1,3]}})
    const dates=occurrencesBetween([r],'2026-10-12','2026-10-20').map(x=>x.date)
    expect(dates).toEqual(['2026-10-12','2026-10-14','2026-10-19'])
    const removed=excludeOccurrence(r,'2026-10-14')
    expect(occurrencesBetween([removed],'2026-10-12','2026-10-20').map(x=>x.date)).toEqual(['2026-10-12','2026-10-19'])
  })
  it('skips missing month days and does not shift monthly anchor',()=>{
    const r=record({start:fromLocalDateTime('2026-01-31T12:00'),end:fromLocalDateTime('2026-01-31T13:00'),repeat:{frequency:'monthly',interval:1}})
    expect(occurrencesBetween([r],'2026-02-01','2026-03-31').map(x=>x.date)).toEqual(['2026-03-31'])
  })
  it('detects overlapping events, not adjacent ones',()=>{
    const a=record(),b=record({id:'b',start:fromLocalDateTime('2026-10-12T10:30'),end:fromLocalDateTime('2026-10-12T11:30')})
    const items=occurrencesBetween([a,b],'2026-10-12','2026-10-12')
    expect(conflictsOnDay(items).size).toBe(2)
    const c=record({id:'c',start:fromLocalDateTime('2026-10-12T11:30'),end:fromLocalDateTime('2026-10-12T12:30')})
    expect(conflictsOnDay(occurrencesBetween([a,b,c],'2026-10-12','2026-10-12')).size).toBe(2)
  })
  it('imports all-day ICS, deduplicates, but never interprets unmaterialized recurrence',()=>{
    const input=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:University',
      'BEGIN:VEVENT','UID:class-1','SUMMARY:Lecture','DTSTART;VALUE=DATE:20261012','DTEND;VALUE=DATE:20261013','END:VEVENT',
      'BEGIN:VEVENT','UID:series-1','SUMMARY:Series','DTSTART:20261012T120000Z','DTEND:20261012T130000Z','RRULE:FREQ=WEEKLY','END:VEVENT','END:VCALENDAR'].join('\r\n')
    const parsed=previewIcs(input)
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0].allDay).toBe(true)
    expect(parsed.warnings).toHaveLength(1)
    const first=mergeIcs({schemaVersion:1,records:[]},parsed)
    const next=mergeIcs(first.state,parsed)
    expect(first.added).toBe(1);expect(next.added).toBe(0);expect(next.duplicates).toBe(1)
  })
  it('rejects malformed backups and maintains 1-year export snapshot boundaries',()=>{
    const state:CalendarState={schemaVersion:1,records:[record({repeat:{frequency:'daily',interval:1}})]}
    expect(exportIcs(state,'2026-10-12','2026-10-14').match(/BEGIN:VEVENT/g)).toHaveLength(3)
    expect(()=>validateState({schemaVersion:0,records:[]})).toThrow()
    expect(()=>validateState({schemaVersion:1,records:[record(),record()]})).toThrow('Duplicate')
  })
})

describe('Recurring edits and source refresh',()=>{
  it('replaces one repeating instance, moves it, then restores its original date',()=>{
    const repeating=record({repeat:{frequency:'weekly',interval:1,weekdays:[1,3]}})
    const state:CalendarState={schemaVersion:1,records:[repeating]}
    const monday=occurrencesBetween(state.records,'2026-10-12','2026-10-12')[0]
    const moved=shiftOccurrence(repeating,monday,'2026-10-15')
    const next=replaceOccurrence(state,repeating.id,'2026-10-12',{...moved,id:'exception-1'})
    expect(validateState(next).records).toHaveLength(2)
    const all=occurrencesBetween(next.records,'2026-10-12','2026-10-20')
    expect(all.map(x=>x.date)).toEqual(['2026-10-14','2026-10-15','2026-10-19'])
    expect(next.records.find(r=>r.id==='exception-1')?.recurrenceDate).toBe('2026-10-12')
    const restored=restoreOccurrence(next,'exception-1')
    expect(occurrencesBetween(restored.records,'2026-10-12','2026-10-20').map(x=>x.date)).toEqual(['2026-10-12','2026-10-14','2026-10-19'])
  })
  it('rejects duplicate exceptions and broken recurring links',()=>{
    const initial:CalendarState={schemaVersion:1,records:[record({repeat:{frequency:'daily',interval:1}})]}
    const instance=occurrencesBetween(initial.records,'2026-10-13','2026-10-13')[0]
    const exception=replaceOccurrence(initial,'test','2026-10-13',{...shiftOccurrence(initial.records[0],instance,'2026-10-15'),id:'override'})
    expect(()=>replaceOccurrence(exception,'test','2026-10-13',{...exception.records[1],id:'other'})).toThrow()
    expect(()=>validateState({...exception,records:exception.records.filter(r=>r.id!=='test')})).toThrow('parent')
    const single=saveWholeEvent(exception,record({repeat:undefined}))
    expect(validateState(single).records[1].recurrenceParentId).toBeUndefined()
  })
  it('updates imported UID snapshots without mutating unrelated personal data',()=>{
    const before:CalendarState={schemaVersion:1,records:[record()]}
    const input=(title:string)=>['BEGIN:VCALENDAR','X-WR-CALNAME:University','BEGIN:VEVENT','UID:lect-1',
      'SUMMARY:'+title,'DTSTART;VALUE=DATE:20261012','DTEND;VALUE=DATE:20261013','END:VEVENT','END:VCALENDAR'].join('\r\n')
    const first=mergeIcs(before,previewIcs(input('Lecture')))
    const second=mergeIcs(first.state,previewIcs(input('Lecture moved')))
    expect(second.updated).toBe(1);expect(second.added).toBe(0)
    expect(second.state.records[0].source).toBe('personal')
    expect(second.state.records[1].title).toBe('Lecture moved')
    const third=mergeIcs(second.state,previewIcs(input('Lecture moved')),'replace')
    expect(third.removed).toBe(1);expect(third.added).toBe(1)
  })
})

describe('Find time against canonical visible and hidden calendar sources',()=>{
  it('avoids conflicts, including recurring events and read-only imports',()=>{
    const repeating=record({start:fromLocalDateTime('2090-10-16T09:00'),end:fromLocalDateTime('2090-10-16T10:00'),
      repeat:{frequency:'daily',interval:1}})
    const external=record({id:'ics-1',source:'ics',start:fromLocalDateTime('2090-10-16T10:00'),
      end:fromLocalDateTime('2090-10-16T11:00')})
    const free=findFreeSlots([repeating,external],{from:'2090-10-16',days:1,durationMinutes:60,
      startHour:8,endHour:13,blockAllDay:true,now:new Date('2090-10-01T00:00:00Z')})
    expect(free.map(x=>new Date(x.start).getHours())).toEqual([8,11,12])
  })
  it('considers multi-day all-day events and safely handles a fully busy day',()=>{
    const allDay=record({allDay:true,startDate:'2090-10-16',endDateExclusive:'2090-10-18',
      start:fromLocalDateTime('2090-10-16T00:00'),end:fromLocalDateTime('2090-10-18T00:00')})
    const opts={from:'2090-10-16',days:3,durationMinutes:60,startHour:8,endHour:11,
      blockAllDay:true,now:new Date('2090-10-01T00:00:00Z')}
    const slots=findFreeSlots([allDay],opts)
    expect(slots.map(x=>x.date)).toEqual(['2090-10-18','2090-10-18','2090-10-18'])
    expect(findFreeSlots([allDay],{...opts,days:1})).toEqual([])
  })
})

describe('Graphical local timeline',()=>{
  it('assigns separate lanes to actual overlapping events, not adjacent events',()=>{
    const make=(id:string,start:string,end:string)=>record({id,
      start:fromLocalDateTime('2026-10-19T'+start),end:fromLocalDateTime('2026-10-19T'+end)})
    const events=occurrencesBetween([
      make('a','09:00','11:00'),make('b','09:30','10:30'),
      make('c','10:30','11:30'),make('d','12:00','13:00')
    ],'2026-10-19','2026-10-19')
    const blocks=layoutTimedDay(events,'2026-10-19')
    expect(blocks.map(b=>b.lanes)).toEqual([2,2,2,1])
    expect(blocks[0].lane).not.toBe(blocks[1].lane)
    expect(blocks[3].overlaps).toBe(false)
    expect(blocks[0].startMinute).toBe(540)
    expect(blocks[0].endMinute).toBe(660)
  })
  it('clips crossing-midnight events into each day without dropping source identity',()=>{
    const r=record({start:fromLocalDateTime('2026-10-19T23:30'),end:fromLocalDateTime('2026-10-20T01:00')})
    const before=layoutTimedDay(occurrencesBetween([r],'2026-10-19','2026-10-19'),'2026-10-19')
    const after=layoutTimedDay(occurrencesBetween([r],'2026-10-20','2026-10-20'),'2026-10-20')
    expect(before).toHaveLength(1)
    expect(before[0].startMinute).toBe(1410)
    expect(before[0].endMinute).toBe(1440)
    expect(after[0].startMinute).toBe(0)
    expect(after[0].endMinute).toBe(60)
    expect(after[0].occurrence.recordId).toBe('test')
  })
  it('makes actual local editable half-hour times and validates gaps',()=>{
    const range=slotRange('2026-10-19',570,60)
    expect(new Date(range.start).getHours()).toBe(9)
    expect(new Date(range.start).getMinutes()).toBe(30)
    expect(Date.parse(range.end)-Date.parse(range.start)).toBe(3600000)
    expect(()=>slotRange('2026-10-19',571,60)).toThrow()
    expect(()=>slotRange('2026-10-19',570,17)).toThrow()
  })
})
describe('Future-only recurring series changes',()=>{
  it('splits a weekly series on a selected occurrence and retains history',()=>{
    const original=record({repeat:{frequency:'weekly',interval:2,weekdays:[1,3]}})
    const state:CalendarState={schemaVersion:1,records:[original]}
    const dates=occurrencesBetween([original],'2026-10-12','2026-11-12').map(x=>x.date)
    const pivot=dates[2]
    const split=splitSeriesAt(state,original.id,pivot,'new-series')
    expect(validateState(split).records).toHaveLength(2)
    const projected=occurrencesBetween(split.records,'2026-10-12','2026-11-12').map(x=>x.date).sort()
    expect(projected).toEqual(dates)
    expect(split.records[0].id).toBe('test')
    expect(split.records[1].id).toBe('new-series')
    expect(split.records[0].repeat?.until).toBe(addDays(pivot,-1))
  })
  it('preserves detached overrides when stopping recurrence, rejects unsafe splits',()=>{
    const base=record({repeat:{frequency:'daily',interval:1}})
    const begin:CalendarState={schemaVersion:1,records:[base]}
    const instance=occurrencesBetween(begin.records,'2026-10-16','2026-10-16')[0]
    const overridden=replaceOccurrence(begin,'test','2026-10-16',{
      ...shiftOccurrence(base,instance,'2026-10-18'),id:'detached'
    })
    expect(()=>splitSeriesAt(overridden,'test','2026-10-15','new')).toThrow('future occurrences')
    const ended=endSeriesAt(overridden,'test','2026-10-14')
    expect(ended.records[1].recurrenceParentId).toBeUndefined()
    expect(validateState(ended).records).toHaveLength(2)
    expect(occurrencesBetween(ended.records,'2026-10-15','2026-10-15')).toHaveLength(0)
  })
})
