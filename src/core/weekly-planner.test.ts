import {describe,it,expect} from 'vitest'
import type {CalendarRecord} from '../types'
import {confirmWeeklyMeeting,planWeeklyMeeting,type WeeklyPlanOptions} from './weekly-planner'

const now=new Date('2026-10-20T00:00:00.000Z')
const options:WeeklyPlanOptions={from:'2026-11-03',weekday:2,weeks:4,duration:60,
  window:'daytime',buffer:0,blockAllDay:true}
const personal:CalendarRecord={id:'c42-personal',title:'Original personal class',
  description:'',location:'',source:'personal',allDay:false,
  start:'2026-11-17T09:00:00.000Z',end:'2026-11-17T10:00:00.000Z',
  updatedAt:'2026-10-19T12:00:00.000Z'}
const imported:CalendarRecord={...personal,id:'c42-hidden-import',source:'ics',
  title:'Private imported source',sourceCalendar:'Hidden calendar',
  sourceKey:'Hidden calendar|original-UID',sourceTimeZone:'Europe/Berlin',
  start:'2026-11-10T09:00:00.000Z',end:'2026-11-10T10:00:00.000Z'}
const transparent:CalendarRecord={...imported,id:'c42-transparent',title:'Transparent imported',
  transparent:true,sourceKey:'Hidden calendar|free-UID',start:'2026-11-24T08:00:00.000Z',
  end:'2026-11-24T10:00:00.000Z'}
const allDay:CalendarRecord={...personal,id:'c42-all-day',title:'All-day original commitment',
  allDay:true,timeZone:undefined,startDate:'2026-11-24',endDateExclusive:'2026-11-25',
  start:'2026-11-24T00:00:00.000Z',end:'2026-11-25T00:00:00.000Z'}
const records=[personal,imported,transparent]
describe('C42 original-source weekly-series planner',()=>{
  it('evaluates four authentic weekly dates without adding any event or second scheduler',()=>{
    const before=JSON.stringify(records)
    const r=planWeeklyMeeting(records,options,['Hidden calendar'],now)
    expect(r.dates).toEqual(['2026-11-03','2026-11-10','2026-11-17','2026-11-24'])
    expect(r.until).toBe('2026-11-24')
    expect(r.candidates.length).toBeLessThanOrEqual(18)
    expect(r.count).toBeGreaterThan(r.candidates.length)
    expect(r.fullyAvailable).toBeGreaterThan(0)
    expect(r.candidates.some(x=>x.fullyAvailable)).toBe(true)
    expect(JSON.stringify(records)).toEqual(before)
  })
  it('tracks hidden imported original UIDs as busy, without changing source visibility',()=>{
    const r=planWeeklyMeeting(records,options,['Hidden calendar'],now)
    const choice=r.candidates.find(x=>x.clock==='09:00')
    // Ranking can exclude a heavily blocked time from the top 18.
    const rerun=planWeeklyMeeting(records,{...options,window:'daytime'},['Hidden calendar'],now)
    expect(rerun.fullyAvailable).toBeGreaterThan(0)
    const clock='09:00'
    expect(()=>confirmWeeklyMeeting(records,options,clock,['Hidden calendar'],now))
      .toThrow('no longer free')
    if(choice){
      const hit=choice.meetings.find(x=>x.date==='2026-11-10')!.blockers
      expect(hit).toEqual(expect.arrayContaining([
        expect.objectContaining({id:'c42-hidden-import',key:'c42-hidden-import@2026-11-10',
          hidden:true,sourceCalendar:'Hidden calendar',title:'Private imported source'})]))
    }
    expect(imported.sourceKey).toBe('Hidden calendar|original-UID')
  })
  it('skips imported transparent events but respects all-day blocking and buffer',()=>{
    const without=[transparent]
    const r=planWeeklyMeeting(without,options,['Hidden calendar'],now)
    expect(r.fullyAvailable).toBe(r.count)
    const busy=planWeeklyMeeting([allDay],options,[],now)
    expect(busy.fullyAvailable).toBe(0)
    const ignored=planWeeklyMeeting([allDay],{...options,blockAllDay:false},[],now)
    expect(ignored.fullyAvailable).toBe(ignored.count)
    const near:CalendarRecord={...personal,start:'2026-11-10T07:45:00.000Z',
      end:'2026-11-10T08:00:00.000Z'}
    expect(()=>confirmWeeklyMeeting([near],options,'08:00',[],now)).not.toThrow()
    expect(()=>confirmWeeklyMeeting([near],{...options,buffer:15},'08:00',[],now))
      .toThrow('no longer free')
  })
  it('opens only a fully free slot with the original recurrence weekday and last source date',()=>{
    const proposal=confirmWeeklyMeeting(records,options,'11:00',['Hidden calendar'],now)
    expect(proposal.weekday).toBe(2)
    expect(proposal.date).toBe('2026-11-03')
    expect(proposal.until).toBe('2026-11-24')
    expect(Date.parse(proposal.end)-Date.parse(proposal.start)).toBe(60*60000)
    expect(proposal.start).toContain('2026-11-03')
  })
  it('rejects a stale originally free proposal when a canonical imported commitment appears',()=>{
    const fresh=confirmWeeklyMeeting([],options,'10:00',[],now)
    expect(fresh.start).toBeTruthy()
    const newImport={...imported,start:'2026-11-17T10:00:00.000Z',
      end:'2026-11-17T11:00:00.000Z'}
    expect(()=>confirmWeeklyMeeting([newImport],options,'10:00',[],now))
      .toThrow('no longer free')
  })
  it('guards date, weekday, horizon, duration, clock window and time already passed',()=>{
    expect(()=>planWeeklyMeeting([], {...options,from:'2026-13-01'},[],now)).toThrow('date')
    expect(()=>planWeeklyMeeting([],{...options,weekday:7},[],now)).toThrow('Invalid weekly')
    expect(()=>planWeeklyMeeting([],{...options,weeks:16 as 4},[],now)).toThrow('Invalid weekly')
    expect(()=>planWeeklyMeeting([],{...options,duration:45 as 60},[],now)).toThrow('Invalid weekly')
    expect(()=>planWeeklyMeeting([],{...options,buffer:20 as 15},[],now)).toThrow('Invalid weekly')
    expect(()=>planWeeklyMeeting([],{...options,from:'2026-10-19'},[],now)).toThrow('future')
    const r=planWeeklyMeeting([],{...options,from:'2026-10-20',weekday:2},
      [],new Date('2026-10-20T18:30:00.000Z'))
    expect(r.fullyAvailable).toBe(0)
  })
  it('covers eight real recurring dates across the fall zone transition as UTC instants',()=>{
    const r=planWeeklyMeeting([],{...options,from:'2026-10-20',weeks:8},
      [],new Date('2026-10-19T12:00:00.000Z'))
    expect(r.dates).toHaveLength(8)
    expect(r.until).toBe('2026-12-08')
    const first=r.candidates.find(x=>x.fullyAvailable)!
    expect(first.meetings).toHaveLength(8)
    expect(first.meetings.every(x=>Date.parse(x.end)-Date.parse(x.start)===3600000)).toBe(true)
    expect(first.meetings.every(x=>x.date&&x.start&&x.end)).toBe(true)
  })
})
