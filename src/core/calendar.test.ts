import {describe,it,expect} from 'vitest'
import type {CalendarRecord,CalendarState} from '../types'
import {addDays,daysBetween,fromLocalDateTime,fromUnambiguousLocalDateTime,localInstantOptions,resolveLocalInstant} from './dates'
import {proposeTimedChange,applyTimedChange,nudgeTimed} from './reschedule'
import {draftTimedRange,reviewDraft} from './draft'
import {proposeAllDayChange,applyAllDayChange} from './all-day'
import {occurrencesBetween,excludeOccurrence,conflictsOnDay} from './occurrences'
import {previewIcs,mergeIcs,exportIcs} from './ics'
import {validateState,saveState,readRecovery,rawCalendarBackup,rescuedUnparsedCalendar,restoreUnreadableCalendar,RECOVERY_STORAGE_KEY,STORAGE_KEY} from './storage'
import {replaceOccurrence,restoreOccurrence,shiftOccurrence,saveWholeEvent,splitSeriesAt,endSeriesAt} from './series'
import {layoutTimedDay,slotRange,dayAxis,slotAt} from './timeline'
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

describe('C5 interactive rescheduling and DST integrity',()=>{
  it('flags collisions across filtered-out imported and recurring sources without changing them',()=>{
    const itemRecord=record({start:fromLocalDateTime('2026-10-19T09:00'),end:fromLocalDateTime('2026-10-19T10:00')})
    const hidden=record({id:'ics-lecture',source:'ics',start:fromLocalDateTime('2026-10-19T10:30'),
      end:fromLocalDateTime('2026-10-19T11:30')})
    const state:CalendarState={schemaVersion:1,records:[itemRecord,hidden]}
    const item=occurrencesBetween([itemRecord],'2026-10-19','2026-10-19')[0]
    const proposal=proposeTimedChange(state,item,'move','2026-10-19',630,60)
    expect(proposal.conflicts.map(x=>x.recordId)).toEqual(['ics-lecture'])
    const next=applyTimedChange(state,proposal,()=> 'unused')
    expect(next.records.find(r=>r.id==='ics-lecture')).toEqual(hidden)
    expect(next.records.find(r=>r.id==='test')?.start).toBe(proposal.start)
  })
  it('changes exactly one recurring occurrence and preserves source ID and exceptions',()=>{
    const parent=record({repeat:{frequency:'daily',interval:1}})
    const original:CalendarState={schemaVersion:1,records:[parent]}
    const item=occurrencesBetween(original.records,'2026-10-20','2026-10-20')[0]
    const proposal=proposeTimedChange(original,item,'resize','2026-10-20',540,90)
    const next=applyTimedChange(original,proposal,()=> 'detached')
    expect(next.records.find(r=>r.id==='test')?.repeat?.frequency).toBe('daily')
    expect(next.records.find(r=>r.id==='test')?.excludedDates).toContain('2026-10-20')
    expect(next.records.find(r=>r.id==='detached')?.recurrenceParentId).toBe('test')
    expect(next.records.find(r=>r.id==='detached')?.recurrenceDate).toBe('2026-10-20')
    expect(Date.parse(next.records[1].end)-Date.parse(next.records[1].start)).toBe(90*60000)
  })
  it('updates an already detached event without breaking original instance linkage',()=>{
    const parent=record({repeat:{frequency:'daily',interval:1}})
    const original:CalendarState={schemaVersion:1,records:[parent]}
    const item=occurrencesBetween(original.records,'2026-10-20','2026-10-20')[0]
    const initial=applyTimedChange(original,proposeTimedChange(original,item,'move','2026-10-20',630,60),()=> 'override')
    const isolated=occurrencesBetween([initial.records[1]],'2026-10-20','2026-10-20')[0]
    const next=applyTimedChange(initial,proposeTimedChange(initial,isolated,'move','2026-10-21',660,60),()=> 'never')
    expect(validateState(next).records).toHaveLength(2)
    expect(next.records[1].id).toBe('override')
    expect(next.records[1].recurrenceDate).toBe('2026-10-20')
    expect(next.records[1].recurrenceParentId).toBe('test')
  })
  it('rejects editing read-only ICS and stale event details',()=>{
    const ics=record({source:'ics'})
    const item=occurrencesBetween([ics],'2026-10-12','2026-10-12')[0]
    expect(()=>proposeTimedChange({schemaVersion:1,records:[ics]},item,'move','2026-10-12',600,60)).toThrow('personal')
    const mine=record()
    const original=occurrencesBetween([mine],'2026-10-12','2026-10-12')[0]
    const state:CalendarState={schemaVersion:1,records:[mine]}
    const proposal=proposeTimedChange(state,original,'move','2026-10-12',660,60)
    expect(()=>applyTimedChange({...state,records:[{...mine,title:'Changed'}]},proposal,()=> 'x')).toThrow('changed')
  })
  it('distinguishes nonexistent and repeated DST times in the Europe/Berlin zone when configured',()=>{
    if(Intl.DateTimeFormat().resolvedOptions().timeZone==='Europe/Berlin'){
      expect(()=>fromUnambiguousLocalDateTime('2026-03-29T02:30')).toThrow()
      expect(()=>fromUnambiguousLocalDateTime('2026-10-25T02:30')).toThrow('twice')
      expect(fromUnambiguousLocalDateTime('2026-10-25T03:30')).toBeTruthy()
      expect(slotRange('2026-10-25',150,60).start).toBe(localInstantOptions('2026-10-25T02:30')[0])
    }
  })
  it('offers deterministic keyboard equivalents for move and resize',()=>{
    const item=occurrencesBetween([record()],'2026-10-12','2026-10-12')[0]
    expect(nudgeTimed(item,'2026-10-12','later')).toMatchObject({minute:630,length:60,kind:'move'})
    expect(nudgeTimed(item,'2026-10-12','longer')).toMatchObject({minute:600,length:90,kind:'resize'})
    expect(nudgeTimed(item,'2026-10-12','next-day').date).toBe('2026-10-13')
  })
})

describe('C6 candidate review and all-day integrity',()=>{
  it('rejects ambiguous and nonexistent edited wall-clock endpoints, while retaining valid range',()=>{
    if(Intl.DateTimeFormat().resolvedOptions().timeZone==='Europe/Berlin'){
      expect(()=>draftTimedRange('2026-10-25T02:30','2026-10-25T04:30')).toThrow('twice')
      expect(()=>draftTimedRange('2026-03-29T01:30','2026-03-29T02:30')).toThrow()
      expect(draftTimedRange('2026-10-25T03:30','2026-10-25T04:30').start).toBeTruthy()
    }
    expect(()=>draftTimedRange('2026-10-19T11:00','2026-10-19T10:00')).toThrow('End must')
  })
  it('identifies conflicts in an unfiltered ICS calendar across a recurring candidate window',()=>{
    const recurring=record({id:'draft',start:fromLocalDateTime('2026-10-19T11:00'),
      end:fromLocalDateTime('2026-10-19T12:00'),repeat:{frequency:'weekly',interval:1}})
    const imported=record({id:'hidden-ics',source:'ics',start:fromLocalDateTime('2026-10-26T11:30'),
      end:fromLocalDateTime('2026-10-26T12:00')})
    const report=reviewDraft([imported],recurring,{horizonDays:28})
    expect(report.collisionCount).toBe(1)
    expect(report.collisions[0].existing.recordId).toBe('hidden-ics')
    expect(report.repeating).toBe(true)
    expect(report.checkedThrough).toBe('2026-11-15')
  })
  it('excludes a series own old instances, not unrelated personal records',()=>{
    const parent=record({id:'original',start:fromLocalDateTime('2026-10-19T11:00'),
      end:fromLocalDateTime('2026-10-19T12:00'),repeat:{frequency:'weekly',interval:1}})
    const edited={...parent,title:'Rescheduled'}
    expect(reviewDraft([parent],edited,{ignoreRecordId:'original',horizonDays:21}).collisionCount).toBe(0)
  })
  it('discloses spring missing and autumn repeated wall times for recurring events',()=>{
    if(Intl.DateTimeFormat().resolvedOptions().timeZone!=='Europe/Berlin')return
    const rule=record({id:'dst-series',start:fromLocalDateTime('2026-03-01T02:30'),
      end:fromLocalDateTime('2026-03-01T03:30'),repeat:{frequency:'daily',interval:1,until:'2026-11-01'}})
    const result=reviewDraft([],rule,{horizonDays:25})
    expect(result.missingOrAmbiguousDates).toContain('2026-03-29')
    expect(result.missingOrAmbiguousDates).toContain('2026-10-25')
    expect(result.affectedClockCount).toBeGreaterThanOrEqual(2)
  })
  it('adjusts standalone all-day spans and warns about hidden imported events',()=>{
    const meeting=record({id:'meeting',allDay:true,startDate:'2026-10-19',endDateExclusive:'2026-10-21',
      start:fromLocalDateTime('2026-10-19T00:00'),end:fromLocalDateTime('2026-10-21T00:00')})
    const ics=record({id:'ics',source:'ics',start:fromLocalDateTime('2026-10-23T14:00'),
      end:fromLocalDateTime('2026-10-23T15:00')})
    const state:CalendarState={schemaVersion:1,records:[meeting,ics]}
    const original=occurrencesBetween([meeting],'2026-10-19','2026-10-19')[0]
    const proposal=proposeAllDayChange(state,original,'2026-10-22','2026-10-24')
    expect(proposal.collisionCount).toBe(1)
    const next=applyAllDayChange(state,proposal,()=> 'unused')
    expect(next.records[0].id).toBe('meeting')
    expect(next.records[0].startDate).toBe('2026-10-22')
    expect(next.records[0].endDateExclusive).toBe('2026-10-25')
    expect(next.records[1]).toEqual(ics)
  })
  it('creates linked all-day exception without rewriting its repeating parent',()=>{
    const p=record({allDay:true,startDate:'2026-10-19',endDateExclusive:'2026-10-20',
      start:fromLocalDateTime('2026-10-19T00:00'),end:fromLocalDateTime('2026-10-20T00:00'),
      repeat:{frequency:'daily',interval:1}})
    const state:CalendarState={schemaVersion:1,records:[p]}
    const item=occurrencesBetween([p],'2026-10-21','2026-10-21')[0]
    const next=applyAllDayChange(state,proposeAllDayChange(state,item,'2026-10-23','2026-10-24'),()=> 'day-override')
    expect(validateState(next).records[0].repeat?.frequency).toBe('daily')
    expect(next.records[0].excludedDates).toContain('2026-10-21')
    expect(next.records[1].recurrenceParentId).toBe('test')
    expect(next.records[1].recurrenceDate).toBe('2026-10-21')
  })
})

describe('C7 real elapsed-time DST graphical axis and fold selection',()=>{
  it('renders both fall-back 02:00 slots with distinct ISO timestamps and offset labels',()=>{
    if(Intl.DateTimeFormat().resolvedOptions().timeZone!=='Europe/Berlin')return
    const axis=dayAxis('2026-10-25')
    expect(axis.minutes).toBe(1500)
    expect(axis.slots).toHaveLength(50)
    const twos=axis.slots.filter(s=>s.label==='02:00')
    expect(twos).toHaveLength(2)
    expect(twos[0].start).not.toBe(twos[1].start)
    expect(twos.map(x=>x.offset)).toEqual(['UTC+02:00','UTC+01:00'])
    expect(twos.every(x=>x.repeated)).toBe(true)
    expect(slotAt(axis,twos[1].minute,30).start).toBe(twos[1].start)
    const candidates=localInstantOptions('2026-10-25T02:30')
    expect(candidates).toHaveLength(2)
    expect(resolveLocalInstant('2026-10-25T02:30','earlier')).toBe(candidates[0])
    expect(resolveLocalInstant('2026-10-25T02:30','later')).toBe(candidates[1])
  })
  it('renders the missing spring hour as 23 physical hours with no imaginary slot',()=>{
    if(Intl.DateTimeFormat().resolvedOptions().timeZone!=='Europe/Berlin')return
    const axis=dayAxis('2026-03-29')
    expect(axis.minutes).toBe(1380)
    expect(axis.slots).toHaveLength(46)
    expect(axis.slots.some(x=>x.label==='02:00')).toBe(false)
    expect(()=>localInstantOptions('2026-03-29T02:30')).toThrow('does not exist')
  })
  it('positions already-imported absolute fold events in distinct timeline rows',()=>{
    if(Intl.DateTimeFormat().resolvedOptions().timeZone!=='Europe/Berlin')return
    const pair=localInstantOptions('2026-10-25T02:00')
    const start=new Date(pair[0]).getTime()
    const early=record({id:'fold-first',start:new Date(start).toISOString(),end:new Date(start+1800000).toISOString()})
    const later=record({id:'fold-second',start:pair[1],end:new Date(Date.parse(pair[1])+1800000).toISOString()})
    const blocks=layoutTimedDay(occurrencesBetween([early,later],'2026-10-25','2026-10-25'),'2026-10-25')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].startMinute).toBe(120)
    expect(blocks[1].startMinute).toBe(180)
    expect(blocks[0].lanes).toBe(1)
    expect(blocks[1].lanes).toBe(1)
  })
  it('supports full-year conflict review without claiming a lifetime clean series',()=>{
    const future=record({id:'hidden',source:'ics',start:fromLocalDateTime('2027-09-06T10:00'),end:fromLocalDateTime('2027-09-06T11:00')})
    const daily=record({id:'candidate',repeat:{frequency:'weekly',interval:1}})
    const check=reviewDraft([future],daily,{horizonDays:365})
    expect(check.checkedThrough).toBe('2027-10-11')
    expect(check.collisionCount).toBeGreaterThan(0)
    expect(check.collisions.some(x=>x.existing.recordId==='hidden')).toBe(true)
  })
})

describe('C7 source-canonical repeated-hour adjustments',()=>{
  it('moves a personal event in the second repeated autumn hour without changing its fold',()=>{
    if(Intl.DateTimeFormat().resolvedOptions().timeZone!=='Europe/Berlin')return
    const choices=localInstantOptions('2026-10-25T02:00')
    const personal=record({id:'late',start:choices[1],end:new Date(Date.parse(choices[1])+30*60000).toISOString()})
    const before:CalendarState={schemaVersion:1,records:[personal]}
    const event=occurrencesBetween([personal],'2026-10-25','2026-10-25')[0]
    const proposal=proposeTimedChange(before,event,'move','2026-10-25',150,30,'later')
    expect(proposal.start).toBe(localInstantOptions('2026-10-25T02:30')[1])
    const after=applyTimedChange(before,proposal,()=> 'unused')
    expect(after.records[0].id).toBe('late')
    expect(after.records[0].start).toBe(proposal.start)
    expect(validateState(after).records).toHaveLength(1)
    expect(()=>proposeTimedChange(before,event,'move','2026-10-25',150,30)).toThrow('Choose')
  })
})

describe('C8 recoverable local writes and recurrence integrity',()=>{
  it('keeps a validated prior-version checkpoint before overwriting original records',()=>{
    const prior:CalendarState={schemaVersion:1,records:[record({title:'Before change'})]}
    const next:CalendarState={schemaVersion:1,records:[record({title:'After change'})]}
    const map=new Map<string,string>()
    const original=globalThis.localStorage
    const mock={getItem:(key:string)=>map.get(key)??null,
      setItem:(key:string,value:string)=>{map.set(key,value)},removeItem:(key:string)=>{map.delete(key)},
      clear:()=>{map.clear()},key:(i:number)=>Array.from(map.keys())[i]??null,get length(){return map.size}}
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:mock})
    try{
      saveState(prior,'initial')
      expect(readRecovery()).toBeNull()
      saveState(next,'Before editing')
      expect(readRecovery()?.state.records[0].title).toBe('Before change')
      expect(readRecovery()?.label).toBe('Before editing')
      expect(JSON.parse(rawCalendarBackup()!).records[0].title).toBe('After change')
      saveState(prior,'Undoing change')
      expect(readRecovery()?.state.records[0].title).toBe('After change')
      expect(map.has(RECOVERY_STORAGE_KEY)).toBe(true)
      expect(map.has(STORAGE_KEY)).toBe(true)
    }finally{
      if(original)Object.defineProperty(globalThis,'localStorage',{configurable:true,value:original})
      else Reflect.deleteProperty(globalThis,'localStorage')
    }
  })
  it('rejects edits that disconnect recurring overrides from their source dates',()=>{
    const base=record({id:'series',repeat:{frequency:'weekly',interval:1,weekdays:[1,3]}})
    const original:CalendarState={schemaVersion:1,records:[base]}
    const instance=occurrencesBetween([base],'2026-10-14','2026-10-14')[0]
    const changed=replaceOccurrence(original,'series','2026-10-14',{...base,id:'detached-wed',
      repeat:undefined,excludedDates:undefined,start:instance.start,end:instance.end})
    expect(()=>saveWholeEvent(changed,{...changed.records[0],repeat:{frequency:'weekly',interval:1,weekdays:[1]}}))
      .toThrow('previously edited occurrence')
    expect(validateState(saveWholeEvent(changed,{...changed.records[0],title:'Safe rename'})).records)
      .toHaveLength(2)
    expect(changed.records[1].recurrenceParentId).toBe('series')
  })
  it('keeps imported entries unchanged when editing a personal rule',()=>{
    const ics=record({id:'ics-readonly',source:'ics',sourceCalendar:'Classroom',sourceKey:'Classroom|uid-1'})
    const personal=record({id:'series',repeat:{frequency:'daily',interval:2}})
    const next=saveWholeEvent({schemaVersion:1,records:[personal,ics]},{...personal,title:'Updated title'})
    expect(next.records[1]).toEqual(ics)
  })
})

describe('C8 corrupt-source repair requires byte-exact local rescue',()=>{
  it('preserves unreadable bytes before accepting a checked valid backup',()=>{
    const map=new Map<string,string>()
    const previous=globalThis.localStorage
    const mock={getItem:(key:string)=>map.get(key)??null,
      setItem:(key:string,value:string)=>{map.set(key,value)},removeItem:(key:string)=>{map.delete(key)},
      clear:()=>map.clear(),key:(i:number)=>Array.from(map.keys())[i]??null,get length(){return map.size}}
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:mock})
    try{
      map.set(STORAGE_KEY,'{"incomplete":')
      const valid:CalendarState={schemaVersion:1,records:[record({id:'repaired'})]}
      expect(()=>restoreUnreadableCalendar(valid,'different raw')).toThrow('changed')
      expect(rawCalendarBackup()).toBe('{"incomplete":')
      restoreUnreadableCalendar(valid,'{"incomplete":')
      expect(rescuedUnparsedCalendar()).toBe('{"incomplete":')
      expect(JSON.parse(rawCalendarBackup()!).records[0].id).toBe('repaired')
      expect(()=>restoreUnreadableCalendar(valid,rawCalendarBackup()!)).toThrow('valid')
    }finally{
      if(previous)Object.defineProperty(globalThis,'localStorage',{configurable:true,value:previous})
      else Reflect.deleteProperty(globalThis,'localStorage')
    }
  })
})
