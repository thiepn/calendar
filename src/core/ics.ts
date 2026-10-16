import type {CalendarRecord,CalendarState} from '../types'
import {addDays,day,daysBetween} from './dates'
import {occurrencesBetween} from './occurrences'
import {parseFiniteAllDayRule,expandFiniteAllDay} from './ics-recurrence'

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
  // Resolve all-day recurrence overrides regardless of their position in the ICS file.
  const replacements=new Map<string,Property[]>()
  for(const props of items){
    const uid=props.find(p=>p.name==='UID')?.value
    const original=props.find(p=>p.name==='RECURRENCE-ID')
    if(uid&&original&&/^\d{8}$/.test(original.value))
      replacements.set(uid+'|'+original.value,props)
  }
  const consumed=new Set<Property[]>()
  const coveredUids=new Set<string>()
  for(const props of items){
    if(consumed.has(props))continue
    const get=(key:string)=>props.find(p=>p.name===key)
    const title=unescapeText(get('SUMMARY')?.value??'Untitled').trim()||'Untitled'
    try{
      if(get('STATUS')?.value.toUpperCase()==='CANCELLED')continue
      if(get('RRULE')||get('RDATE')||get('EXDATE')){
        if(!get('RRULE')||get('RDATE'))throw new Error('Unsupported recurrence rule/RDATE; no partial series imported')
        const uid=get('UID')?.value
        if(!uid)throw new Error('Finite recurring event requires UID')
        const rawStart=get('DTSTART'),rawEnd=get('DTEND')
        if(!rawStart)throw new Error('Missing DTSTART')
        const start=parseInstant(rawStart)
        if(!start.date)throw new Error('Timed ICS RRULE requires external source expansion; only finite all-day recurrence is supported')
        const end=rawEnd?parseInstant(rawEnd):{date:addDays(start.date,1),iso:new Date(addDays(start.date,1)+'T00:00:00').toISOString()}
        if(!end.date||end.date<=start.date)throw new Error('Invalid finite all-day range')
        const duration=daysBetween(start.date,end.date)
        const rules=parseFiniteAllDayRule(get('RRULE')!.value,start.date)
        const exdateValues=props.filter(p=>p.name==='EXDATE')
        const excluded:string[]=[]
        for(const ex of exdateValues){
          if(ex.params.VALUE&&ex.params.VALUE!=='DATE')throw new Error('Unsupported EXDATE timezone; recurrence not imported')
          for(const v of ex.value.split(','))excluded.push(dateOnly(v))
        }
        const expanded=expandFiniteAllDay(start.date,rules,excluded)
        if(records.length+expanded.length>5000)throw new Error('ICS expansion exceeds maximum snapshot size')
        const recurOverrides=new Map<string,Property[]>()
        for(const [key,replacement] of replacements){
          if(key.startsWith(uid+'|'))recurOverrides.set(key,replacement)
        }
        const dates=new Set<string>()
        for(const instance of expanded)dates.add(instance.replace(/-/g,''))
        // EXDATE plus overridden records must not reintroduce excluded original instances.
        for(const ex of excluded)dates.add(ex.replace(/-/g,''))
        for(const instanceToken of dates){
          const originalDate=dateOnly(instanceToken)
          const key=uid+'|'+instanceToken
          const replacement=recurOverrides.get(key)
          if(replacement)consumed.add(replacement)
          if(replacement?.find(p=>p.name==='STATUS')?.value.toUpperCase()==='CANCELLED')continue
          if(excluded.includes(originalDate)&&!replacement)continue
          if(!expanded.includes(originalDate)&&!replacement)continue
          const overrideValue=(field:string)=>replacement?.find(p=>p.name===field)?.value
          const adjustedStart=replacement?.find(p=>p.name==='DTSTART')
          const adjustedEnd=replacement?.find(p=>p.name==='DTEND')
          const startDate=adjustedStart?parseInstant(adjustedStart).date:originalDate
          if(!startDate)throw new Error('Timed recurrence overrides are unsupported')
          const finalDate=adjustedEnd?parseInstant(adjustedEnd).date:addDays(startDate,duration)
          if(!finalDate||finalDate<=startDate)throw new Error('Invalid all-day override')
          const finalTitle=unescapeText(overrideValue('SUMMARY')??get('SUMMARY')?.value??'Untitled').trim()||'Untitled'
          const finalDescription=unescapeText(overrideValue('DESCRIPTION')??get('DESCRIPTION')?.value??'')
          const finalLocation=unescapeText(overrideValue('LOCATION')??get('LOCATION')?.value??'')
          if(finalTitle.length>240||finalDescription.length>4000||finalLocation.length>500)
            throw new Error('Finite recurring entry exceeds permitted text length')
          const sourceKey=name+'|'+uid+'|'+instanceToken
          records.push({id:'ics-'+hash(sourceKey),source:'ics',sourceCalendar:name,sourceKey,
            title:finalTitle,description:finalDescription,location:finalLocation,
            start:new Date(startDate+'T00:00:00').toISOString(),end:new Date(finalDate+'T00:00:00').toISOString(),
            allDay:true,startDate,endDateExclusive:finalDate,updatedAt:new Date().toISOString()})
        }
        coveredUids.add(uid)
        warnings.push(title+': finite all-day RRULE materialized into '+expanded.length+' read-only instance(s); source owns recurrence')
        continue
      }
      if(get('RECURRENCE-ID')&&coveredUids.has(get('UID')?.value??''))continue
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
export function mergeIcs(state:CalendarState,preview:IcsPreview,mode:'update'|'replace'='update'):
  {state:CalendarState;added:number;updated:number;duplicates:number;removed:number}{
  const old=state.records.filter(x=>x.source==='ics'&&x.sourceCalendar===preview.name)
  const prior=new Map(state.records.filter(x=>x.source==='ics').map(x=>[x.sourceKey,x]))
  const next=mode==='replace'?state.records.filter(x=>x.source!=='ics'||x.sourceCalendar!==preview.name):[...state.records]
  const used=new Set(next.map(x=>x.id))
  let added=0,updated=0,duplicates=0
  for(const record of preview.records){
    const existing=mode==='update'?prior.get(record.sourceKey):undefined
    if(existing){
      if(existing.sourceCalendar!==preview.name){duplicates++;continue}
      const keys=['title','description','location','start','end','allDay','startDate','endDateExclusive'] as const
      if(keys.every(k=>existing[k]===record[k])){duplicates++;continue}
      const index=next.findIndex(x=>x.id===existing.id)
      if(index<0)throw new Error('Imported source changed while previewing')
      next[index]={...record,id:existing.id};updated++
    }else{
      if(used.has(record.id)){duplicates++;continue}
      used.add(record.id);next.push(record);added++
    }
  }
  return {state:{schemaVersion:1,records:next},added,updated,duplicates,
    removed:mode==='replace'?old.length:0}
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
    if(record.reminderMinutes!==undefined){
      lines.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+textValue(item.title),
        'TRIGGER:-PT'+record.reminderMinutes+'M','END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n')+'\r\n'
}
