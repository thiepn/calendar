import {describe,it,expect} from 'vitest'
import type {CalendarRecord,CalendarState} from '../types'
import {addDays,daysBetween,fromLocalDateTime} from './dates'
import {occurrencesBetween,excludeOccurrence,conflictsOnDay} from './occurrences'
import {previewIcs,mergeIcs,exportIcs} from './ics'
import {validateState} from './storage'
import {replaceOccurrence,restoreOccurrence,shiftOccurrence,saveWholeEvent} from './series'
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
