export const ICS_SUBSCRIPTIONS_KEY='thiepn.calendar.ics-subscriptions.v1'
export type FeedStatus='ready'|'review'|'unchanged'|'applied'|'error'
export interface FeedHistoryEntry {at:string;kind:'review'|'unchanged'|'applied'|'error';count?:number}
export interface IcsSubscription {
  id:string;url:string;revision:string;createdAt:string
  sourceName?:string
  lastCheckedAt?:string;lastAppliedAt?:string
  etag?:string;lastModified?:string
  status:FeedStatus;lastError?:string;history?:FeedHistoryEntry[]
}
export interface SubscriptionStore {schemaVersion:1;items:IcsSubscription[]}
const empty=():SubscriptionStore=>({schemaVersion:1,items:[]})
function isPrivateV4(host:string):boolean{
  if(!/^\d+\.\d+\.\d+\.\d+$/.test(host))return false
  const parts=host.split('.').map(Number)
  return parts.some(x=>x<0||x>255)||parts[0]===0||parts[0]===10||
    parts[0]===127||parts[0]>=224||parts[0]===169&&parts[1]===254||
    parts[0]===172&&parts[1]>=16&&parts[1]<=31||
    parts[0]===192&&parts[1]===168||parts[0]===100&&parts[1]>=64&&parts[1]<=127||
    parts[0]===192&&parts[1]===0&&parts[2]===0
}
export function safeFeedUrl(value:string):string{
  if(typeof value!=='string'||!value.trim()||value.length>2048)throw new Error('Enter a feed URL (maximum 2,048 characters)')
  let parsed:URL
  try{parsed=new URL(value.trim())}catch{throw new Error('Enter a complete HTTPS feed URL')}
  const host=parsed.hostname.toLowerCase().replace(/\.$/,'')
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.hash||
    parsed.port&&parsed.port!=='443'||!host||host.includes('%')||
    /^(?:localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home|.*\.lan|.*\.test)$/i.test(host)||
    host.startsWith('[')||isPrivateV4(host))
    throw new Error('Only public HTTPS URLs without credentials, fragments, or local/private hosts are supported')
  if(parsed.href.length>2048)throw new Error('Feed URL is too long')
  return parsed.href
}
export function feedHost(url:string):string{return new URL(safeFeedUrl(url)).hostname}
function date(value:unknown):boolean{return typeof value==='string'&&value.length<=40&&Number.isFinite(Date.parse(value))}
function validHeader(value:unknown,max:number):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=max&&!/[\r\n\u0000-\u001f\u007f]/.test(value)
}
export function validateSubscriptions(raw:unknown):SubscriptionStore{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid subscription metadata')
  const source=raw as SubscriptionStore
  if(source.schemaVersion!==1||!Array.isArray(source.items)||source.items.length>12)
    throw new Error('Incompatible subscription metadata')
  const ids=new Set<string>(),urls=new Set<string>(),sources=new Set<string>()
  for(const item of source.items){
    if(!item||typeof item!=='object'||typeof item.id!=='string'||!item.id||
      item.id.length>100||typeof item.revision!=='string'||!item.revision||item.revision.length>100||
      !date(item.createdAt)||!['ready','review','unchanged','applied','error'].includes(item.status))
      throw new Error('Invalid subscription entry')
    const url=safeFeedUrl(item.url)
    if(url!==item.url||ids.has(item.id)||urls.has(url))throw new Error('Duplicate or noncanonical subscription')
    ids.add(item.id);urls.add(url)
    if(item.sourceName!==undefined){
      if(typeof item.sourceName!=='string'||!item.sourceName.trim()||item.sourceName.length>100||sources.has(item.sourceName))
        throw new Error('Duplicate or invalid subscribed source')
      sources.add(item.sourceName)
    }
    if(item.history!==undefined&&(!Array.isArray(item.history)||item.history.length>8||
      item.history.some(h=>!h||!date(h.at)||!['review','unchanged','applied','error'].includes(h.kind)||
      h.count!==undefined&&(!Number.isInteger(h.count)||h.count<0||h.count>5000))))
      throw new Error('Invalid subscription history')
    if(item.lastCheckedAt!==undefined&&!date(item.lastCheckedAt)||item.lastAppliedAt!==undefined&&!date(item.lastAppliedAt)||
      item.etag!==undefined&&!validHeader(item.etag,200)||item.lastModified!==undefined&&!validHeader(item.lastModified,100)||
      item.lastError!==undefined&&(typeof item.lastError!=='string'||item.lastError.length>300))
      throw new Error('Invalid subscription status')
  }
  return {schemaVersion:1,items:source.items}
}
export function readSubscriptions():SubscriptionStore{
  const raw=localStorage.getItem(ICS_SUBSCRIPTIONS_KEY)
  return raw?validateSubscriptions(JSON.parse(raw)):empty()
}
export function reviseSubscriptions(expected:SubscriptionStore,next:SubscriptionStore):SubscriptionStore{
  validateSubscriptions(expected);validateSubscriptions(next)
  const current=readSubscriptions()
  if(JSON.stringify(current)!==JSON.stringify(expected))
    throw new Error('Subscription metadata changed in another tab. Reload before continuing.')
  localStorage.setItem(ICS_SUBSCRIPTIONS_KEY,JSON.stringify(next))
  return next
}
export function addSubscription(store:SubscriptionStore,url:string):SubscriptionStore{
  const canonical=safeFeedUrl(url)
  if(store.items.length>=12)throw new Error('Maximum 12 manually refreshed feeds')
  if(store.items.some(x=>x.url===canonical))throw new Error('This feed is already subscribed')
  return validateSubscriptions({schemaVersion:1,items:[...store.items,{
    id:crypto.randomUUID(),url:canonical,revision:crypto.randomUUID(),
    createdAt:new Date().toISOString(),status:'ready'
  }]})
}
export function changeSubscription(store:SubscriptionStore,id:string,update:Partial<IcsSubscription>):SubscriptionStore{
  const original=store.items.find(item=>item.id===id)
  if(!original)throw new Error('Subscription was removed')
  for(const key of ['id','url','createdAt','revision'] as const)
    if(update[key]!==undefined)throw new Error('Original subscription identity is immutable')
  return validateSubscriptions({schemaVersion:1,items:store.items.map(item=>item.id===id?
    {...item,...update,revision:crypto.randomUUID()}:item)})
}
export function historyEntry(item:IcsSubscription,kind:FeedHistoryEntry['kind'],count?:number):FeedHistoryEntry[]{
  return [...(item.history??[]),{at:new Date().toISOString(),kind,...(count!==undefined?{count}:{})}].slice(-8)
}
export function dropSubscription(store:SubscriptionStore,id:string):SubscriptionStore{
  if(!store.items.some(x=>x.id===id))throw new Error('Subscription was removed')
  return validateSubscriptions({schemaVersion:1,items:store.items.filter(x=>x.id!==id)})
}
export function assertFeedSource(
  store:SubscriptionStore,id:string,sourceName:string,
  importedSources:string[]
):IcsSubscription{
  const sub=store.items.find(x=>x.id===id)
  if(!sub)throw new Error('Subscription was removed')
  if(!sourceName.trim()||sourceName.length>100)throw new Error('Invalid imported source name')
  if(sub.sourceName&&sub.sourceName!==sourceName)
    throw new Error('Feed calendar name changed. No original source was replaced.')
  if(store.items.some(x=>x.id!==id&&x.sourceName===sourceName))
    throw new Error('Another subscription owns this source name')
  if(!sub.sourceName&&importedSources.includes(sourceName))
    throw new Error('This calendar name is already imported. Rename the feed source before subscribing.')
  return sub
}
export type FeedResponse=
  |{kind:'not-modified'}
  |{kind:'snapshot';text:string;etag?:string;lastModified?:string}
export async function fetchSubscribedIcs(
  sub:IcsSubscription,signal:AbortSignal,
  transport:typeof fetch=fetch,conditional=true
):Promise<FeedResponse>{
  const url=safeFeedUrl(sub.url)
  const headers:Record<string,string>={Accept:'text/calendar, text/plain;q=0.9, */*;q=0.1'}
  if(conditional&&sub.lastAppliedAt){
    if(sub.etag)headers['If-None-Match']=sub.etag
    else if(sub.lastModified)headers['If-Modified-Since']=sub.lastModified
  }
  let response:Response
  try{
    response=await transport(url,{method:'GET',mode:'cors',credentials:'omit',
      redirect:'error',referrerPolicy:'no-referrer',cache:'no-store',headers,signal})
  }catch(error){
    if(signal.aborted)throw new Error('Refresh cancelled')
    throw new Error('Feed unavailable: offline, blocked by CORS, redirect, or network error')
  }
  if(signal.aborted)throw new Error('Refresh cancelled')
  if(response.status===304){
    if(!sub.sourceName||!sub.lastAppliedAt||!headers['If-None-Match']&&!headers['If-Modified-Since'])
      throw new Error('Unverified 304 response; a complete snapshot is required')
    return {kind:'not-modified'}
  }
  if(response.status!==200)throw new Error('Feed responded with HTTP '+response.status+'; previous events were preserved')
  const reported=Number(response.headers.get('Content-Length')??0)
  if(Number.isFinite(reported)&&reported>2_000_000)throw new Error('Feed exceeds 2 MB limit')
  const reader=response.body?.getReader()
  let text=''
  if(reader){
    const decoder=new TextDecoder('utf-8',{fatal:true})
    let bytes=0
    try{
      while(true){
        const part=await reader.read()
        if(part.done)break
        if(signal.aborted)throw new Error('Refresh cancelled')
        bytes+=part.value.byteLength
        if(bytes>2_000_000)throw new Error('Feed exceeds 2 MB limit')
        text+=decoder.decode(part.value,{stream:true})
      }
      text+=decoder.decode()
    }finally{reader.releaseLock()}
  }else{
    text=await response.text()
    if(new TextEncoder().encode(text).byteLength>2_000_000)
      throw new Error('Feed exceeds 2 MB limit')
  }
  if(!text.trim())throw new Error('Empty feed is not a complete source snapshot')
  const etag=response.headers.get('ETag'),lastModified=response.headers.get('Last-Modified')
  return {kind:'snapshot',text,...(validHeader(etag,200)?{etag}:{}),
    ...(validHeader(lastModified,100)?{lastModified}:{})}
}
