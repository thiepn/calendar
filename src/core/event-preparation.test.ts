import {describe,expect,it} from 'vitest'
import type {CalendarRecord,CalendarState} from '../types'
import {occurrencesBetween} from './occurrences'
import {confirmPreparationSlot,planPreparationBlocks,resolvePreparationAnchor,
  type PreparationAnchor,type PreparationOptions} from './event-preparation'

const iso=(date:string,hour:number)=>date+'T'+String(hour).padStart(2,'0')+':00:00.000Z'
const personal:CalendarRecord={
 id:'original-exam',title:'Exam preparation target',source:'personal',allDay:false,
 description:'Private topic',location:'Room A',timeZone:'Europe/Berlin',
 start:iso('2026-11-18',18),end:iso('2026-11-18',19),updatedAt:iso('2026-10-19',12)
}
const imported:CalendarRecord={
 id:'read-only-class',title:'Unavailable private lecture',source:'ics',allDay:false,
 description:'',location:'',sourceCalendar:'Hidden campus source',
 sourceKey:'Hidden campus source|uid-77',sourceTimeZone:'Europe/Berlin',
 start:iso('2026-11-17',12),end:iso('2026-11-17',18),
 updatedAt:iso('2026-10-19',12)
}
const allDay:CalendarRecord={
 ...personal,id:'blocking-holiday',title:'Busy all-day',timeZone:undefined,
 allDay:true,startDate:'2026-11-16',endDateExclusive:'2026-11-17',
 start:iso('2026-11-16',0),end:iso('2026-11-17',0)
}
const freeImported:CalendarRecord={
 ...imported,id:'transparent-import',sourceKey:'Hidden campus source|free-uid',
 title:'Provider transparent',transparent:true,
 start:iso('2026-11-15',12),end:iso('2026-11-15',18)
}
const records=[personal,imported,allDay,freeImported]
const state:CalendarState={schemaVersion:1,records}
const now=new Date('2026-11-10T08:00:00.000Z')
const options:PreparationOptions={lookback:7,sessions:3,duration:60,
 hours:'afternoon',days:'all',buffer:15,blockAllDay:true}
function anchor(record:CalendarRecord,date:string):PreparationAnchor{
 const item=occurrencesBetween([record],date,date).find(r=>r.recordId===record.id)!
 if(!item)throw Error('Missing test original')
 return {item,...(record.sourceKey?{originalSourceKey:record.sourceKey}:{}),
   ...(record.sourceTimeZone||record.timeZone?
     {originalTimeZone:record.sourceTimeZone??record.timeZone}:{})}
}
describe('C42 event-linked original-source preparation planning',()=>{
 it('finds distinct available dates before a real original event, retaining the anchor and source authority',()=>{
  const a=anchor(personal,'2026-11-18')
  const initial=JSON.stringify(state)
  const plan=planPreparationBlocks(state,a,options,now)
  expect(plan.anchorDate).toBe('2026-11-18')
  expect(plan.days.length).toBe(7)
  expect(plan.requested).toBe(3)
  expect(plan.shortfall).toBe(0)
  expect(plan.days.some(d=>d.date==='2026-11-17'&&d.choices.length>0)).toBe(false)
  expect(plan.days.some(d=>d.date==='2026-11-16'&&d.choices.length>0)).toBe(false)
  expect(plan.days.some(d=>d.date==='2026-11-15'&&d.choices.length>0)).toBe(true)
  expect(plan.days.filter(d=>d.recommended).length).toBe(3)
  expect(plan.days.every(d=>d.choices.every(slot=>Date.parse(slot.end)<=Date.parse(personal.start)))).toBe(true)
  expect(JSON.stringify(state)).toBe(initial)
 })
 it('uses original Find Time calculations with independent alternatives, never precommits all suggestions',()=>{
  const plan=planPreparationBlocks(state,anchor(personal,'2026-11-18'),options,now)
  const choice=plan.days.find(d=>d.choices.length>1)!
  expect(choice.choices).toHaveLength(3)
  expect(new Set(choice.choices.map(s=>s.start)).size).toBe(3)
  const checked=confirmPreparationSlot(state,anchor(personal,'2026-11-18'),options,
    choice.choices[0],now)
  expect(checked).toEqual(choice.choices[0])
  expect(state.records.length).toBe(4)
 })
 it('counts transparent imported events as visible but nonblocking while opaque imported blocks even if hidden',()=>{
  const plan=planPreparationBlocks(state,anchor(personal,'2026-11-18'),options,now)
  const nov15=plan.days.find(d=>d.date==='2026-11-15')!
  expect(nov15.choices.length).toBeGreaterThan(0)
  const nov17=plan.days.find(d=>d.date==='2026-11-17')!
  expect(nov17.choices).toEqual([])
  // The planner accepts no displayed-source subset or hidden-source option.
  expect(plan.days.some(d=>d.date==='2026-11-17'&&d.recommended)).toBe(false)
 })
 it('handles all-day deadlines only on preceding calendar days, never the original start date',()=>{
  const a=anchor(allDay,'2026-11-16')
  const plan=planPreparationBlocks(state,a,options,now)
  expect(plan.until).toBe('2026-11-15')
  expect(plan.days.some(d=>d.date==='2026-11-16')).toBe(false)
  expect(plan.days.every(d=>d.choices.every(s=>s.date<allDay.startDate!))).toBe(true)
 })
 it('keeps read-only ICS target ownership; selected preparation remains separate and personal-only via the original editor',()=>{
  const a=anchor(imported,'2026-11-17')
  const plan=planPreparationBlocks(state,a,options,now)
  expect(plan.title).toBe(imported.title)
  expect(resolvePreparationAnchor(state,a).recordId).toBe(imported.id)
  expect(state.records.find(r=>r.id===imported.id)?.source).toBe('ics')
  expect(plan.days.every(d=>d.choices.every(s=>Date.parse(s.end)<=Date.parse(imported.start)))).toBe(true)
 })
 it('rejects a provider UID replacement, source timezone change, removed original and renamed original',()=>{
  const a=anchor(imported,'2026-11-17')
  const make=(next:CalendarRecord[]):CalendarState=>({schemaVersion:1,records:next})
  expect(()=>planPreparationBlocks(make(records.map(r=>r.id===imported.id?
    {...r,sourceKey:'Hidden campus source|other-uid'}:r)),a,options,now)).toThrow('identity')
  expect(()=>planPreparationBlocks(make(records.map(r=>r.id===imported.id?
    {...r,sourceTimeZone:'Asia/Seoul'}:r)),a,options,now)).toThrow('identity')
  expect(()=>planPreparationBlocks(make(records.filter(r=>r.id!==imported.id)),a,options,now)).toThrow('identity')
  expect(()=>planPreparationBlocks(make(records.map(r=>r.id===imported.id?
    {...r,title:'Changed at provider'}:r)),a,options,now)).toThrow('changed')
 })
 it('rechecks every candidate when its original time becomes occupied or expires',()=>{
  const a=anchor(personal,'2026-11-18')
  const old=planPreparationBlocks(state,a,options,now)
  const slot=old.days.find(d=>d.choices.length>0)!.choices[0]
  const blocker:CalendarRecord={...personal,id:'new-personal-block',title:'Later event',
    timeZone:undefined,start:slot.start,end:slot.end}
  const changed:CalendarState={schemaVersion:1,records:[...records,blocker]}
  expect(()=>confirmPreparationSlot(changed,a,options,slot,now)).toThrow('no longer available')
  expect(()=>confirmPreparationSlot(state,a,options,slot,
    new Date(Date.parse(slot.start)+120000))).toThrow('no longer available')
 })
 it('includes actual recurring/detached instance identity; does not silently substitute another series date',()=>{
  const recurring:CalendarRecord={...personal,id:'recurring-target',
    start:iso('2026-11-11',18),end:iso('2026-11-11',19),
    repeat:{frequency:'daily',interval:1,until:'2026-11-21'}}
  const rState:CalendarState={schemaVersion:1,records:[recurring]}
  const a=anchor(recurring,'2026-11-18')
  const plan=planPreparationBlocks(rState,a,options,now)
  expect(plan.anchorDate).toBe('2026-11-18')
  expect(resolvePreparationAnchor(rState,a).key).toBe('recurring-target@2026-11-18')
  expect(plan.days.some(x=>x.date==='2026-11-17')).toBe(true)
  const removed:CalendarState={schemaVersion:1,records:[{...recurring,
    excludedDates:['2026-11-18']}]}
  expect(()=>planPreparationBlocks(removed,a,options,now)).toThrow('changed')
 })
 it('reports genuine shortfall without manufacturing slots and validates time windows',()=>{
  const allBlocked:CalendarState={schemaVersion:1,records:[
    personal,...Array.from({length:7},(_,i)=>{
      const date='2026-11-'+String(12+i).padStart(2,'0')
      return {...imported,id:'block-day-'+i,sourceKey:'Hidden campus source|block-'+i,
        start:iso(date,7),end:iso(date,23)}
    })
  ]}
  const plan=planPreparationBlocks(allBlocked,anchor(personal,'2026-11-18'),options,now)
  expect(plan.possible).toBe(0)
  expect(plan.shortfall).toBe(3)
  expect(plan.days.every(d=>d.choices.length===0)).toBe(true)
  expect(()=>planPreparationBlocks(state,anchor(personal,'2026-11-18'),
    {...options,lookback:90 as 7},now)).toThrow('Invalid preparation')
  expect(()=>planPreparationBlocks(state,anchor(personal,'2026-11-18'),
    {...options,sessions:0 as 2},now)).toThrow('Invalid preparation')
 })
})
