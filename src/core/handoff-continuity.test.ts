import {describe,it,expect} from 'vitest'
import type {CalendarRecord,CalendarState} from '../types'
import {exportHubHandoffIcs,reviewHubHandoff} from './ics'
import {handoffSourceFreshness,makeHandoffReceipt,resolveHandoffOrigin,
  hubCurrentWindowEstimate,verifyHubFileCompatibility} from './handoff-continuity'
import type {IcsSubscription} from './ics-subscriptions'
const personal:CalendarRecord={id:'c39-original',title:'Private planning',description:'Confidential',
  location:'Office',start:'2026-10-19T11:00:00.000Z',end:'2026-10-19T12:00:00.000Z',
  source:'personal',allDay:false,timeZone:'Europe/Berlin',updatedAt:'2026-10-19T11:00:00.000Z'}
const imported:CalendarRecord={...personal,id:'c39-import-uid',source:'ics',
  title:'Original professor lecture',sourceCalendar:'University source',
  sourceKey:'University source|original-academic-uid',sourceTimeZone:'Europe/Berlin',timeZone:undefined}
const state:CalendarState={schemaVersion:1,records:[personal,imported]}
const opts={from:'2026-10-19',through:'2026-10-20',privacy:'titles' as const,includeImported:true}
const filename='thiepn-calendar-readonly-2026-10-19-to-2026-10-20.ics'
function receipt(privacy:'titles'|'busy'|'details'='titles'){
  const options={...opts,privacy}
  const review=reviewHubHandoff(state,options)
  return makeHandoffReceipt(state,review,options,filename,'2026-10-19T12:00:00Z','Europe/Berlin')
}
describe('C39 source-authentic read-only handoff continuity',()=>{
  it('creates only a session receipt from original IDs and selected scope',()=>{
    const result=receipt()
    expect(result.count).toBe(2)
    expect(result.filename).toBe(filename)
    expect(result.reviewedImported).toBe(true)
    expect(result.owners).toEqual(expect.arrayContaining([
      expect.objectContaining({recordId:'c39-original',source:'personal'}),
      expect.objectContaining({recordId:'c39-import-uid',source:'ics',sourceKey:imported.sourceKey})
    ]))
    expect(result.estimatedHubVisible).toBe(2)
    expect(result).not.toHaveProperty('calendar')
    expect(JSON.stringify(result)).not.toContain('Confidential')
  })
  it('resolves only the exact unchanged original occurrence and canonical UTC instant',()=>{
    const ref=receipt().owners.find(x=>x.source==='personal')!
    expect(resolveHandoffOrigin(state,ref)).toMatchObject({
      status:'exact',current:{recordId:'c39-original',start:personal.start}
    })
    const moved:CalendarState={schemaVersion:1,records:[
      {...personal,start:'2026-10-19T13:00:00.000Z',end:'2026-10-19T14:00:00.000Z'},
      imported]}
    expect(resolveHandoffOrigin(moved,ref)).toMatchObject({status:'changed'})
    expect(resolveHandoffOrigin({schemaVersion:1,records:[imported]},ref)).toEqual({status:'removed'})
  })
  it('rejects forged source authority with reused local IDs instead of silently relocating',()=>{
    const ref=receipt().owners.find(x=>x.source==='ics')!
    expect(resolveHandoffOrigin(state,ref).status).toBe('exact')
    const fraud:CalendarState={schemaVersion:1,records:[personal,
      {...imported,sourceKey:'Other provider|new UID'}]}
    expect(resolveHandoffOrigin(fraud,ref)).toEqual({status:'changed'})
  })
  it('flags Hub current seven-day visibility as a timezone-specific estimate',()=>{
    const r=reviewHubHandoff(state,opts)
    expect(hubCurrentWindowEstimate(r,'Europe/Berlin',new Date('2026-10-19T12:00:00Z'))).toBe(2)
    expect(hubCurrentWindowEstimate(r,'Europe/Berlin',new Date('2026-11-01T12:00:00Z'))).toBe(0)
    expect(hubCurrentWindowEstimate(r,'Asia/Tokyo',new Date('2026-10-19T12:00:00Z'))).toBe(2)
  })
  it('blocks export beyond actual Hub parsed-events limit rather than silently dropping source events',()=>{
    const records:Array<CalendarRecord>=Array.from({length:121},(_,i)=>({
      ...personal,id:'c39-bounded-'+i,title:'Original '+i
    }))
    const many:CalendarState={schemaVersion:1,records}
    const review=reviewHubHandoff(many,opts)
    expect(review.count).toBe(121)
    expect(()=>verifyHubFileCompatibility(review,opts)).toThrow('at most 120')
    expect(()=>exportHubHandoffIcs(many,opts)).toThrow('at most 120')
    expect(many.records).toHaveLength(121)
  })
  it('guards against UID truncation even for unexpectedly long projection keys',()=>{
    const normal=reviewHubHandoff(state,opts)
    const oversized={...normal,items:[{...normal.items[0],key:'x'.repeat(260)}]}
    expect(()=>verifyHubFileCompatibility(oversized,opts)).toThrow('240-character')
    expect(()=>verifyHubFileCompatibility(oversized,{...opts,privacy:'busy'})).not.toThrow()
    // Canonical Calendar IDs are bounded to 160 chars, so real records do
    // not need an invented hashed UID or a second identity authority.
    const valid:CalendarRecord={...personal,id:'x'.repeat(160)}
    expect(()=>exportHubHandoffIcs({schemaVersion:1,records:[valid]},opts)).not.toThrow()
  })
  it('retains busy-only content exclusion while preserving private local return to source',()=>{
    const busy=receipt('busy')
    expect(busy.privacy).toBe('busy')
    const body=exportHubHandoffIcs(state,{...opts,privacy:'busy'})
    expect(body).not.toContain('Private planning')
    expect(body).not.toContain('c39-original')
    expect(body).not.toContain('University source')
    expect(body).toContain('SUMMARY:Busy')
    expect(resolveHandoffOrigin(state,busy.owners[0]).status).toBe('exact')
  })
  it('does not confuse locally applied feed timestamps or failed checks with upstream freshness',()=>{
    const source:IcsSubscription={id:'feed-1',url:'https://calendar.example.org/feed.ics',
      revision:'original-revision',createdAt:'2026-10-01T09:00:00Z',
      status:'error',sourceName:'University source',
      lastAppliedAt:'2026-10-01T10:00:00Z',lastCheckedAt:'2026-10-19T12:00:00Z'}
    const status=handoffSourceFreshness('ics','University source',[source],new Date('2026-10-19T13:00:00Z'))
    expect(status.kind).toBe('subscribed')
    expect(status.warning).toMatch(/check failed/)
    expect(status.lastAppliedAt).toBe('2026-10-01T10:00:00Z')
    expect(handoffSourceFreshness('ics','Unknown manual source',[source]).kind).toBe('manual')
    expect(handoffSourceFreshness('personal',undefined,[source]).kind).toBe('personal')
    const old=handoffSourceFreshness('ics','University source',[{...source,status:'applied'}],
      new Date('2026-10-19T13:00:00Z'))
    expect(old.warning).toMatch(/over seven days/)
  })
  it('never claims a Hub import, account grant or owner write from a successful file export',()=>{
    const before=JSON.stringify(state)
    const reviewed=reviewHubHandoff(state,opts)
    makeHandoffReceipt(state,reviewed,opts,filename,new Date().toISOString(),'Europe/Berlin')
    const out=exportHubHandoffIcs(state,opts)
    expect(out).toContain('X-THIEPN-ORIGINAL-RECORD:c39-original')
    expect(JSON.stringify(state)).toEqual(before)
  })
})
