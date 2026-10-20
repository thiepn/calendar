import {describe,it,expect} from 'vitest'
import type {CalendarRecord,CalendarState} from '../types'
import {originalTrailPage,originalTrailRecords,resolveTrailSelection} from './agenda-trail'
import {occurrencesBetween} from './occurrences'
const time=(d:string,h='08')=>d+'T'+h+':00:00.000Z'
const master:CalendarRecord={
 id:'original-daily',title:'Original daily series',description:'Author notes',location:'',
 start:time('2026-11-25'),end:time('2026-11-25','09'),allDay:false,source:'personal',
 timeZone:'Europe/Berlin',repeat:{frequency:'daily',interval:1,until:'2026-12-20'},
 excludedDates:['2026-11-28','2026-11-30'],updatedAt:time('2026-10-19')
}
const detached:CalendarRecord={
 ...master,id:'original-detached',title:'Edited original occurrence',
 start:time('2026-12-02','12'),end:time('2026-12-02','13'),repeat:undefined,excludedDates:undefined,
 recurrenceParentId:'original-daily',recurrenceDate:'2026-11-28'
}
const imported=(i:number):CalendarRecord=>{
 const day=String(1+i).padStart(2,'0')
 const date=i<30?'2026-11-'+day:'2026-12-'+String(i-29).padStart(2,'0')
 return {id:'ics-source-'+i,title:'Lecture '+i,description:'',location:'',
 start:time(date),end:time(date,'09'),source:'ics',sourceCalendar:'Campus primary',
 sourceKey:'Campus primary|UID-'+i,sourceTimeZone:'Europe/Berlin',allDay:false,
 updatedAt:time('2026-10-19')}
}
const base:CalendarState={schemaVersion:1,records:[master,detached,...Array.from({length:44},(_,i)=>imported(i))]}
describe('C40 original series and imported source trails',()=>{
 it('shows finite recurring source dates, skips and detaches without making new writers',()=>{
  const result=originalTrailPage(base,{kind:'series',recordId:master.id},'2026-11-26',30,0)
  expect(result.title).toBe(master.title)
  expect(result.skipped).toBe(1)
  expect(result.detached).toBe(1)
  expect(result.rows.some(row=>row.kind==='skipped'&&row.date==='2026-11-30')).toBe(true)
  expect(result.rows.some(row=>row.originalDate==='2026-11-28')).toBe(true)
  expect(result.rows.some(row=>row.date==='2026-11-28'&&row.kind==='skipped')).toBe(false)
  expect(result.rows.some(row=>row.kind==='occurrence'&&row.sourceTimeZone==='Europe/Berlin')).toBe(true)
 })
 it('opens the correct recurring parent from an independently edited detached original',()=>{
  const a=originalTrailPage(base,{kind:'series',recordId:detached.id},'2026-11-26',30,0)
  expect(a.scope).toBe('series')
  expect(a.title).toBe(master.title)
  const row=a.rows.find(r=>r.originalDate==='2026-11-28')!
  expect(row.item?.recordId).toBe(detached.id)
  const current=resolveTrailSelection(base,{kind:'series',recordId:detached.id},row,'2026-11-26',30)
  expect(current.key).toBe(row.key)
  expect(current.start).toBe(detached.start)
 })
 it('explores all 44 source-owned original ICS UIDs with real pagination and retains imported source TZID',()=>{
  const target={kind:'source' as const,name:'Campus primary'}
  const p0=originalTrailPage(base,target,'2026-11-01',90,0,16)
  expect(p0.total).toBe(44);expect(p0.rows).toHaveLength(16)
  expect(p0.page).toBe(0);expect(p0.pages).toBe(3)
  const p2=originalTrailPage(base,target,'2026-11-01',90,2,16)
  expect(p2.rows).toHaveLength(12);expect(p2.end).toBe(44)
  expect(p2.rows.every(row=>row.item?.sourceCalendar==='Campus primary')).toBe(true)
  expect(p2.rows.every(row=>row.sourceTimeZone==='Europe/Berlin')).toBe(true)
  const selected=p2.rows[4]
  expect(resolveTrailSelection(base,target,selected,'2026-11-01',90).recordId).toBe(selected.item?.recordId)
  expect(originalTrailPage(base,target,'2026-11-01',90,300,16).page).toBe(2)
 })
 it('never interprets an imported source as an editable personal recurrence',()=>{
  expect(()=>originalTrailRecords(base,{kind:'series',recordId:'ics-source-0'})).toThrow('personal series')
  expect(()=>originalTrailRecords(base,{kind:'source',name:'Nonexistent'})).toThrow('no longer')
  expect(()=>originalTrailRecords(base,{kind:'source',name:'Campus primary'}))
    .not.toThrow()
 })
 it('rejects stale changed source titles, UID reassignment, moved instants and missing originals',()=>{
  const target={kind:'source' as const,name:'Campus primary'}
  const result=originalTrailPage(base,target,'2026-11-01',90,0)
  const row=result.rows[0]
  const modified:CalendarState={schemaVersion:1,records:base.records.map(r=>r.id===row.item?.recordId?
    {...r,title:'Changed in other tab'}:r)}
  expect(()=>resolveTrailSelection(modified,target,row,'2026-11-01',90)).toThrow('changed')
  const renamed:CalendarState={schemaVersion:1,records:base.records.map(r=>r.id===row.item?.recordId?
    {...r,sourceKey:'Campus primary|reassigned-UID'}:r)}
  // Same local ID with reassigned original provider UID must not be trusted.
  expect(()=>resolveTrailSelection(renamed,target,row,'2026-11-01',90)).toThrow('changed')
  const erased:CalendarState={schemaVersion:1,records:base.records.filter(r=>r.id!==row.item?.recordId)}
  expect(()=>resolveTrailSelection(erased,target,row,'2026-11-01',90)).toThrow('no longer')
 })
 it('validates bounded dates, page sizes, imported sources and canonical record ownership',()=>{
  expect(()=>originalTrailPage(base,{kind:'series',recordId:master.id},'2026-13-01',30,0)).toThrow('date')
  expect(()=>originalTrailPage(base,{kind:'series',recordId:master.id},'2026-11-26',365 as never,0)).toThrow('30- or 90-day')
  expect(()=>originalTrailPage(base,{kind:'series',recordId:master.id},'2026-11-26',30,-1)).toThrow('page')
  expect(()=>originalTrailPage(base,{kind:'series',recordId:master.id},'2026-11-26',30,0,50)).toThrow('page')
  expect(()=>resolveTrailSelection(base,{kind:'series',recordId:master.id},{
   key:'skip:original-daily@2026-11-30',kind:'skipped',date:'2026-11-30',title:master.title,transparent:false
  },'2026-11-26',30)).toThrow('Skipped dates')
 })
 it('is projection-only: checks no mutation, no new record copies and matches existing original engine',()=>{
  const before=JSON.stringify(base)
  const result=originalTrailPage(base,{kind:'series',recordId:master.id},'2026-11-26',90,0,30)
  const originals=occurrencesBetween([master,detached],'2026-11-26','2027-02-23')
  expect(result.active).toBe(originals.length)
  expect(JSON.stringify(base)).toBe(before)
  expect(base.records).toHaveLength(46)
 })
})
