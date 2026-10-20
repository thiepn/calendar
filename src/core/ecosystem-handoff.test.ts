import {describe,it,expect} from 'vitest'
import {exportHubHandoffIcs,reviewHubHandoff,previewIcs} from './ics'
import type {CalendarRecord,CalendarState} from '../types'

const original:CalendarRecord={
  id:'personal-origin-100',title:'Private strategy review',description:'Sensitive details',
  location:'Room 42',start:'2026-10-19T07:00:00.000Z',end:'2026-10-19T08:00:00.000Z',
  allDay:false,source:'personal',timeZone:'Europe/Berlin',updatedAt:'2026-10-18T12:00:00.000Z'
}
const imported:CalendarRecord={
  id:'ics-original-200',title:'University tutorial',description:'Academic source description',
  location:'Mathematics institute',start:'2026-10-19T09:00:00.000Z',end:'2026-10-19T10:00:00.000Z',
  allDay:false,source:'ics',sourceCalendar:'University timetable',
  sourceKey:'University timetable|original-uid@academic.example|20261019T110000',
  sourceTimeZone:'Europe/Berlin',updatedAt:'2026-10-18T12:00:00.000Z'
}
const daily:CalendarRecord={
  ...original,id:'repeating-original-300',title:'Recurring source',description:'',
  start:'2026-10-18T07:00:00.000Z',end:'2026-10-18T08:00:00.000Z',
  repeat:{frequency:'daily',interval:1},excludedDates:['2026-10-19']
}
const detached:CalendarRecord={
  ...original,id:'detached-original-301',title:'Detached original',
  recurrenceParentId:daily.id,recurrenceDate:'2026-10-19'
}
const allDay:CalendarRecord={
  ...original,id:'all-day-400',title:'All day authored',description:'',
  start:'2026-10-19T00:00:00.000Z',end:'2026-10-21T00:00:00.000Z',allDay:true,
  startDate:'2026-10-19',endDateExclusive:'2026-10-21',timeZone:undefined
}
const state:CalendarState={schemaVersion:1,records:[original,imported,daily,detached,allDay]}
const defaultOptions={from:'2026-10-19',through:'2026-10-20',privacy:'titles' as const,
  includeImported:false}
describe('C38 verified source-authentic read-only Hub handoff',()=>{
  it('reviews original event instances with import consent off and a bounded window',()=>{
    const r=reviewHubHandoff(state,defaultOptions)
    expect(r.imported).toBe(0)
    expect(r.personal).toBeGreaterThan(0)
    expect(r.sources).toEqual(['Calendar personal'])
    expect(r.excludedImported).toBe(1)
    expect(r.items.some(x=>x.title==='University tutorial')).toBe(false)
    expect(r.items.some(x=>x.title==='Detached original')).toBe(true)
  })
  it('keeps source IDs and UTC instants under a reviewed titles-only export',()=>{
    const output=exportHubHandoffIcs(state,{...defaultOptions,includeImported:true})
    expect(output).toContain('X-WR-CALNAME:THIEPN Calendar reviewed snapshot')
    expect(output).toContain('X-THIEPN-ORIGINAL-RECORD:ics-original-200')
    expect(output).toContain('X-THIEPN-SOURCE-CALENDAR:University timetable')
    expect(output).toContain('X-THIEPN-SOURCE-TZID:Europe/Berlin')
    expect(output).toContain('X-THIEPN-ORIGINAL-RECORD:personal-origin-100')
    expect(output).toContain('DTSTART:20261019T070000Z')
    expect(output).not.toContain('Sensitive details')
    expect(output).not.toContain('Room 42')
    const roundTrip=previewIcs(output)
    expect(roundTrip.skippedEvents).toBe(0)
    expect(roundTrip.records.length).toBe(reviewHubHandoff(state,{...defaultOptions,includeImported:true}).count)
    expect(roundTrip.records.some(r=>r.start===original.start)).toBe(true)
  })
  it('renders busy-only snapshots without exposing identifiers, titles, notes or source labels',()=>{
    const payload=exportHubHandoffIcs(state,{...defaultOptions,includeImported:true,privacy:'busy'})
    for(const secret of ['Private strategy review','Sensitive details','Room 42','University tutorial',
      'ics-original-200','personal-origin-100','University timetable','original-uid@academic.example'])
      expect(payload).not.toContain(secret)
    expect(payload).toContain('SUMMARY:Busy')
    expect(payload).not.toContain('X-THIEPN-ORIGINAL')
    expect(payload).not.toContain('X-THIEPN-SOURCE-OWNER')
    expect(previewIcs(payload).records).toHaveLength(reviewHubHandoff(state,{...defaultOptions,includeImported:true}).count)
  })
  it('preserves details only after choosing the details scope',()=>{
    const payload=exportHubHandoffIcs(state,{...defaultOptions,privacy:'details'})
    expect(payload).toContain('DESCRIPTION:Sensitive details')
    expect(payload).toContain('LOCATION:Room 42')
    expect(payload).not.toContain('Academic source description')
    expect(payload).toContain('X-THIEPN-READ-ONLY:TRUE')
  })
  it('keeps exact detached instance identity and excludes all other original series days',()=>{
    const review=reviewHubHandoff(state,{...defaultOptions,
      occurrenceKey:'detached-original-301@2026-10-19'})
    expect(review.count).toBe(1)
    expect(review.items[0].recordId).toBe(detached.id)
    const text=exportHubHandoffIcs(state,{...defaultOptions,
      occurrenceKey:'detached-original-301@2026-10-19'})
    expect(text.split('BEGIN:VEVENT').length-1).toBe(1)
    expect(text).toContain('X-THIEPN-ORIGINAL-RECORD:detached-original-301')
    expect(text).not.toContain('X-THIEPN-ORIGINAL-RECORD:repeating-original-300')
    expect(()=>reviewHubHandoff(state,{...defaultOptions,occurrenceKey:'missing'})).toThrow('changed')
  })
  it('retains date-only multi-day end exclusivity for temporary Hub projection',()=>{
    const payload=exportHubHandoffIcs(state,{...defaultOptions,occurrenceKey:'all-day-400@2026-10-19'})
    expect(payload).toContain('DTSTART;VALUE=DATE:20261019')
    expect(payload).toContain('DTEND;VALUE=DATE:20261021')
    const parsed=previewIcs(payload)
    expect(parsed.records[0].startDate).toBe('2026-10-19')
    expect(parsed.records[0].endDateExclusive).toBe('2026-10-21')
  })
  it('rejects invalid windows, no selected occurrences and excessive disclosure',()=>{
    expect(()=>reviewHubHandoff({schemaVersion:1,records:[original,imported]},{...defaultOptions,from:'2026-11-05',through:'2026-11-08'})).toThrow('No source')
    expect(()=>reviewHubHandoff(state,{...defaultOptions,through:'2026-11-25'})).toThrow('31 days')
    expect(()=>reviewHubHandoff(state,{...defaultOptions,from:'2026-13-01'})).toThrow('calendar date')
    expect(()=>reviewHubHandoff(state,{...defaultOptions,privacy:'raw' as never})).toThrow('privacy')
  })
  it('does not change, stage, or own any original personal or imported calendar records',()=>{
    const before=JSON.stringify(state)
    const r=reviewHubHandoff(state,{...defaultOptions,includeImported:true})
    exportHubHandoffIcs(state,{...defaultOptions,includeImported:true})
    expect(JSON.stringify(state)).toBe(before)
    expect(r.items.every(x=>state.records.some(y=>y.id===x.recordId))).toBe(true)
  })
})
