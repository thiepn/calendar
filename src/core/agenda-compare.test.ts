import {describe,it,expect} from 'vitest'
import type {CalendarRecord,CalendarState} from '../types'
import {compareAgendaDays,resolveComparedOccurrence} from './agenda-compare'
import {visibleCalendarRecords} from './source-visibility'

const timed=(date:string,hour:string)=>date+'T'+hour+':00:00.000Z'
const daily:CalendarRecord={
 id:'c41-author-series',title:'Author recurring lesson',description:'Original text',location:'',
 source:'personal',allDay:false,timeZone:'Europe/Berlin',
 start:timed('2026-11-10','09'),end:timed('2026-11-10','10'),
 repeat:{frequency:'daily',interval:1,until:'2026-11-20'},
 excludedDates:['2026-11-11'],updatedAt:timed('2026-10-19','09')
}
const detached:CalendarRecord={
 ...daily,id:'c41-detached',title:'Edited recurring lesson',
 start:timed('2026-11-11','12'),end:timed('2026-11-11','13'),
 repeat:undefined,excludedDates:undefined,
 recurrenceParentId:daily.id,recurrenceDate:'2026-11-11'
}
const allDay:CalendarRecord={
 ...daily,id:'c41-all-day',title:'Original multiday',start:timed('2026-11-11','00'),
 end:timed('2026-11-19','00'),timeZone:undefined,repeat:undefined,excludedDates:undefined,
 allDay:true,startDate:'2026-11-11',endDateExclusive:'2026-11-19'
}
const overlapping:CalendarRecord={
 ...daily,id:'c41-overlap',title:'Personal overlap',
 start:'2026-11-11T12:30:00.000Z',end:'2026-11-11T13:30:00.000Z',
 timeZone:undefined,repeat:undefined,excludedDates:undefined
}
const imported:CalendarRecord={
 ...daily,id:'c41-import-1',title:'Shared-looking lecture',source:'ics',repeat:undefined,
 excludedDates:undefined,timeZone:undefined,sourceTimeZone:'Europe/Berlin',
 sourceCalendar:'University class',sourceKey:'University class|original-uid-one',
 start:timed('2026-11-11','15'),end:timed('2026-11-11','16'),transparent:true
}
const importedOther:CalendarRecord={
 ...imported,id:'c41-import-2',sourceKey:'University class|original-uid-two',
 start:timed('2026-11-18','15'),end:timed('2026-11-18','16')
}
const state:CalendarState={schemaVersion:1,
 records:[daily,detached,allDay,overlapping,imported,importedOther]}
describe('C41 original source-aware two-day agenda comparison',()=>{
 it('connects only the same original recurring series and multi-day ID across dates',()=>{
  const r=compareAgendaDays(state.records,'2026-11-11','2026-11-18')
  expect(r.sharedOwnerCount).toBe(2)
  expect(r.first.matchingOwners).toBe(2)
  expect(r.second.matchingOwners).toBe(2)
  const edited=r.first.events.items.find(x=>x.occurrence.recordId===detached.id)!
  expect(r.first.sharedKeys.has(edited.occurrence.key)).toBe(true)
  expect(r.second.sharedKeys.has(r.second.events.items.find(x=>x.occurrence.recordId===daily.id)!.occurrence.key)).toBe(true)
  const university=r.first.events.items.find(x=>x.occurrence.recordId===imported.id)!
  expect(r.first.sharedKeys.has(university.occurrence.key)).toBe(false)
 })
 it('reuses original busy-time unions and overlap detection, excluding transparent ICS',()=>{
  const r=compareAgendaDays(state.records,'2026-11-11','2026-11-18')
  expect(r.first.importedCount).toBe(1)
  expect(r.first.allDayCount).toBe(1)
  expect(r.first.events.total).toBe(4)
  expect(r.first.busyMinutes).toBe(90)
  expect(r.first.overlaps).toBe(2)
  expect(r.first.conflicts.has(detached.id+'@2026-11-11')).toBe(true)
  expect(r.first.conflicts.has(imported.id+'@2026-11-11')).toBe(false)
  expect(r.first.sourceCounts).toEqual([{name:'Personal',count:3},{name:'University class',count:1}])
 })
 it('pages each date independently without losing original identities',()=>{
  const dense:Array<CalendarRecord>=Array.from({length:37},(_,i)=>({
    ...overlapping,id:'c41-dense-'+i,title:'Lecture '+i,
    start:timed('2026-11-11','08'),end:timed('2026-11-11','09')
  }))
  const records=[...dense,daily,detached,allDay]
  const a=compareAgendaDays(records,'2026-11-11','2026-11-18',0,0)
  expect(a.first.events.total).toBe(39)
  expect(a.first.events.items).toHaveLength(12)
  expect(a.first.events.pages).toBe(4)
  const b=compareAgendaDays(records,'2026-11-11','2026-11-18',3,0)
  expect(b.first.events.items).toHaveLength(3)
  expect(b.second.events.page).toBe(0)
  expect(b.first.events.items.every(x=>records.some(record=>record.id===x.occurrence.recordId))).toBe(true)
 })
 it('compares only actually displayed sources; hidden ICS remains persisted and unchanged',()=>{
  const before=JSON.stringify(state)
  const displayed=visibleCalendarRecords(state.records,'all',new Set(['University class']))
  const r=compareAgendaDays(displayed,'2026-11-11','2026-11-18')
  expect(r.first.importedCount).toBe(0)
  expect(r.first.events.items.some(x=>x.occurrence.source==='ics')).toBe(false)
  expect(r.sharedOwnerCount).toBe(2)
  expect(JSON.stringify(state)).toBe(before)
 })
 it('preserves original source identity during selection, refusing reassigned provider UID',()=>{
  const a=compareAgendaDays(state.records,'2026-11-11','2026-11-18')
  const candidate=a.first.events.items.find(x=>x.occurrence.recordId===imported.id)!.occurrence
  expect(resolveComparedOccurrence(state.records,'2026-11-11',candidate,imported)).toMatchObject({
    recordId:imported.id,start:imported.start,sourceCalendar:imported.sourceCalendar
  })
  const reassigned={...imported,sourceKey:'University class|other-uid'}
  const current=state.records.map(x=>x.id===imported.id?reassigned:x)
  expect(()=>resolveComparedOccurrence(current,'2026-11-11',candidate,imported)).toThrow('source')
  expect(()=>resolveComparedOccurrence(current.filter(x=>x.id!==imported.id),
    '2026-11-11',candidate,imported)).toThrow('source')
 })
 it('refuses changed UTC instant or event title and a skipped recurring date',()=>{
  const r=compareAgendaDays(state.records,'2026-11-11','2026-11-18')
  const item=r.first.events.items.find(x=>x.occurrence.recordId===detached.id)!.occurrence
  expect(resolveComparedOccurrence(state.records,'2026-11-11',item,detached).start).toBe(item.start)
  const shifted=state.records.map(x=>x.id===detached.id?
    {...detached,start:timed('2026-11-11','16'),end:timed('2026-11-11','17')}:x)
  expect(()=>resolveComparedOccurrence(shifted,'2026-11-11',item,detached)).toThrow('changed')
  const changed=state.records.map(x=>x.id===detached.id?{...detached,title:'Edited elsewhere'}:x)
  expect(()=>resolveComparedOccurrence(changed,'2026-11-11',item,detached)).toThrow('changed')
  const nonexistent={...item,key:'nonexistent@2026-11-11'}
  expect(()=>resolveComparedOccurrence(state.records,'2026-11-11',nonexistent,detached)).toThrow('changed')
 })
 it('includes multi-day original all-day events on both days with unchanged exclusive end',()=>{
  const r=compareAgendaDays(state.records,'2026-11-11','2026-11-18')
  for(const side of [r.first,r.second]){
    const item=side.events.items.find(x=>x.occurrence.recordId===allDay.id)!.occurrence
    expect(item.allDay).toBe(true)
    expect(item.startDate).toBe('2026-11-11')
    expect(item.endDateExclusive).toBe('2026-11-19')
    expect(side.sharedKeys.has(item.key)).toBe(true)
  }
 })
 it('validates distinct device-local dates, original pagination and leaves canonical state unchanged',()=>{
  const before=JSON.stringify(state)
  expect(()=>compareAgendaDays(state.records,'2026-11-11','2026-11-11')).toThrow('different days')
  expect(()=>compareAgendaDays(state.records,'2026-13-01','2026-11-18')).toThrow('date')
  expect(()=>compareAgendaDays(state.records,'2026-11-11','2026-11-18',-1,0)).toThrow('page')
  expect(JSON.stringify(state)).toBe(before)
 })
})
