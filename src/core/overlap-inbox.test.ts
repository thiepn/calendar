import {describe,it,expect} from 'vitest'
import type {CalendarRecord,CalendarState} from '../types'
import {overlapInbox,resolveOverlapParticipant} from './overlap-inbox'
const base:CalendarRecord={
  id:'c42-personal',title:'Original personal appointment',description:'Private original text',
  location:'Office',source:'personal',allDay:false,timeZone:'Europe/Berlin',
  start:'2026-11-11T09:00:00.000Z',end:'2026-11-11T10:00:00.000Z',
  updatedAt:'2026-10-19T12:00:00.000Z'
}
const ics:CalendarRecord={...base,id:'c42-ics',source:'ics',title:'Upstream sensitive name',
  description:'Provider note',timeZone:undefined,sourceTimeZone:'Europe/Berlin',
  sourceCalendar:'Private imported source',sourceKey:'Private imported source|UID-1',
  start:'2026-11-11T09:30:00.000Z',end:'2026-11-11T10:30:00.000Z'}
const hidden:CalendarRecord={...ics,id:'c42-hidden',title:'Secret calendar content',
  sourceKey:'Private imported source|UID-2',
  start:'2026-11-11T09:45:00.000Z',end:'2026-11-11T10:15:00.000Z'}
const free:CalendarRecord={...ics,id:'c42-free',title:'Transparent free event',
  transparent:true,sourceKey:'Private imported source|UID-3',
  start:'2026-11-11T09:15:00.000Z',end:'2026-11-11T10:00:00.000Z'}
const allDay:CalendarRecord={...base,id:'c42-all-day',allDay:true,timeZone:undefined,
  title:'All-day original',startDate:'2026-11-11',endDateExclusive:'2026-11-13',
  start:'2026-11-11T00:00:00.000Z',end:'2026-11-13T00:00:00.000Z'}
const state:CalendarState={schemaVersion:1,records:[base,ics,hidden,free,allDay]}
describe('C42 canonical saved-calendar overlap inbox',()=>{
 it('materializes unique UTC conflict pairs across all original sources, including hidden',()=>{
  const before=JSON.stringify(state)
  const result=overlapInbox(state,'2026-11-11',7,['Private imported source'])
  expect(result.total).toBe(3)
  expect(result.importedPairs).toBe(3)
  expect(result.hiddenPairs).toBe(3)
  expect(result.allDayCount).toBeGreaterThan(0)
  expect(result.visible.every(pair=>pair.first.item.key!==pair.second.item.key)).toBe(true)
  expect(result.visible.some(pair=>pair.first.item.recordId==='c42-free'||pair.second.item.recordId==='c42-free')).toBe(false)
  expect(result.visible.some(pair=>pair.first.item.recordId==='c42-all-day'||pair.second.item.recordId==='c42-all-day')).toBe(false)
  expect(JSON.stringify(state)).toBe(before)
 })
 it('reports true intersection instants, independent of device-local rendering',()=>{
  const result=overlapInbox(state,'2026-11-11',7,[])
  const match=result.visible.find(pair=>[pair.first.item.recordId,pair.second.item.recordId].includes('c42-personal')&&
    [pair.first.item.recordId,pair.second.item.recordId].includes('c42-ics'))!
  expect(match.start).toBe('2026-11-11T09:30:00.000Z')
  expect(match.end).toBe('2026-11-11T10:00:00.000Z')
  expect(match.id).toContain('c42-ics@')
  expect(match.id).toContain('c42-personal@')
 })
 it('detects overlaps across midnight without duplicating their source pair by day',()=>{
  const first={...base,id:'c42-cross-first',start:'2026-11-11T23:30:00.000Z',end:'2026-11-12T01:00:00.000Z',timeZone:undefined}
  const second={...base,id:'c42-cross-second',start:'2026-11-12T00:15:00.000Z',end:'2026-11-12T01:15:00.000Z',timeZone:undefined}
  const result=overlapInbox({schemaVersion:1,records:[first,second]},'2026-11-11',7,[])
  expect(result.total).toBe(1)
  expect(result.visible[0].start).toBe(second.start)
  expect(result.visible[0].end).toBe(first.end)
 })
 it('preserves canonical recurrence exclusions and detached replacement source IDs',()=>{
  const repeating:CalendarRecord={...base,id:'c42-repeats',repeat:{frequency:'daily',interval:1,until:'2026-11-14'},
    excludedDates:['2026-11-12']}
  const original={...base,id:'c42-detached',title:'Original detached replacement',
    start:'2026-11-12T09:00:00.000Z',end:'2026-11-12T10:00:00.000Z',
    recurrenceParentId:'c42-repeats',recurrenceDate:'2026-11-12'}
  const conflicting={...base,id:'c42-regular',start:'2026-11-12T09:45:00.000Z',
    end:'2026-11-12T10:15:00.000Z'}
  const result=overlapInbox({schemaVersion:1,records:[repeating,original,conflicting]},'2026-11-11',7,[])
  expect(result.total).toBe(1)
  expect(result.visible[0].first.item.recordId).toBe('c42-detached')
  expect(result.visible[0].second.item.recordId).toBe('c42-regular')
 })
 it('paginates dense originals independently and fails closed above the cap',()=>{
  const records=Array.from({length:15},(_,i)=>({...base,id:'c42-dense-'+i}))
  const many={schemaVersion:1 as const,records}
  const one=overlapInbox(many,'2026-11-11',7,[],0,12)
  expect(one.total).toBe(105)
  expect(one.pages).toBe(9)
  expect(one.visible).toHaveLength(12)
  const end=overlapInbox(many,'2026-11-11',7,[],100,12)
  expect(end.page).toBe(8)
  expect(end.visible).toHaveLength(9)
  const overflow=Array.from({length:46},(_,i)=>({...base,id:'c42-over-'+i}))
  expect(()=>overlapInbox({schemaVersion:1,records:overflow},'2026-11-11',7,[])).toThrow('1,000 overlaps')
 })
 it('resolves original owner and full UTC record identity, refusing changed imported UID',()=>{
  const match=overlapInbox(state,'2026-11-11',7,[]).visible[0]
  const subject=[match.first,match.second].find(item=>item.item.source==='ics')!
  expect(resolveOverlapParticipant(state,subject)).toMatchObject({
    recordId:subject.item.recordId,title:subject.item.title
  })
  const moved={schemaVersion:1 as const,records:state.records.map(record=>record.id===subject.item.recordId?
    {...record,start:'2026-11-11T10:40:00.000Z',end:'2026-11-11T11:40:00.000Z'}:record)}
  expect(()=>resolveOverlapParticipant(moved,subject)).toThrow('changed')
  const reused={schemaVersion:1 as const,records:state.records.map(record=>record.id===subject.item.recordId?
    {...record,sourceKey:'Other calendar|newUID'}:record)}
  expect(()=>resolveOverlapParticipant(reused,subject)).toThrow('source')
  const removed={schemaVersion:1 as const,records:state.records.filter(r=>r.id!==subject.item.recordId)}
  expect(()=>resolveOverlapParticipant(removed,subject)).toThrow('source')
 })
 it('rejects unsupported horizons, malformed dates and overlarge page sizes',()=>{
  expect(()=>overlapInbox(state,'2026-13-11',7,[])).toThrow('date')
  expect(()=>overlapInbox(state,'2026-11-11',100 as 7,[])).toThrow('7, 14 or 30')
  expect(()=>overlapInbox(state,'2026-11-11',7,[],-1)).toThrow('page')
  expect(()=>overlapInbox(state,'2026-11-11',7,[],0,31)).toThrow('page')
 })
})
