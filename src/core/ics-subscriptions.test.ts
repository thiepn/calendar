import {describe,it,expect} from 'vitest'
import {ICS_SUBSCRIPTIONS_KEY,addSubscription,changeSubscription,readSubscriptions,
  reviseSubscriptions,dropSubscription,assertFeedSource,fetchSubscribedIcs,
  safeFeedUrl,validateSubscriptions,historyEntry,type IcsSubscription} from './ics-subscriptions'
import {previewIcs,mergeIcs} from './ics'
import type {CalendarState} from '../types'

const fixture=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:Campus remote',
  'BEGIN:VEVENT','UID:remote-original-1','SUMMARY:Seminar',
  'DTSTART:20261126T090000Z','DTEND:20261126T100000Z',
  'END:VEVENT','END:VCALENDAR'].join('\r\n')
const empty:CalendarState={schemaVersion:1,records:[]}
const url='https://calendar.example.org/course.ics'
function withStorage<T>(fn:(map:Map<string,string>)=>T):T{
  const map=new Map<string,string>()
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value)},
    removeItem:(key:string)=>{map.delete(key)},clear:()=>map.clear()
  }})
  try{return fn(map)}finally{
    if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor)
    else Reflect.deleteProperty(globalThis,'localStorage')
  }
}
function fetchMock(handler:(input:string|URL|Request,init?:RequestInit)=>Promise<Response>):typeof fetch{
  return handler as typeof fetch
}
describe('C37 consented original-source ICS subscriptions',()=>{
  it('rejects local/insecure/credentialed endpoints and canonicalizes only public HTTPS feeds',()=>{
    expect(safeFeedUrl(url)).toBe(url)
    for(const item of ['http://calendar.example.org/feed.ics','https://localhost/feed.ics',
      'https://127.0.0.1/x','https://10.0.0.1/feed','https://172.16.2.3/calendar',
      'https://192.168.1.10/events','https://[::1]/ics','https://a.local/ics',
      'https://user:pass@calendar.example.org/feed','https://calendar.example.org/feed#secret']){
      expect(()=>safeFeedUrl(item)).toThrow()
    }
    expect(safeFeedUrl(' HTTPS://calendar.example.org:443/a.ics ')).toBe(url.replace('/course.ics','/a.ics'))
  })
  it('stores only bounded subscription metadata, never remote event content or event writes',()=>{
    withStorage(map=>{
      const initial=readSubscriptions()
      expect(initial).toEqual({schemaVersion:1,items:[]})
      const added=addSubscription(initial,url)
      reviseSubscriptions(initial,added)
      expect(readSubscriptions()).toEqual(added)
      expect(map.has('thiepn.calendar.local.v1')).toBe(false)
      expect(map.get(ICS_SUBSCRIPTIONS_KEY)).not.toContain('Seminar')
      const id=added.items[0].id
      const applied=changeSubscription(added,id,{sourceName:'Campus remote',status:'applied',
        lastCheckedAt:'2026-10-19T12:00:00Z',lastAppliedAt:'2026-10-19T12:00:00Z',
        etag:'"abc"',history:historyEntry(added.items[0],'applied',1)})
      reviseSubscriptions(added,applied)
      expect(readSubscriptions().items[0].sourceName).toBe('Campus remote')
      expect(()=>reviseSubscriptions(added,initial)).toThrow('another tab')
      expect(()=>changeSubscription(applied,id,{url:'https://calendar.example.org/other.ics'})).toThrow('immutable')
      expect(dropSubscription(applied,id).items).toHaveLength(0)
      reviseSubscriptions(applied,dropSubscription(applied,id))
      expect(map.has('thiepn.calendar.local.v1')).toBe(false)
    })
  })
  it('blocks source-name hijacks, duplicate subscriptions and unreadable sidecars',()=>{
    withStorage(map=>{
      const one=addSubscription(readSubscriptions(),url)
      expect(()=>addSubscription(one,url)).toThrow('already')
      expect(()=>assertFeedSource(one,one.items[0].id,'Existing imported',['Existing imported'])).toThrow('already imported')
      const named=changeSubscription(one,one.items[0].id,{sourceName:'Campus remote'})
      expect(assertFeedSource(named,named.items[0].id,'Campus remote',['Campus remote'])).toBeDefined()
      expect(()=>assertFeedSource(named,named.items[0].id,'Another renamed feed',['Campus remote'])).toThrow('name changed')
      map.set(ICS_SUBSCRIPTIONS_KEY,'{"schemaVersion":1,"items":')
      expect(()=>readSubscriptions()).toThrow()
      expect(map.get(ICS_SUBSCRIPTIONS_KEY)).toContain('"items":')
      expect(()=>validateSubscriptions({schemaVersion:1,items:[{...named.items[0],history:Array(9).fill({kind:'error',at:'2026-10-19T12:00:00Z'})}]})).toThrow('history')
    })
  })
  it('uses CORS-only credential-free GET; stages a complete snapshot without writing a calendar',async()=>{
    const subscription=addSubscription({schemaVersion:1,items:[]},url).items[0]
    let visited=0
    const remote=fetchMock(async (input,init)=>{
      visited++
      expect(input).toBe(url)
      expect(init?.credentials).toBe('omit')
      expect(init?.redirect).toBe('error')
      expect(init?.referrerPolicy).toBe('no-referrer')
      expect(init?.mode).toBe('cors')
      expect(init?.method).toBe('GET')
      expect((init?.headers as Record<string,string>)['If-None-Match']).toBeUndefined()
      return new Response(fixture,{status:200,headers:{ETag:'"campus-v1"','Last-Modified':'Mon, 19 Oct 2026 09:00:00 GMT'}})
    })
    const result=await fetchSubscribedIcs(subscription,new AbortController().signal,remote)
    expect(visited).toBe(1)
    expect(result.kind).toBe('snapshot')
    if(result.kind!=='snapshot')throw new Error('Expected complete fixture')
    expect(result.etag).toBe('"campus-v1"')
    expect(result.lastModified).toBe('Mon, 19 Oct 2026 09:00:00 GMT')
    const preview=previewIcs(result.text)
    expect(preview.records).toHaveLength(1)
    expect(preview.records[0].source).toBe('ics')
    expect(empty.records).toHaveLength(0)
  })
  it('honors exposed ETag 304 without incorrectly accepting unverified not-modified data',async()=>{
    const subscription=addSubscription({schemaVersion:1,items:[]},url).items[0]
    const applied:IcsSubscription={...subscription,sourceName:'Campus remote',
      etag:'"campus-v1"',lastAppliedAt:'2026-10-19T11:00:00Z'}
    const remote=fetchMock(async (_input,init)=>{
      expect((init?.headers as Record<string,string>)['If-None-Match']).toBe('"campus-v1"')
      return new Response(null,{status:304})
    })
    expect(await fetchSubscribedIcs(applied,new AbortController().signal,remote)).toEqual({kind:'not-modified'})
    await expect(fetchSubscribedIcs(subscription,new AbortController().signal,
      fetchMock(async()=>new Response(null,{status:304})))).rejects.toThrow('Unverified 304')
  })
  it('fails closed on cancellation, cross-origin failures, oversized bodies and redirects',async()=>{
    const sub=addSubscription({schemaVersion:1,items:[]},url).items[0]
    const controller=new AbortController();controller.abort()
    await expect(fetchSubscribedIcs(sub,controller.signal,
      fetchMock(async()=>{throw new DOMException('Aborted','AbortError')}))).rejects.toThrow('cancelled')
    await expect(fetchSubscribedIcs(sub,new AbortController().signal,
      fetchMock(async()=>{throw new TypeError('Failed to fetch '+url)}))).rejects.toThrow('CORS')
    await expect(fetchSubscribedIcs(sub,new AbortController().signal,
      fetchMock(async()=>new Response('',{status:302})))).rejects.toThrow('302')
    await expect(fetchSubscribedIcs(sub,new AbortController().signal,
      fetchMock(async()=>new Response('x'.repeat(2000001),{status:200})))).rejects.toThrow('2 MB')
  })
  it('retains original ICS UID authority when one remote refresh is incomplete',()=>{
    const first=previewIcs(fixture)
    const initial=mergeIcs(empty,first,'update').state
    const broken=previewIcs(fixture.replace('DTSTART:20261126T090000Z','DTSTART;TZID=Fake/Vendor:20261126T090000'))
    expect(broken.skippedEvents).toBe(1)
    expect(()=>mergeIcs(initial,broken,'replace')).toThrow('incomplete')
    expect(mergeIcs(initial,broken,'update').state).toEqual(initial)
    const refreshed=previewIcs(fixture.replace('SUMMARY:Seminar','SUMMARY:Seminar revised'))
    const update=mergeIcs(initial,refreshed,'update')
    expect(update.updated).toBe(1)
    expect(update.state.records[0].id).toBe(initial.records[0].id)
    expect(initial.records[0].title).toBe('Seminar')
  })
})
