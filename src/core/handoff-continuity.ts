import type {CalendarOccurrence,CalendarState} from '../types'
import type {HubHandoffOptions,HubHandoffReview} from './ics'
import type {IcsSubscription} from './ics-subscriptions'
import {occurrencesBetween} from './occurrences'
import {addDays,day,localDate} from './dates'
import {zoneDate} from './time-zone'
import {validateState} from './storage'

/** Ephemeral post-download intent, NOT a second saved calendar, sync receipt,
 * link, or proof that another app imported anything. */
export interface HandoffOrigin{
  key:string;recordId:string;date:string;start:string;end:string;title:string
  source:'personal'|'ics';sourceKey?:string;sourceCalendar?:string
}
export interface HandoffReceipt{
  exportedAt:string;filename:string;privacy:HubHandoffOptions['privacy']
  from:string;through:string;count:number;owners:HandoffOrigin[]
  estimatedHubVisible:number;viewerZone:string;reviewedImported:boolean
}
export type OriginResolution={
  status:'exact'|'changed'|'removed'
  current?:CalendarOccurrence
}
/** Prove the exact original occurrence still exists before navigating within Calendar. */
export function resolveHandoffOrigin(state:CalendarState,origin:HandoffOrigin):OriginResolution{
  const validated=validateState(state)
  const record=validated.records.find(x=>x.id===origin.recordId&&x.source===origin.source)
  if(!record)return {status:'removed'}
  if((record.sourceKey??'')!==(origin.sourceKey??'')||
    (record.sourceCalendar??'')!==(origin.sourceCalendar??''))
    return {status:'changed'}
  day(origin.date)
  const original=occurrencesBetween([record],addDays(origin.date,-2),addDays(origin.date,2))
    .find(x=>x.key===origin.key&&x.date===origin.date)
  if(!original){
    // A one-time original may have moved to another calendar date while
    // keeping its canonical owner ID. Only reopen that exact owner; never
    // pick a different recurring series instance by proximity.
    if(!record.repeat){
      const currentDate=record.allDay?record.startDate!:
        record.timeZone?zoneDate(record.start,record.timeZone):localDate(new Date(record.start))
      const moved=occurrencesBetween([record],currentDate,currentDate)
        .find(x=>x.recordId===record.id)
      if(moved)return {status:'changed',current:moved}
    }
    return {status:'changed'}
  }
  return {status:original.start===origin.start&&original.end===origin.end&&
    original.title===origin.title?'exact':'changed',current:original}
}
function localDisplayDate(iso:string,zone:string):string{
  return zoneDate(iso,zone)
}
export function hubCurrentWindowEstimate(review:HubHandoffReview,zone:string,now:Date):number{
  const from=localDisplayDate(now.toISOString(),zone),through=addDays(from,7)
  return review.items.filter(item=>{
    const first=item.allDay?item.startDate:localDisplayDate(item.start,zone)
    const last=item.allDay?addDays(item.endDateExclusive,-1):
      localDisplayDate(item.end,zone)
    return first<=through&&last>=from
  }).length
}
/** Existing Hub H10 reader truncates to 120 parsed events and displays at
 * most 60 current-window rows. Reject inputs that would silently lose IDs. */
export function verifyHubFileCompatibility(review:HubHandoffReview,options:HubHandoffOptions):void{
  if(review.count>120)throw new Error('Hub supports at most 120 parsed events per file. Narrow this snapshot.')
  if(options.privacy!=='busy'){
    const seen=new Set<string>()
    for(const item of review.items){
      const uid=item.key+'@calendar.thiepn.local'
      // Hub truncates UID to 240 Unicode code points; do not claim identity
      // continuity when two original UIDs might collapse.
      if(Array.from(uid).length>240)throw new Error('Source identity exceeds Hub 240-character UID support. Select busy-only or a different record.')
      if(seen.has(uid))throw new Error('Duplicate canonical occurrence UID in reviewed handoff')
      seen.add(uid)
    }
  }
}
/** Immutable session snapshot of the chosen export; no URL or imported body. */
export function makeHandoffReceipt(
  state:CalendarState,review:HubHandoffReview,options:HubHandoffOptions,
  filename:string,exportedAt:string,viewerZone:string
):HandoffReceipt{
  verifyHubFileCompatibility(review,options)
  const records=new Map(validateState(state).records.map(r=>[r.id,r]))
  if(!Number.isFinite(Date.parse(exportedAt))||!/^thiepn-calendar-readonly-.*\.ics$/.test(filename))
    throw new Error('Invalid temporary handoff receipt')
  const owners=review.items.map(item=>{
    const r=records.get(item.recordId)
    if(!r)throw new Error('Source record no longer exists')
    return {key:item.key,recordId:r.id,date:item.date,start:item.start,end:item.end,
      title:item.title,source:r.source,...(r.sourceKey?{sourceKey:r.sourceKey}:{}),
      ...(r.sourceCalendar?{sourceCalendar:r.sourceCalendar}:{})}
  })
  return {exportedAt,filename,privacy:options.privacy,from:options.from,through:options.through,
    count:review.count,owners,estimatedHubVisible:hubCurrentWindowEstimate(review,viewerZone,new Date(exportedAt)),
    viewerZone,reviewedImported:options.includeImported}
}
export interface SourceFreshness{
  kind:'personal'|'manual'|'subscribed'
  lastAppliedAt?:string;lastCheckedAt?:string
  warning?:string
}
/** Subscription metadata is only a local observation. Neither file import
 * timestamp nor checked/304 HTTP state proves upstream feed freshness. */
export function handoffSourceFreshness(
  source:'personal'|'ics',sourceName:string|undefined,
  subscriptions:readonly IcsSubscription[],now:Date=new Date()
):SourceFreshness{
  if(source==='personal')return {kind:'personal'}
  const entry=subscriptions.find(x=>x.sourceName===sourceName&&x.lastAppliedAt)
  if(!entry)return {kind:'manual',warning:'Imported file: original provider freshness is unknown'}
  const old=Date.parse(entry.lastAppliedAt!)
  const stale=Number.isNaN(old)||now.getTime()-old>7*86400000
  return {kind:'subscribed',lastAppliedAt:entry.lastAppliedAt,lastCheckedAt:entry.lastCheckedAt,
    ...(entry.status==='error'?{warning:'Latest manual feed check failed; previously applied events remain'}:
      stale?{warning:'Applied subscription snapshot is over seven days old; provider freshness is unknown'}:{})}
}
