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
import {DEFAULT_REMINDER_SETTINGS,validateReminderSettings,inQuietHours,foregroundNotificationText} from './reminder-settings'
import {validateViewPreferences,loadViewPreferences,saveViewPreferences,resetViewPreferences,VIEW_PREFERENCES_KEY} from './view-preferences'
import {reminderItems,reminderKey,actionForReminder,deliverableReminders,proposedSnooze,dismissReminderBatch} from './reminders'
import {parseFiniteAllDayRule,expandFiniteAllDay} from './ics-recurrence'
import {parseIcsDuration} from './ics-duration'
import {sevenDayWorkload} from './planning'
import {adjacentBusyDay,exportAgendaCsv} from './agenda'
import {previewMissingPersonal} from './recover-missing'
import {personalDraftFromImported} from './personal-copy'
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
    expect(third.removed).toBe(0);expect(third.added).toBe(0)
    expect(third.duplicates).toBe(1)
    expect(third.state.records[1].id).toBe(second.state.records[1].id)
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


describe('C9 local reminders and finite ICS interoperability',()=>{
  it('keeps personal reminders source-owned, due at the actual occurrence instant',()=>{
    const personal=record({id:'rem',start:fromLocalDateTime('2026-10-16T10:00'),
      end:fromLocalDateTime('2026-10-16T11:00'),reminderMinutes:15})
    const imported=record({id:'imported',source:'ics',sourceCalendar:'External',sourceKey:'E|uid',
      start:personal.start,end:personal.end})
    const state:CalendarState={schemaVersion:1,records:[personal,imported]}
    const now=fromLocalDateTime('2026-10-16T09:50')
    const items=reminderItems(state,now)
    expect(items).toHaveLength(1)
    expect(items[0].occurrence.recordId).toBe('rem')
    expect(items[0].status).toBe('due')
    expect(items[0].dueAt).toBe(fromLocalDateTime('2026-10-16T09:45'))
    expect(items[0].key).toBe(reminderKey(items[0].occurrence,15))
    const later=new Date(Date.parse(now)+15*60000).toISOString()
    const snooze=actionForReminder(items[0].key,{kind:'snooze',until:later},now)
    const upcoming=reminderItems(state,now,{[items[0].key]:snooze})
    expect(upcoming).toHaveLength(1)
    expect(upcoming[0].status).toBe('upcoming')
    expect(deliverableReminders(upcoming,now,new Set())).toHaveLength(0)
    const dismissed=reminderItems(state,now,{[items[0].key]:{kind:'dismiss'}})
    expect(dismissed).toHaveLength(0)
    expect(()=>actionForReminder(items[0].key,{kind:'snooze',until:now},now)).toThrow('Invalid')
  })
  it('computes repeated personal recurrence and excluded dates, not imported pseudo-reminders',()=>{
    const repeat=record({id:'recurring',start:fromLocalDateTime('2026-10-16T10:00'),end:fromLocalDateTime('2026-10-16T11:00'),
      repeat:{frequency:'daily',interval:1},reminderMinutes:60,excludedDates:['2026-10-17']})
    const a=reminderItems({schemaVersion:1,records:[repeat]},fromLocalDateTime('2026-10-16T09:10'),{},4)
    expect(a.some(x=>x.occurrence.date==='2026-10-16')).toBe(true)
    expect(a.some(x=>x.occurrence.date==='2026-10-17')).toBe(false)
    expect(a.some(x=>x.occurrence.date==='2026-10-18')).toBe(true)
    expect(()=>validateState({schemaVersion:1,records:[record({id:'bad-ics-reminder',source:'ics',reminderMinutes:15})]})).toThrow('Invalid personal reminder')
    expect(()=>validateState({schemaVersion:1,records:[record({reminderMinutes:7})]})).toThrow('Invalid personal reminder')
  })
  it('imports finite source-owned all-day weekly RRULE, EXDATE and an explicitly moved exception',()=>{
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:Seminar',
      // Deliberately put detached override BEFORE the master to prove order-independent identity.
      'BEGIN:VEVENT','UID:seminar-1','RECURRENCE-ID;VALUE=DATE:20261026','SUMMARY:Moved seminar',
      'DTSTART;VALUE=DATE:20261027','DTEND;VALUE=DATE:20261028','END:VEVENT',
      'BEGIN:VEVENT','UID:seminar-1','SUMMARY:Seminar',
      'DTSTART;VALUE=DATE:20261019','DTEND;VALUE=DATE:20261020',
      'RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=MO','EXDATE;VALUE=DATE:20261102','END:VEVENT',
      'END:VCALENDAR'].join('\r\n')
    const parsed=previewIcs(lines)
    expect(parsed.records).toHaveLength(3)
    expect(parsed.records.map(x=>x.startDate)).toEqual(['2026-10-19','2026-10-27','2026-11-09'])
    expect(parsed.records[1].title).toBe('Moved seminar')
    expect(parsed.records[1].sourceKey).toBe('Seminar|seminar-1|20261026')
    expect(parsed.records.every(x=>x.source==='ics'&&x.repeat===undefined)).toBe(true)
    expect(parsed.warnings.some(x=>x.includes('materialized'))).toBe(true)
    const first=mergeIcs({schemaVersion:1,records:[record({id:'personal'})]},parsed)
    expect(first.added).toBe(3)
    const again=mergeIcs(first.state,previewIcs(lines))
    expect(again.duplicates).toBe(3)
    expect(again.state.records[0].id).toBe('personal')
    expect(again.state.records.slice(1).map(x=>x.id)).toEqual(first.state.records.slice(1).map(x=>x.id))
  })
  it('bounds finite imported ICS and does not misrepresent timed or infinite rules',()=>{
    expect(()=>parseFiniteAllDayRule('FREQ=DAILY','2026-10-19')).toThrow('Finite')
    expect(()=>parseFiniteAllDayRule('FREQ=DAILY;COUNT=151','2026-10-19')).toThrow('COUNT')
    expect(()=>parseFiniteAllDayRule('FREQ=MONTHLY;COUNT=100','2026-10-19')).not.toThrow()
    expect(()=>expandFiniteAllDay('2026-10-19',parseFiniteAllDayRule('FREQ=MONTHLY;COUNT=100','2026-10-19'))).toThrow('730')
    expect(expandFiniteAllDay('2026-10-19',parseFiniteAllDayRule('FREQ=DAILY;COUNT=3','2026-10-19'),['2026-10-20']))
      .toEqual(['2026-10-19','2026-10-21'])
    const input=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:timed','SUMMARY:External timed',
      'DTSTART:20261019T100000Z','DTEND:20261019T110000Z',
      'RRULE:FREQ=WEEKLY;COUNT=4','END:VEVENT','END:VCALENDAR'].join('\r\n')
    const parsed=previewIcs(input)
    expect(parsed.records).toHaveLength(4)
    expect(parsed.records.map(r=>r.start)).toEqual(['2026-10-19T10:00:00.000Z','2026-10-26T10:00:00.000Z','2026-11-02T10:00:00.000Z','2026-11-09T10:00:00.000Z'])
    expect(parsed.records.every(r=>r.source==='ics'&&!r.allDay&&!r.repeat)).toBe(true)
    expect(parsed.warnings).toContain('External timed: finite timed RRULE materialized into 4 read-only instance(s); source timezone and UID remain authoritative')
  })
  it('exports the chosen reminder as a standard DISPLAY VALARM without changing read-only ICS',()=>{
    const mine=record({id:'alarm',reminderMinutes:30})
    const ics=record({id:'ics',source:'ics',sourceCalendar:'Teacher',sourceKey:'Teacher|1'})
    const text=exportIcs({schemaVersion:1,records:[mine,ics]},'2026-10-12','2026-10-12')
    expect(text).toContain('BEGIN:VALARM')
    expect(text).toContain('TRIGGER:-PT30M')
    expect(text).not.toContain('Teacher')
    const again=previewIcs(text)
    expect(again.records).toHaveLength(1)
    expect(again.records[0].source).toBe('ics')
    expect(again.records[0].reminderMinutes).toBeUndefined()
  })
})

describe('C9 long-lead reminder completeness',()=>{
  it('finds a one-week reminder within the next 14 days for a later event',()=>{
    const origin=fromLocalDateTime('2026-10-16T12:00')
    const later=record({id:'18-days-later',start:fromLocalDateTime('2026-11-03T12:00'),
      end:fromLocalDateTime('2026-11-03T13:00'),reminderMinutes:10080})
    const result=reminderItems({schemaVersion:1,records:[later]},origin)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('upcoming')
    expect(result[0].dueAt).toBe(fromLocalDateTime('2026-10-27T12:00'))
  })
})

describe('C10 finite timed ICS source clocks, identity, and safe rejection',()=>{
  it('keeps recurring named TZID wall-clock time constant across autumn DST',()=>{
    if(Intl.DateTimeFormat().resolvedOptions().timeZone!=='Europe/Berlin')return
    const input=['BEGIN:VCALENDAR','X-WR-CALNAME:Lab',
      'BEGIN:VEVENT','UID:tz-lab','SUMMARY:German lab',
      'DTSTART;TZID=Europe/Berlin:20261019T100000',
      'DTEND;TZID=Europe/Berlin:20261019T110000',
      'RRULE:FREQ=WEEKLY;COUNT=3','END:VEVENT','END:VCALENDAR'].join('\r\n')
    const parsed=previewIcs(input)
    expect(parsed.records.map(r=>r.start)).toEqual([
      '2026-10-19T08:00:00.000Z','2026-10-26T09:00:00.000Z','2026-11-02T09:00:00.000Z'])
    expect(parsed.records.map(r=>r.end)).toEqual([
      '2026-10-19T09:00:00.000Z','2026-10-26T10:00:00.000Z','2026-11-02T10:00:00.000Z'])
    expect(parsed.records.every(r=>r.source==='ics'&&!r.repeat)).toBe(true)
  })
  it('materializes a timed exception by the original UTC source instance key, regardless of file order',()=>{
    const input=['BEGIN:VCALENDAR','X-WR-CALNAME:School',
      'BEGIN:VEVENT','UID:weekly-1','RECURRENCE-ID;TZID=Europe/Berlin:20261026T100000',
      'DTSTART;TZID=Europe/Berlin:20261027T113000','DTEND;TZID=Europe/Berlin:20261027T123000',
      'SUMMARY:Rescheduled class','END:VEVENT',
      'BEGIN:VEVENT','UID:weekly-1','SUMMARY:Class',
      'DTSTART;TZID=Europe/Berlin:20261019T100000','DTEND;TZID=Europe/Berlin:20261019T110000',
      'RRULE:FREQ=WEEKLY;COUNT=3','EXDATE;TZID=Europe/Berlin:20261102T100000',
      'END:VEVENT','END:VCALENDAR'].join('\r\n')
    const parsed=previewIcs(input)
    expect(parsed.records).toHaveLength(2)
    expect(parsed.records[0].start).toBe('2026-10-19T08:00:00.000Z')
    expect(parsed.records[1].start).toBe('2026-10-27T10:30:00.000Z')
    expect(parsed.records[1].sourceKey).toBe('School|weekly-1|2026-10-26T09:00:00.000Z')
    const merged=mergeIcs({schemaVersion:1,records:[record({id:'original'})]},parsed)
    const refreshed=mergeIcs(merged.state,previewIcs(input))
    expect(refreshed.duplicates).toBe(2)
    expect(refreshed.state.records[0].id).toBe('original')
    expect(refreshed.state.records.slice(1).map(r=>r.id)).toEqual(merged.state.records.slice(1).map(r=>r.id))
  })
  it('rejects an entire source master when a recurrence crosses nonexistent local time',()=>{
    const text=['BEGIN:VCALENDAR','X-WR-CALNAME:DST','BEGIN:VEVENT',
      'UID:dst-gap','SUMMARY:Nonexistent week',
      'DTSTART;TZID=Europe/Berlin:20260322T023000',
      'DTEND;TZID=Europe/Berlin:20260322T033000',
      'RRULE:FREQ=WEEKLY;COUNT=3','END:VEVENT','END:VCALENDAR'].join('\r\n')
    const preview=previewIcs(text)
    expect(preview.records).toHaveLength(0)
    expect(preview.warnings.some(w=>/DST|Nonexistent local time/.test(w))).toBe(true)
  })
  it('rejects unbounded timed masters and handles UTC UNTIL inclusively',()=>{
    const unbounded=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:indefinite','SUMMARY:Forever',
      'DTSTART:20261019T100000Z','DTEND:20261019T103000Z',
      'RRULE:FREQ=DAILY','END:VEVENT','END:VCALENDAR'].join('\r\n')
    const missing=previewIcs(unbounded)
    expect(missing.records).toHaveLength(0)
    expect(missing.warnings.some(w=>w.includes('Finite RRULE'))).toBe(true)
    const bounded=unbounded.replace('RRULE:FREQ=DAILY','RRULE:FREQ=DAILY;UNTIL=20261021T100000Z')
    expect(previewIcs(bounded).records.map(r=>r.start)).toEqual([
      '2026-10-19T10:00:00.000Z','2026-10-20T10:00:00.000Z','2026-10-21T10:00:00.000Z'])
  })
})

describe('C10 reversible local reminder settings',()=>{
  it('validates per-device defaults and overnight quiet periods without hiding due events',()=>{
    expect(validateReminderSettings(DEFAULT_REMINDER_SETTINGS).defaultLead).toBe(-1)
    expect(validateReminderSettings({defaultLead:15,quietHours:'22-07'}).defaultLead).toBe(15)
    expect(()=>validateReminderSettings({defaultLead:7,quietHours:'off'})).toThrow('Invalid')
    expect(inQuietHours(fromLocalDateTime('2026-10-16T23:30'),'22-07')).toBe(true)
    expect(inQuietHours(fromLocalDateTime('2026-10-17T06:30'),'22-07')).toBe(true)
    expect(inQuietHours(fromLocalDateTime('2026-10-17T12:30'),'22-07')).toBe(false)
    expect(inQuietHours(fromLocalDateTime('2026-10-17T12:30'),'off')).toBe(false)
  })
})

describe('C10 source-key preserving ICS replace',()=>{
  it('removes only absent source-owned UIDs and retains matching IDs',()=>{
    const input=(uids:string[])=>['BEGIN:VCALENDAR','X-WR-CALNAME:Courses',...uids.flatMap(uid=>[
      'BEGIN:VEVENT','UID:'+uid,'SUMMARY:'+uid,'DTSTART:20261111T100000Z',
      'DTEND:20261111T110000Z','END:VEVENT']),'END:VCALENDAR'].join('\r\n')
    const initial=mergeIcs({schemaVersion:1,records:[record({id:'private'})]},previewIcs(input(['a','b']))).state
    const updated=mergeIcs(initial,previewIcs(input(['b','c'])),'replace')
    expect(updated.removed).toBe(1)
    expect(updated.added).toBe(1)
    expect(updated.duplicates).toBe(1)
    expect(updated.state.records.find(r=>r.title==='b')?.id).toBe(initial.records.find(r=>r.title==='b')?.id)
    expect(updated.state.records.some(r=>r.title==='a')).toBe(false)
    expect(updated.state.records.find(r=>r.id==='private')).toEqual(initial.records[0])
  })
})

describe('C10 source timezone safety on short DST shifts and floating times',()=>{
  it('does not guess a TZID fold when daylight saving changes by thirty minutes',()=>{
    const input=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:half-hour','SUMMARY:Ambiguous',
      'DTSTART;TZID=Australia/Lord_Howe:20260405T014500',
      'DTEND;TZID=Australia/Lord_Howe:20260405T023000',
      'END:VEVENT','END:VCALENDAR'].join('\r\n')
    const parsed=previewIcs(input)
    expect(parsed.records).toHaveLength(0)
    expect(parsed.warnings.some(x=>x.includes('Ambiguous local time'))).toBe(true)
  })
  it('rejects mixed UTC/TZID specifications without creating a source record',()=>{
    const input=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:mixed','SUMMARY:Mixed',
      'DTSTART;TZID=Europe/Berlin:20261019T100000Z',
      'DTEND:20261019T110000Z','END:VEVENT','END:VCALENDAR'].join('\r\n')
    const parsed=previewIcs(input)
    expect(parsed.records).toHaveLength(0)
    expect(parsed.warnings.some(x=>x.includes('Mixed UTC suffix'))).toBe(true)
  })
})

describe('C10+ destructive import guard and local display preferences',()=>{
  it('blocks source-wide replacement when an unsupported master makes the ICS snapshot incomplete',()=>{
    const calendar=(broken:boolean)=>['BEGIN:VCALENDAR','X-WR-CALNAME:Uni Labs',
      'BEGIN:VEVENT','UID:stable','SUMMARY:Lab schedule','DTSTART:20261102T100000Z',
      'DTEND:20261102T110000Z','END:VEVENT',
      ...(broken?['BEGIN:VEVENT','UID:missing-future','SUMMARY:Unsupported source series',
        'DTSTART:20261103T090000Z','DTEND:20261103T100000Z',
        'RRULE:FREQ=WEEKLY','END:VEVENT']:[]),'END:VCALENDAR'].join('\r\n')
    const pristine=previewIcs(calendar(false))
    const first=mergeIcs({schemaVersion:1,records:[record({id:'personal-anchor'})]},pristine).state
    const source=previewIcs(calendar(true))
    expect(source.skippedEvents).toBe(1)
    expect(source.records.map(x=>x.title)).toEqual(['Lab schedule'])
    expect(source.warnings.some(x=>x.includes('Finite RRULE'))).toBe(true)
    expect(()=>mergeIcs(first,source,'replace')).toThrow('Cannot replace an incomplete ICS snapshot')
    const safer=mergeIcs(first,source,'update')
    expect(safer.state.records).toEqual(first.records)
    expect(safer.duplicates).toBe(1)
    expect(safer.removed).toBe(0)
    expect(first.records[0].id).toBe('personal-anchor')
    expect(pristine.skippedEvents).toBe(0)
  })
  it('preserves previous personal and ICS source records if a formerly supported series becomes unsupported',()=>{
    const valid=['BEGIN:VCALENDAR','X-WR-CALNAME:Department','BEGIN:VEVENT',
      'UID:series-master','SUMMARY:Tutorial','DTSTART:20261019T100000Z',
      'DTEND:20261019T110000Z','RRULE:FREQ=WEEKLY;COUNT=3',
      'END:VEVENT','END:VCALENDAR'].join('\r\n')
    const changed=valid.replace('RRULE:FREQ=WEEKLY;COUNT=3','RRULE:FREQ=WEEKLY')
    const first=mergeIcs({schemaVersion:1,records:[record({id:'mine'})]},previewIcs(valid)).state
    expect(first.records).toHaveLength(4)
    const unsupported=previewIcs(changed)
    expect(unsupported.records).toHaveLength(0)
    expect(unsupported.skippedEvents).toBe(1)
    expect(()=>mergeIcs(first,unsupported,'replace')).toThrow('incomplete')
    expect(mergeIcs(first,unsupported,'update').state.records).toEqual(first.records)
  })
  it('validates persistent device display choices and resets without affecting calendar authority',()=>{
    expect(validateViewPreferences({mode:'agenda',filter:'ics',agendaSpan:30,agendaBusyOnly:true})).toEqual({
      mode:'agenda',filter:'ics',agendaSpan:30,agendaBusyOnly:true})
    expect(()=>validateViewPreferences({mode:'agenda',filter:'ics',agendaSpan:500,agendaBusyOnly:true})).toThrow('Invalid agenda span')
    expect(()=>validateViewPreferences({mode:'week',filter:'provider-write',agendaSpan:14,agendaBusyOnly:false})).toThrow('Invalid source filter')
    const map=new Map<string,string>()
    const previous=globalThis.localStorage
    const mock={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value)},
      removeItem:(key:string)=>{map.delete(key)},clear:()=>map.clear(),
      key:(n:number)=>Array.from(map.keys())[n]??null,get length(){return map.size}}
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:mock})
    try{
      const v={mode:'agenda' as const,filter:'personal' as const,agendaSpan:30 as const,agendaBusyOnly:true}
      saveViewPreferences(v)
      expect(loadViewPreferences()).toEqual(v)
      expect(JSON.parse(map.get(VIEW_PREFERENCES_KEY)!)).toEqual(v)
      resetViewPreferences()
      expect(loadViewPreferences().mode).toBe('week')
      expect(map.has(VIEW_PREFERENCES_KEY)).toBe(false)
    }finally{
      if(previous)Object.defineProperty(globalThis,'localStorage',{configurable:true,value:previous})
      else Reflect.deleteProperty(globalThis,'localStorage')
    }
  })
})

describe('C10+ snooze does not move future alerts earlier',()=>{
  it('snoozes upcoming reminders relative to their actual due time, overdue relative to now',()=>{
    const recordItem=record({id:'one',reminderMinutes:15})
    const now=fromLocalDateTime('2026-10-12T08:00')
    const upcoming=reminderItems({schemaVersion:1,records:[recordItem]},now)[0]
    expect(upcoming.status).toBe('upcoming')
    const next=proposedSnooze(upcoming,5,now)
    expect(next.kind).toBe('snooze')
    expect(next.until).toBe(fromLocalDateTime('2026-10-12T09:50'))
    const dueNow=fromLocalDateTime('2026-10-12T09:50')
    const delayed=proposedSnooze(upcoming,15,dueNow)
    expect(delayed.until).toBe(fromLocalDateTime('2026-10-12T10:05'))
    expect(()=>proposedSnooze(upcoming,7 as 5,now)).toThrow('Invalid snooze')
  })
})

describe('C11 source-owned RDATE, agenda and reminder triage',()=>{
  it('unions finite all-day recurrence RDATE, EXDATE and source UID stable replacement',()=>{
    const source=['BEGIN:VCALENDAR','X-WR-CALNAME:Seminars','BEGIN:VEVENT','UID:lab-a','SUMMARY:Course',
      'DTSTART;VALUE=DATE:20261019','DTEND;VALUE=DATE:20261020','RRULE:FREQ=WEEKLY;COUNT=3',
      'RDATE;VALUE=DATE:20261022,20261030','EXDATE;VALUE=DATE:20261026',
      'END:VEVENT','END:VCALENDAR'].join('\r\n')
    const parsed=previewIcs(source)
    expect(parsed.skippedEvents).toBe(0)
    expect(parsed.records.map(x=>x.startDate)).toEqual(['2026-10-19','2026-10-22','2026-10-30','2026-11-02'])
    const prior=mergeIcs({schemaVersion:1,records:[record({id:'owner'})]},parsed).state
    const replace=mergeIcs(prior,previewIcs(source),'replace')
    expect(replace.duplicates).toBe(4)
    expect(replace.removed).toBe(0)
    expect(replace.state.records.map(r=>r.id)).toEqual(prior.records.map(r=>r.id))
  })
  it('imports finite all-day RDATE-only with an original-date recurring exception preceding master',()=>{
    const v=['BEGIN:VCALENDAR','X-WR-CALNAME:Study days',
      'BEGIN:VEVENT','UID:extra','RECURRENCE-ID;VALUE=DATE:20261103','SUMMARY:Moved',
      'DTSTART;VALUE=DATE:20261104','DTEND;VALUE=DATE:20261105','END:VEVENT',
      'BEGIN:VEVENT','UID:extra','SUMMARY:Study','DTSTART;VALUE=DATE:20261101',
      'DTEND;VALUE=DATE:20261102','RDATE;VALUE=DATE:20261103,20261106',
      'END:VEVENT','END:VCALENDAR'].join('\r\n')
    const p=previewIcs(v)
    expect(p.skippedEvents).toBe(0)
    expect(p.records.map(x=>x.startDate)).toEqual(['2026-11-01','2026-11-04','2026-11-06'])
    expect(p.records[1].sourceKey).toBe('Study days|extra|20261103')
  })
  it('handles source-zone timed RDATE independent of RRULE UNTIL, matching source EXDATE',()=>{
    const t=['BEGIN:VCALENDAR','X-WR-CALNAME:Berlin course','BEGIN:VEVENT','UID:tz-extra','SUMMARY:Lecture',
      'DTSTART;TZID=Europe/Berlin:20261019T100000','DTEND;TZID=Europe/Berlin:20261019T110000',
      'RRULE:FREQ=WEEKLY;UNTIL=20261019T080000Z',
      'RDATE;TZID=Europe/Berlin:20261021T123000,20261028T123000',
      'EXDATE;TZID=Europe/Berlin:20261021T123000','END:VEVENT','END:VCALENDAR'].join('\r\n')
    const p=previewIcs(t)
    expect(p.skippedEvents).toBe(0)
    expect(p.records.map(r=>r.start)).toEqual(['2026-10-19T08:00:00.000Z','2026-10-28T11:30:00.000Z'])
    expect(p.records[1].sourceKey).toBe('Berlin course|tz-extra|2026-10-28T11:30:00.000Z')
  })
  it('handles RDATE-only explicit UTC timed instances',()=>{
    const t=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:utc-extra','SUMMARY:Morning',
      'DTSTART:20261019T100000Z','DTEND:20261019T110000Z',
      'RDATE:20261020T143000Z,20261021T100000Z','END:VEVENT','END:VCALENDAR'].join('\r\n')
    expect(previewIcs(t).records.map(r=>r.start)).toEqual([
      '2026-10-19T10:00:00.000Z','2026-10-20T14:30:00.000Z','2026-10-21T10:00:00.000Z'])
  })
  it('rejects mixed clocks, RDATE PERIOD and orphan all-day overrides without partial import',()=>{
    const base=['BEGIN:VCALENDAR','X-WR-CALNAME:Authority','BEGIN:VEVENT','UID:master','SUMMARY:Safe',
      'DTSTART;TZID=Europe/Berlin:20261019T100000','DTEND;TZID=Europe/Berlin:20261019T110000','RRULE:FREQ=WEEKLY;COUNT=3']
    for(const extra of ['RDATE;TZID=Europe/Berlin:20261020T100000/20261020T110000',
      'RDATE:20261020T100000Z','RDATE;TZID=Europe/Berlin:20291020T100000']){
      const p=previewIcs([...base,extra,'END:VEVENT','END:VCALENDAR'].join('\r\n'))
      expect(p.records).toHaveLength(0)
      expect(p.skippedEvents).toBe(1)
      expect(()=>mergeIcs({schemaVersion:1,records:[]},p,'replace')).toThrow('incomplete')
    }
    const a=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:a','SUMMARY:Course',
      'DTSTART;VALUE=DATE:20261019','DTEND;VALUE=DATE:20261020','RRULE:FREQ=WEEKLY;COUNT=2',
      'END:VEVENT','BEGIN:VEVENT','UID:a','RECURRENCE-ID;VALUE=DATE:20261119',
      'SUMMARY:Orphan','DTSTART;VALUE=DATE:20261120','DTEND;VALUE=DATE:20261121',
      'END:VEVENT','END:VCALENDAR'].join('\r\n')
    expect(previewIcs(a).records).toHaveLength(0)
  })
  it('finds adjacent busy dates including a spanning all-day entry',()=>{
    const trip=record({id:'trip',allDay:true,startDate:'2026-10-19',endDateExclusive:'2026-10-22',
      start:fromLocalDateTime('2026-10-19T00:00'),end:fromLocalDateTime('2026-10-22T00:00')})
    expect(adjacentBusyDay([trip],'2026-10-19',1)).toBe('2026-10-20')
    expect(adjacentBusyDay([trip],'2026-10-23',-1)).toBe('2026-10-21')
    expect(adjacentBusyDay([],'2026-10-19',1)).toBeNull()
  })
  it('exports only selected source records and neutralizes spreadsheet formulas',()=>{
    const event=record({id:'private',title:'=HYPERLINK("evil")',location:'@attacker',description:'PRIVATE NOTES'})
    const imported=record({id:'import',title:'=IMPORT',source:'ics',sourceCalendar:'School',sourceKey:'id'})
    const csv=exportAgendaCsv([event],'2026-10-12','2026-10-12')
    expect(csv).toContain('"\'=HYPERLINK(""evil"")"')
    expect(csv).toContain('"\'@attacker"')
    expect(csv).not.toContain('PRIVATE NOTES')
    expect(csv).not.toContain('School')
    expect(exportAgendaCsv([event,imported],'2026-10-12','2026-10-12')).toContain('Imported: School')
    expect(()=>exportAgendaCsv([],'2026-10-12','2026-11-30')).toThrow('Agenda export')
  })
  it('reviews seven days overdue and dismisses only an explicit due batch',()=>{
    const r=record({id:'due',start:fromLocalDateTime('2026-10-12T10:00'),
      end:fromLocalDateTime('2026-10-12T11:00'),reminderMinutes:15})
    const state:CalendarState={schemaVersion:1,records:[r]},now=fromLocalDateTime('2026-10-17T10:00')
    expect(reminderItems(state,now,{},14,1)).toHaveLength(0)
    const due=reminderItems(state,now,{},14,7)
    expect(due).toHaveLength(1)
    expect(due[0].status).toBe('due')
    const next=dismissReminderBatch({},due)
    expect(next[due[0].key]).toEqual({kind:'dismiss'})
    expect(reminderItems(state,now,next,14,7)).toHaveLength(0)
    expect(()=>dismissReminderBatch({},[])).toThrow('Review')
    expect(()=>reminderItems(state,now,{},14,8)).toThrow('Invalid')
  })
})


describe('C12 bounded source-owned monthly BYMONTHDAY interoperability',()=>{
  it('expands last-day-of-month rules across short months without date drift',()=>{
    const rule=parseFiniteAllDayRule('FREQ=MONTHLY;COUNT=5;BYMONTHDAY=-1','2026-01-31')
    expect(expandFiniteAllDay('2026-01-31',rule)).toEqual([
      '2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31'])
  })
  it('supports a bounded selector list and truly skipped 31st-day months',()=>{
    expect(expandFiniteAllDay('2026-01-15',parseFiniteAllDayRule(
      'FREQ=MONTHLY;COUNT=5;BYMONTHDAY=15,-1','2026-01-15'))).toEqual([
        '2026-01-15','2026-01-31','2026-02-15','2026-02-28','2026-03-15'])
    expect(expandFiniteAllDay('2026-01-31',parseFiniteAllDayRule(
      'FREQ=MONTHLY;COUNT=3;BYMONTHDAY=31','2026-01-31'))).toEqual([
        '2026-01-31','2026-03-31','2026-05-31'])
  })
  it('preserves original imported source TZID and UID for end-of-month course series',()=>{
    const input=['BEGIN:VCALENDAR','X-WR-CALNAME:End of month',
      'BEGIN:VEVENT','UID:month-1','SUMMARY:Accounts',
      'DTSTART;TZID=Europe/Berlin:20260131T100000','DTEND;TZID=Europe/Berlin:20260131T110000',
      'RRULE:FREQ=MONTHLY;COUNT=4;BYMONTHDAY=-1','END:VEVENT','END:VCALENDAR'].join('\r\n')
    const p=previewIcs(input)
    expect(p.skippedEvents,p.warnings.join(' | ')).toBe(0)
    expect(p.records.map(r=>r.start)).toEqual([
      '2026-01-31T09:00:00.000Z','2026-02-28T09:00:00.000Z',
      '2026-03-31T08:00:00.000Z','2026-04-30T08:00:00.000Z'])
    expect(p.records.every(r=>r.source==='ics'&&r.sourceCalendar==='End of month'&&r.repeat===undefined)).toBe(true)
    const first=mergeIcs({schemaVersion:1,records:[record({id:'personal'})]},p).state
    const refresh=mergeIcs(first,previewIcs(input),'update')
    expect(refresh.duplicates).toBe(4)
    expect(refresh.state.records.map(r=>r.id)).toEqual(first.records.map(r=>r.id))
  })
  it('rejects unsupported monthly selectors and mismatching DTSTART rather than guessing',()=>{
    for(const rule of [
      'FREQ=WEEKLY;COUNT=3;BYMONTHDAY=-1',
      'FREQ=MONTHLY;COUNT=3;BYMONTHDAY=0',
      'FREQ=MONTHLY;COUNT=3;BYMONTHDAY=32',
      'FREQ=MONTHLY;COUNT=3;BYMONTHDAY=15,15',
      'FREQ=MONTHLY;COUNT=3;BYMONTHDAY=-31',
      'FREQ=MONTHLY;COUNT=3;BYMONTHDAY=-1;BYDAY=MO'
    ])expect(()=>parseFiniteAllDayRule(rule,'2026-01-15')).toThrow()
    const input=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:wrong-day','SUMMARY:Unsafe',
      'DTSTART;VALUE=DATE:20260115','DTEND;VALUE=DATE:20260116',
      'RRULE:FREQ=MONTHLY;COUNT=3;BYMONTHDAY=-1','END:VEVENT','END:VCALENDAR'].join('\r\n')
    expect(previewIcs(input).records).toHaveLength(0)
    expect(previewIcs(input).skippedEvents).toBe(1)
  })
})

describe('C12 additive personal recovery and imported-personal draft isolation',()=>{
  it('restores only original missing personal IDs with detached exceptions without touching current provider IDs',()=>{
    const imported=record({id:'ics-one',source:'ics',sourceCalendar:'University',sourceKey:'Uni|123'})
    const retained=record({id:'present',title:'Edited after backup'})
    const parent=record({id:'weekly',repeat:{frequency:'weekly',interval:1},excludedDates:['2026-10-19']})
    const edited=record({id:'detached',recurrenceParentId:'weekly',recurrenceDate:'2026-10-19'})
    const current:CalendarState={schemaVersion:1,records:[imported,retained]}
    const backup:CalendarState={schemaVersion:1,records:[{...retained,title:'Old title'},parent,edited]}
    const review=previewMissingPersonal(current,backup)
    expect(review.added.map(r=>r.id)).toEqual(['weekly','detached'])
    expect(review.state.records.slice(0,2)).toEqual(current.records)
    expect(review.state.records[0]).toBe(imported)
    expect(review.state.records[1]).toBe(retained)
    expect(validateState(review.state).records).toHaveLength(4)
    expect(previewMissingPersonal(review.state,backup).added).toHaveLength(0)
  })
  it('refuses restoring detached exceptions into a changed incompatible parent',()=>{
    const parent=record({id:'weekly',repeat:{frequency:'weekly',interval:1},excludedDates:['2026-10-19']})
    const edited=record({id:'detached',recurrenceParentId:'weekly',recurrenceDate:'2026-10-19'})
    const old:CalendarState={schemaVersion:1,records:[parent,edited]}
    const current:CalendarState={schemaVersion:1,records:[{...parent,excludedDates:[]}]}
    expect(()=>previewMissingPersonal(current,old)).toThrow('Detached event')
    expect(current.records).toHaveLength(1)
  })
  it('prepares a source-disconnected personal draft without editing the original imported occurrence',()=>{
    const imported=record({id:'ics-lecture',source:'ics',sourceCalendar:'School',sourceKey:'School|lecture',
      title:'Guest lecture'})
    const occ=occurrencesBetween([imported],'2026-10-12','2026-10-12')[0]
    const copy=personalDraftFromImported(occ,'private-lecture',15)
    expect(copy.id).toBe('private-lecture')
    expect(copy.source).toBe('personal')
    expect(copy.title).toBe('Guest lecture')
    expect(copy.reminderMinutes).toBe(15)
    expect(copy.sourceCalendar).toBeUndefined()
    expect(copy.sourceKey).toBeUndefined()
    expect(copy.repeat).toBeUndefined()
    expect(copy.recurrenceParentId).toBeUndefined()
    const state=mergeIcs({schemaVersion:1,records:[copy,imported]},previewIcs([
      'BEGIN:VCALENDAR','X-WR-CALNAME:School','BEGIN:VEVENT','UID:lecture',
      'SUMMARY:External new title','DTSTART:20261012T100000Z',
      'DTEND:20261012T110000Z','END:VEVENT','END:VCALENDAR'].join('\r\n'))).state
    expect(state.records[0]).toEqual(copy)
    expect(state.records[1]).toEqual(imported)
    expect(()=>personalDraftFromImported({...occ,source:'personal'},'other')).toThrow('imported')
  })
})
describe('C12 lock-screen privacy and legacy reminder settings',()=>{
  it('defaults pre-C12 preferences to generic notifications without leaking title/time',()=>{
    const prior=validateReminderSettings({defaultLead:15,quietHours:'22-07'})
    expect(prior.notificationPreview).toBe('private')
    expect(foregroundNotificationText('Confidential therapy','2026-10-12T09:00:00.000Z',prior))
      .toEqual({title:'THIEPN Calendar reminder',body:'Open Calendar to review your local reminder.'})
    const detailed=validateReminderSettings({...prior,notificationPreview:'details'})
    const content=foregroundNotificationText('Client visit','2026-10-12T09:00:00.000Z',detailed)
    expect(content.title).toContain('Client visit')
    expect(content.body).toContain('Local reminder')
    expect(()=>validateReminderSettings({...prior,notificationPreview:'remote'})).toThrow('Invalid')
  })
})


describe('C13 supported RFC5545 ordinal monthly BYDAY imports',()=>{
  it('calculates second Tuesday and last Friday across short months and DST-year boundaries',()=>{
    expect(expandFiniteAllDay('2026-01-13',parseFiniteAllDayRule(
      'FREQ=MONTHLY;COUNT=4;BYDAY=2TU','2026-01-13'))).toEqual([
        '2026-01-13','2026-02-10','2026-03-10','2026-04-14'])
    expect(expandFiniteAllDay('2026-01-30',parseFiniteAllDayRule(
      'FREQ=MONTHLY;COUNT=4;BYDAY=-1FR','2026-01-30'))).toEqual([
        '2026-01-30','2026-02-27','2026-03-27','2026-04-24'])
  })
  it('supports every named weekday within a month while honoring RRULE COUNT',()=>{
    const result=expandFiniteAllDay('2026-01-05',parseFiniteAllDayRule(
      'FREQ=MONTHLY;COUNT=7;BYDAY=MO','2026-01-05'))
    expect(result).toEqual(['2026-01-05','2026-01-12','2026-01-19','2026-01-26',
      '2026-02-02','2026-02-09','2026-02-16'])
  })
  it('retains named zone wall-time across spring DST and UID identities when refreshed',()=>{
    const input=['BEGIN:VCALENDAR','X-WR-CALNAME:Training','BEGIN:VEVENT','UID:monthly-tue',
      'SUMMARY:C13 Monthly lab','DTSTART;TZID=Europe/Berlin:20260113T090000',
      'DTEND;TZID=Europe/Berlin:20260113T100000',
      'RRULE:FREQ=MONTHLY;COUNT=4;BYDAY=2TU','END:VEVENT','END:VCALENDAR'].join('\r\n')
    const initial=previewIcs(input)
    expect(initial.skippedEvents).toBe(0)
    expect(initial.records.map(x=>x.start)).toEqual([
      '2026-01-13T08:00:00.000Z','2026-02-10T08:00:00.000Z',
      '2026-03-10T08:00:00.000Z','2026-04-14T07:00:00.000Z'])
    const one=mergeIcs({schemaVersion:1,records:[record({id:'private'})]},initial).state
    const two=mergeIcs(one,previewIcs(input),'replace')
    expect(two.duplicates).toBe(4)
    expect(two.state.records.map(r=>r.id)).toEqual(one.records.map(r=>r.id))
  })
  it('rejects nonexistent ordinals, duplicate selectors and DTSTART outside selector set',()=>{
    const bad=['FREQ=MONTHLY;COUNT=2;BYDAY=6MO',
      'FREQ=MONTHLY;COUNT=2;BYDAY=-6MO',
      'FREQ=MONTHLY;COUNT=2;BYDAY=0MO',
      'FREQ=MONTHLY;COUNT=2;BYDAY=1MO,1MO',
      'FREQ=MONTHLY;COUNT=2;BYDAY=1MO;BYMONTHDAY=1',
      'FREQ=MONTHLY;COUNT=2;BYDAY=-1FR']
    for(const rule of bad)
      expect(()=>parseFiniteAllDayRule(rule,'2026-01-13')).toThrow()
    expect(()=>parseFiniteAllDayRule('FREQ=WEEKLY;COUNT=3;BYDAY=2TU','2026-01-13')).toThrow()
  })
})
describe('C13 explicitly bounded and source-safe RFC DURATION imports',()=>{
  it('imports standalone all-day P2D and timed PT90M without a DTEND',()=>{
    const input=['BEGIN:VCALENDAR','X-WR-CALNAME:Safe duration',
      'BEGIN:VEVENT','UID:days','SUMMARY:Two-day retreat','DTSTART;VALUE=DATE:20261103',
      'DURATION:P2D','END:VEVENT',
      'BEGIN:VEVENT','UID:hours','SUMMARY:Seminar','DTSTART:20261103T100000Z',
      'DURATION:PT1H30M','END:VEVENT','END:VCALENDAR'].join('\r\n')
    const preview=previewIcs(input)
    expect(preview.skippedEvents).toBe(0)
    expect(preview.records[0].startDate).toBe('2026-11-03')
    expect(preview.records[0].endDateExclusive).toBe('2026-11-05')
    expect(preview.records[1].end).toBe('2026-11-03T11:30:00.000Z')
    expect(parseIcsDuration('P1W',true)).toBe(7)
    expect(parseIcsDuration('PT1H30M',false)).toBe(5400000)
  })
  it('materializes source-zone recurrence DURATION with RDATE/EXDATE and original UID stable',()=>{
    const input=['BEGIN:VCALENDAR','X-WR-CALNAME:Classes','BEGIN:VEVENT',
      'UID:c13-span','SUMMARY:Lab',
      'DTSTART;TZID=Europe/Berlin:20260324T093000','DURATION:PT90M',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'RDATE;TZID=Europe/Berlin:20260401T103000',
      'EXDATE;TZID=Europe/Berlin:20260331T093000',
      'END:VEVENT','END:VCALENDAR'].join('\r\n')
    const p=previewIcs(input)
    expect(p.skippedEvents).toBe(0)
    expect(p.records.map(r=>r.start)).toEqual([
      '2026-03-24T08:30:00.000Z','2026-04-01T08:30:00.000Z','2026-04-07T07:30:00.000Z'])
    expect(p.records.map(r=>(Date.parse(r.end)-Date.parse(r.start))/60000)).toEqual([90,90,90])
    expect(mergeIcs({schemaVersion:1,records:[]},p).added).toBe(3)
  })
  it('resolves an explicit timed occurrence override DURATION while retaining its original source key',()=>{
    const input=['BEGIN:VCALENDAR','X-WR-CALNAME:Tutorials',
      'BEGIN:VEVENT','UID:dur','SUMMARY:Tutorial','DTSTART:20261019T100000Z',
      'DURATION:PT1H','RRULE:FREQ=DAILY;COUNT=2','END:VEVENT',
      'BEGIN:VEVENT','UID:dur','RECURRENCE-ID:20261020T100000Z',
      'SUMMARY:Extended tutorial','DTSTART:20261020T140000Z',
      'DURATION:PT2H','END:VEVENT','END:VCALENDAR'].join('\r\n')
    const p=previewIcs(input)
    expect(p.skippedEvents).toBe(0)
    expect(p.records).toHaveLength(2)
    expect(p.records[1].sourceKey).toBe('Tutorials|dur|2026-10-20T10:00:00.000Z')
    expect(p.records[1].start).toBe('2026-10-20T14:00:00.000Z')
    expect(p.records[1].end).toBe('2026-10-20T16:00:00.000Z')
  })
  it('rejects conflicting end and duration fields, nominal timed days and orphan source exceptions',()=>{
    const invalid=['PT0M','P1D','PT169H','PT2H60M','PT','PT1M61S','-PT15M']
    for(const text of invalid)expect(()=>parseIcsDuration(text,false)).toThrow()
    for(const text of ['P0D','P32D','PT1H','P5W'])
      expect(()=>parseIcsDuration(text,true)).toThrow()
    const conflict=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:one','SUMMARY:Bad',
      'DTSTART:20261019T100000Z','DTEND:20261019T110000Z',
      'DURATION:PT1H','RRULE:FREQ=DAILY;COUNT=2','END:VEVENT','END:VCALENDAR'].join('\r\n')
    expect(previewIcs(conflict).records).toHaveLength(0)
    expect(previewIcs(conflict).skippedEvents).toBe(1)
    const orphan=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:missing',
      'RECURRENCE-ID:20261104T100000Z','SUMMARY:Detached without master',
      'DTSTART:20261104T120000Z','DURATION:PT1H','END:VEVENT','END:VCALENDAR'].join('\r\n')
    expect(previewIcs(orphan).records).toHaveLength(0)
    expect(previewIcs(orphan).skippedEvents).toBe(1)
  })
  it('refuses ambiguous RANGE and duplicate all-day exception identifiers as incomplete source',()=>{
    const head=['BEGIN:VCALENDAR','X-WR-CALNAME:Original','BEGIN:VEVENT','UID:series',
      'SUMMARY:Class','DTSTART;VALUE=DATE:20261019','DURATION:P1D',
      'RRULE:FREQ=DAILY;COUNT=3','END:VEVENT']
    const child=['BEGIN:VEVENT','UID:series','RECURRENCE-ID;VALUE=DATE:20261020',
      'SUMMARY:Moved','DTSTART;VALUE=DATE:20261021','DURATION:P1D','END:VEVENT']
    const duplicate=previewIcs([...head,...child,...child,'END:VCALENDAR'].join('\r\n'))
    expect(duplicate.records).toHaveLength(0)
    expect(duplicate.skippedEvents).toBe(1)
    expect(()=>mergeIcs({schemaVersion:1,records:[]},duplicate,'replace')).toThrow('incomplete')
    const range=previewIcs([...head,...child.map(x=>x==='RECURRENCE-ID;VALUE=DATE:20261020'?
      'RECURRENCE-ID;VALUE=DATE;RANGE=THISANDFUTURE:20261020':x),'END:VCALENDAR'].join('\r\n'))
    expect(range.records).toHaveLength(0)
    expect(range.skippedEvents).toBe(1)
  })
})
describe('C13 source-filtered local seven-day planning',()=>{
  it('uses unioned timed minutes without double counting overlapping blocks, and separates all-day',()=>{
    const monday=record({id:'a',start:fromLocalDateTime('2026-10-12T10:00'),
      end:fromLocalDateTime('2026-10-12T12:00')})
    const second=record({id:'b',start:fromLocalDateTime('2026-10-12T11:00'),
      end:fromLocalDateTime('2026-10-12T13:30'),source:'ics',sourceCalendar:'School',sourceKey:'b'})
    const allDay=record({id:'c',allDay:true,startDate:'2026-10-12',endDateExclusive:'2026-10-14',
      start:fromLocalDateTime('2026-10-12T00:00'),end:fromLocalDateTime('2026-10-14T00:00')})
    const week=sevenDayWorkload([monday,second,allDay],'2026-10-12')
    expect(week).toHaveLength(7)
    expect(week[0]).toMatchObject({date:'2026-10-12',timedCount:2,allDayCount:1,
      busyMinutes:210,overlaps:true,importedCount:1})
    expect(week[1]).toMatchObject({date:'2026-10-13',allDayCount:1,timedCount:0,busyMinutes:0})
    expect(sevenDayWorkload([monday,allDay],'2026-10-12')[0].busyMinutes).toBe(120)
  })
  it('clips actual elapsed-time blocks at a DST-shortened local midnight boundary',()=>{
    const cross=record({id:'midnight',start:fromLocalDateTime('2026-03-28T23:30'),
      end:fromLocalDateTime('2026-03-29T03:30')})
    const week=sevenDayWorkload([cross],'2026-03-28')
    expect(week[0].busyMinutes).toBe(30)
    // Spring clocks jump directly 01:59 -> 03:00. No invented lost hour.
    expect(week[1].busyMinutes).toBe(150)
    expect(week[1].timedCount).toBe(1)
  })
})
