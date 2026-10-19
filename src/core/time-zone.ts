/** IANA wall-clock conversion without a second calendar engine or timezone database.
 * Canonical events retain UTC instants; Intl supplies installed IANA rules. */
const formatters=new Map<string,Intl.DateTimeFormat>()
export function validTimeZone(value:string):string {
  if(typeof value!=='string'||!value||value.length>100)throw new Error('Invalid IANA time zone')
  try{new Intl.DateTimeFormat('en-US',{timeZone:value}).format(new Date())}
  catch{throw new Error('Unsupported IANA time zone: '+value)}
  return value
}
export function deviceTimeZone():string{
  return validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
}
function formatter(zone:string):Intl.DateTimeFormat{
  const existing=formatters.get(zone)
  if(existing)return existing
  validTimeZone(zone)
  const fresh=new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',year:'numeric',
    month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
  formatters.set(zone,fresh)
  return fresh
}
export function zoneWall(iso:string,zone:string):string{
  const instant=new Date(iso)
  if(!Number.isFinite(instant.getTime()))throw new Error('Invalid UTC instant')
  const parts=formatter(zone).formatToParts(instant)
  const get=(type:string)=>parts.find(x=>x.type===type)?.value
  const y=get('year'),m=get('month'),d=get('day'),h=get('hour'),min=get('minute')
  if(!y||!m||!d||!h||!min)throw new Error('Unavailable IANA wall clock')
  return y+'-'+m+'-'+d+'T'+h+':'+min
}
export function zoneDate(iso:string,zone:string):string{return zoneWall(iso,zone).slice(0,10)}
function validWall(value:string):number{
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Invalid wall-clock minute')
  const y=Number(value.slice(0,4)),m=Number(value.slice(5,7)),d=Number(value.slice(8,10)),
    h=Number(value.slice(11,13)),min=Number(value.slice(14,16))
  const candidate=Date.UTC(y,m-1,d,h,min)
  const back=new Date(candidate)
  if(back.getUTCFullYear()!==y||back.getUTCMonth()+1!==m||back.getUTCDate()!==d||
     back.getUTCHours()!==h||back.getUTCMinutes()!==min)throw new Error('Invalid wall-clock date or time')
  return candidate
}
function offsetAt(ts:number,zone:string):number {
  const wall=zoneWall(new Date(ts).toISOString(),zone)
  return validWall(wall)-ts
}
export function zoneInstantOptions(value:string,zone:string):string[]{
  const guess=validWall(value);validTimeZone(zone)
  const offsets=new Set<number>()
  for(const shift of [-36,-12,0,12,36])offsets.add(offsetAt(guess+shift*3600000,zone))
  return [...new Set([...offsets].map(offset=>new Date(guess-offset).toISOString())
    .filter(candidate=>zoneWall(candidate,zone)===value))].sort()
}
export function resolveZoneInstant(value:string,zone:string,fold?:'earlier'|'later'):string{
  const options=zoneInstantOptions(value,zone)
  if(!options.length)throw new Error('This local time does not exist in '+zone)
  if(options.length===1)return options[0]
  if(!fold)throw new Error('This local time occurs twice in '+zone+'. Choose the first or second occurrence.')
  return fold==='earlier'?options[0]:options[options.length-1]
}
export function zoneOffsetLabel(iso:string,zone:string):string{
  const instant=Date.parse(iso),offset=Math.round(offsetAt(instant,zone)/60000)
  const hours=String(Math.floor(Math.abs(offset)/60)).padStart(2,'0')
  const minutes=String(Math.abs(offset)%60).padStart(2,'0')
  return 'UTC'+(offset>=0?'+':'-')+hours+':'+minutes
}
export function zoneChoices(current:string):string[]{
  const available=typeof Intl.supportedValuesOf==='function'?Intl.supportedValuesOf('timeZone'):[]
  return [...new Set([current,deviceTimeZone(),'UTC','Europe/Berlin','Europe/London','Asia/Seoul',
    'Asia/Tokyo','America/New_York','America/Los_Angeles',...available])].filter(x=>{
      try{return Boolean(validTimeZone(x))}catch{return false}
    }).sort((a,b)=>a.localeCompare(b))
}
