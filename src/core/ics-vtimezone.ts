import {validTimeZone,zoneOffsetLabel} from './time-zone'

export interface EmbeddedZone {id:string;offsets:number[];observances:number;hasRecurrence:boolean}
type Section={kind:'STANDARD'|'DAYLIGHT';fields:Map<string,string[]>}
function prop(line:string):{name:string;value:string}|null{
  const colon=line.indexOf(':')
  if(colon<0)return null
  return {name:line.slice(0,colon).split(';')[0].toUpperCase(),value:line.slice(colon+1).trim()}
}
function offset(raw:string):number{
  const match=/^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(raw)
  if(!match)throw new Error('Unsupported VTIMEZONE UTC offset')
  const hours=Number(match[2]),minutes=Number(match[3]),seconds=Number(match[4]??'0')
  if(hours>23||minutes>59||seconds>59||seconds!==0)throw new Error('Unsupported VTIMEZONE UTC offset precision')
  return (match[1]==='-'?-1:1)*(hours*60+minutes)
}
function single(section:Section,name:string):string{
  const values=section.fields.get(name)??[]
  if(values.length!==1)throw new Error('VTIMEZONE '+section.kind+' requires exactly one '+name)
  return values[0]
}
/** Check declared VTIMEZONE provenance without replacing the browser's installed
 * IANA rules. No invented RFC RRULE engine, provider sync or silent fixed offset. */
export function embeddedTimeZones(lines:string[]):Map<string,EmbeddedZone>{
  const declared=new Map<string,EmbeddedZone>()
  let active:{id:string[];sections:Section[];child:Section|null}|null=null
  let depth=0
  for(const line of lines){
    const upper=line.trim().toUpperCase()
    if(upper==='BEGIN:VTIMEZONE'){
      if(active)throw new Error('Nested VTIMEZONE is unsupported')
      active={id:[],sections:[],child:null};depth=1;continue
    }
    if(!active)continue
    if(upper==='BEGIN:STANDARD'||upper==='BEGIN:DAYLIGHT'){
      if(depth!==1||active.child)throw new Error('Invalid nested VTIMEZONE observance')
      active.child={kind:upper.slice(6) as 'STANDARD'|'DAYLIGHT',fields:new Map()}
      depth++;continue
    }
    if(upper.startsWith('BEGIN:'))throw new Error('Unsupported VTIMEZONE nested component')
    if(upper==='END:STANDARD'||upper==='END:DAYLIGHT'){
      if(depth!==2||!active.child||active.child.kind!==upper.slice(4))
        throw new Error('Unbalanced VTIMEZONE observance')
      active.sections.push(active.child);active.child=null;depth--;continue
    }
    if(upper==='END:VTIMEZONE'){
      if(depth!==1||active.child||active.id.length!==1||!active.sections.length)
        throw new Error('Incomplete VTIMEZONE declaration')
      const id=active.id[0]
      validTimeZone(id)
      if(declared.has(id))throw new Error('Duplicate VTIMEZONE declaration: '+id)
      const offsets=new Set<number>(),sections=active.sections
      for(const section of sections){
        const dt=single(section,'DTSTART')
        if(!/^\d{8}T\d{6}$/.test(dt))throw new Error('Unsupported VTIMEZONE transition DTSTART')
        offsets.add(offset(single(section,'TZOFFSETFROM')))
        offsets.add(offset(single(section,'TZOFFSETTO')))
        for(const name of ['RRULE','RDATE','EXDATE']){
          const items=section.fields.get(name)??[]
          if(items.length>1)throw new Error('Duplicate VTIMEZONE '+name)
          if(name==='RRULE'&&items.length&&
             !/^FREQ=YEARLY(?:;BYMONTH=\d{1,2})?(?:;BYDAY=-?\d?(?:SU|MO|TU|WE|TH|FR|SA))?(?:;BYMONTHDAY=\d{1,2})?$/.test(items[0]))
            throw new Error('Unsupported VTIMEZONE observance RRULE')
          if((name==='RDATE'||name==='EXDATE')&&items.length)
            throw new Error('VTIMEZONE observance RDATE/EXDATE requires independent rule evaluation')
        }
      }
      declared.set(id,{id,offsets:[...offsets],observances:sections.length,
        hasRecurrence:sections.some(s=>s.fields.has('RRULE'))})
      active=null;depth=0;continue
    }
    if(upper.startsWith('END:'))throw new Error('Unbalanced VTIMEZONE')
    const p=prop(line)
    if(!p)continue
    if(depth===1&&p.name==='TZID')active.id.push(p.value.replace(/^"|"$/g,''))
    if(depth===2&&active.child){
      const values=active.child.fields.get(p.name)??[]
      values.push(p.value)
      active.child.fields.set(p.name,values)
    }
  }
  if(active)throw new Error('Incomplete VTIMEZONE')
  return declared
}
/** A matching named zone must use an offset allowed by the embedded observances.
 * This deliberately does not certify RRULE equivalence; installed IANA governs. */
export function verifyEmbeddedOffset(
  zone:string,iso:string,declared:Map<string,EmbeddedZone>
):void{
  validTimeZone(zone)
  const source=declared.get(zone)
  if(!source)return
  const label=zoneOffsetLabel(iso,zone)
  const sign=label[3]==='-'?-1:1
  const actual=sign*(Number(label.slice(4,6))*60+Number(label.slice(7,9)))
  if(!source.offsets.includes(actual))
    throw new Error('VTIMEZONE offset disagrees with installed IANA rules for '+zone)
}
