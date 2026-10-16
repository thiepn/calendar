import type {CalendarRecord,CalendarState} from '../types'
import {addDays,day,localDate} from './dates'
import {occurrencesBetween} from './occurrences'

export interface IcsPreview {records:CalendarRecord[];warnings:string[];name:string}
type Property={name:string;params:Record<string,string>;value:string}
function hash(text:string):string {let h=2166136261;for(const ch of text){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
function property(line:string):Property|null {
  const colon=line.indexOf(':')
  if(colon<0)return null
  const [name,...pairs]=line.slice(0,colon).split(';')
  const params:Record<string,string>={}
  pairs.forEach(p=>{const n=p.indexOf('=');if(n>0)params[p.slice(0,n).toUpperCase()]=p.slice(n+1).replace(/^"|"$/g,'')})
  return {name:name.toUpperCase(),params,value:line.slice(colon+1)}
}
function unfolded(text:string):string[] {
  const out:string[]=[]
  for(const line of text.replace(/\r\n?/g,'\n').split('\n')) {
    if(/^[ \t]/.test(line)&&out.length)out[out.length-1]+=line.slice(1)
    else out.push(line)
  }
  return out
}
function unescapeText(text:string):string {
  return text.replace(/\\n/gi,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\')
}
function dateOnly(value:string):string {
  if(!/^\d{8}$/.test(value))throw new Error('Invalid DATE')
  const date=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6)
  day(date)
  return date
}
function zonePieces(instant:Date,tz:string){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(instant)
  const m=Object.fromEntries(parts.map(p=>[p.type,p.value]))
  return [Number(m.year),Number(m.month),Number(m.day),Number(m.hour),Number(m.minute),Number(m.second)]
}
function zonedInstant(values:number[],tz:string):string {
  const target=Date.UTC(values[0],values[1]-1,values[2],values[3],values[4],values[5])
  let guess=target
  for(let i=0;i<4;i++){const seen=zonePieces(new Date(guess),tz);const wall=Date.UTC(seen[0],seen[1]-1,seen[2],seen[3],seen[4],seen[5]);guess+=target-wall}
  const same=(ms:number)=>zonePieces(new Date(ms),tz).every((x,i)=>x===values[i])
  if(!same(guess))throw new Error('Nonexistent local time (DST)')
  if(same(guess-3600000)||same(guess+3600000))throw new Error('Ambiguous local time (DST)')
  return new Date(guess).toISOString()
}
function parseInstant(p:Property):{iso:string;date?:string} {
  if(p.params.VALUE==='DATE'||/^\d{8}$/.test(p.value)){
    const date=dateOnly(p.value)
    return {date,iso:new Date(date+'T00:00:00').toISOString()}
  }
  const m=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(p.value)
  if(!m)throw new Error('Unsupported DTSTART/DTEND format')
  const values=[+m[1],+m[2],+m[3],+m[4],+m[5],+(m[6]??0)]
  const proposed=new Date(Date.UTC(values[0],values[1]-1,values[2],values[3],values[4],values[5]))
  if([proposed.getUTCFullYear(),proposed.getUTCMonth()+1,proposed.getUTCDate(),proposed.getUTCHours(),proposed.getUTCMinutes(),proposed.getUTCSeconds()].some((n,i)=>n!==values[i]))throw new Error('Invalid calendar time')
  if(m[7])return {iso:proposed.toISOString()}
  if(p.params.TZID)return {iso:zonedInstant(values,p.params.TZID)}
  const local=new Date(values[0],values[1]-1,values[2],values[3],values[4],values[5])
  if([local.getFullYear(),local.getMonth()+1,local.getDate(),local.getHours(),local.getMinutes(),local.getSeconds()].some((n,i)=>n!==values[i]))throw new Error('Nonexistent local time')
  return {iso:local.toISOString()}
}
export function previewIcs(text:string):IcsPreview {
  if(text.length>2_000_000)throw new Error('ICS file is too large (2 MB maximum)')
  const lines=unfolded(text)
  if(!lines.some(x=>x.toUpperCase()==='BEGIN:VCALENDAR'))throw new Error('This is not an iCalendar file')
  const records:CalendarRecord[]=[]
  const warnings:string[]=[]
  let name='Imported calendar'
  let event:Property[]|null=null
  const items:Property[][]=[]
  for(const line of lines){
    const upper=line.trim().toUpperCase()
    if(upper==='BEGIN:VEVENT'){event=[];continue}
    if(upper==='END:VEVENT'){if(event)items.push(event);event=null;continue}
    const p=property(line)
    if(!p)continue
    if(event)event.push(p)
    else if(p.name==='X-WR-CALNAME')name=unescapeText(p.value).slice(0,100)||name
  }
  for(const props of items){
    const get=(key:string)=>props.find(p=>p.name===key)
    const title=unescapeText(get('SUMMARY')?.value??'Untitled').trim()||'Untitled'
    try{
      if(get('STATUS')?.value.toUpperCase()==='CANCELLED')continue
      if(get('RRULE')||get('RDATE')||get('EXDATE')){warnings.push(title+': recurrence definition skipped; import expanded instances instead');continue}
      const rawStart=get('DTSTART')
      if(!rawStart)throw new Error('Missing DTSTART')
      const rawEnd=get('DTEND')
      const start=parseInstant(rawStart)
      const end=rawEnd?parseInstant(rawEnd):
        start.date?{date:addDays(start.date,1),iso:new Date(addDays(start.date,1)+'T00:00:00').toISOString()}:null
      if(!end)throw new Error('Missing DTEND')
      if(Boolean(start.date)!==Boolean(end.date))throw new Error('Inconsistent all-day fields')
      if(Date.parse(end.iso)<=Date.parse(start.iso)||start.date && end.date!<=start.date)throw new Error('End must follow start')
      const description=unescapeText(get('DESCRIPTION')?.value??'')
      const location=unescapeText(get('LOCATION')?.value??'')
      if(title.length>240||description.length>4000||location.length>500)throw new Error('Field exceeds permitted length')
      const uid=get('UID')?.value??''
      const recurrence=get('RECURRENCE-ID')?.value??''
      const sourceKey=uid?name+'|'+uid+'|'+recurrence:name+'|'+title+'|'+start.iso+'|'+end.iso
      records.push({id:'ics-'+hash(sourceKey),source:'ics',sourceCalendar:name,sourceKey,
        title,description,location,start:start.iso,end:end.iso,allDay:Boolean(start.date),
        startDate:start.date,endDateExclusive:end.date,updatedAt:new Date().toISOString()})
    }catch(error){warnings.push(title+': '+(error instanceof Error?error.message:String(error)))}
  }
  return {records,warnings,name}
}
export function mergeIcs(state:CalendarState,preview:IcsPreview):{state:CalendarState;added:number;duplicates:number}{
  const existing=new Set(state.records.filter(x=>x.source==='ics').map(x=>x.sourceKey))
  const next=[...state.records]
  let added=0,duplicates=0
  for(const r of preview.records) {
    if(existing.has(r.sourceKey)){duplicates++;continue}
    // A hash collision must never overwrite an unrelated saved record.
    if(next.some(x=>x.id===r.id)){duplicates++;continue}
    existing.add(r.sourceKey);next.push(r);added++
  }
  return {state:{schemaVersion:1,records:next},added,duplicates}
}
function textValue(value:string){return value.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function utcValue(iso:string){const d=new Date(iso);const p=(n:number)=>String(n).padStart(2,'0');return ''+d.getUTCFullYear()+p(d.getUTCMonth()+1)+p(d.getUTCDate())+'T'+p(d.getUTCHours())+p(d.getUTCMinutes())+p(d.getUTCSeconds())+'Z'}
function fold(line:string):string {
  const enc=new TextEncoder();if(enc.encode(line).length<=73)return line
  const chunks:string[]=[];let cur=''
  for(const ch of line){if(cur&&enc.encode(cur+ch).length>73){chunks.push(cur);cur=' '+ch}else cur+=ch}
  return [...chunks,cur].join('\r\n')
}
export function exportIcs(state:CalendarState,from:string,through:string):string {
  const mine=state.records.filter(r=>r.source==='personal')
  const items=occurrencesBetween(mine,from,through)
  if(items.length>5000)throw new Error('Too many events to export in one snapshot')
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//THIEPN//Calendar standalone//EN','CALSCALE:GREGORIAN','X-WR-CALNAME:THIEPN Calendar']
  for(const item of items){
    const record=mine.find(x=>x.id===item.recordId)!
    lines.push('BEGIN:VEVENT','UID:'+textValue(item.key+'@calendar.thiepn.local'),'DTSTAMP:'+utcValue(new Date().toISOString()),
      'SUMMARY:'+textValue(item.title),'DESCRIPTION:'+textValue(item.description),
      'LOCATION:'+textValue(item.location))
    if(item.allDay){
      lines.push('DTSTART;VALUE=DATE:'+item.startDate.replace(/-/g,''),'DTEND;VALUE=DATE:'+item.endDateExclusive.replace(/-/g,''))
    }else lines.push('DTSTART:'+utcValue(item.start),'DTEND:'+utcValue(item.end))
    lines.push('END:VEVENT')
    void record
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n')+'\r\n'
}
