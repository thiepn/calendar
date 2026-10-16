import type { LocalDate } from '../types'
const pad = (n:number) => String(n).padStart(2,'0')
export function localDate(date:Date = new Date()):LocalDate {
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`
}
export function day(date:LocalDate):Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid calendar date')
  const [y,m,d]=date.split('-').map(Number)
  const value=new Date(y,m-1,d,12,0,0)
  if (value.getFullYear()!==y || value.getMonth()+1!==m || value.getDate()!==d) throw new Error('Invalid calendar date')
  return value
}
export function addDays(date:LocalDate, amount:number):LocalDate {
  const d=day(date); d.setDate(d.getDate()+amount); return localDate(d)
}
export function daysBetween(from:LocalDate,to:LocalDate):number {
  const x=day(from), y=day(to)
  return Math.round((Date.UTC(y.getFullYear(),y.getMonth(),y.getDate())-Date.UTC(x.getFullYear(),x.getMonth(),x.getDate()))/86400000)
}
export function monday(date:LocalDate):LocalDate {
  const n=day(date).getDay()
  return addDays(date, n===0 ? -6 : 1-n)
}
export function monthStart(date:LocalDate):LocalDate { return date.slice(0,7)+'-01' }
export function monthGridStart(date:LocalDate):LocalDate { return monday(monthStart(date)) }
export function addMonths(date:LocalDate, amount:number):LocalDate {
  const d=day(date); const original=d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+amount)
  const month=d.getMonth(); d.setDate(Math.min(original, new Date(d.getFullYear(),month+1,0).getDate()))
  return localDate(d)
}
export function localDateTime(iso:string):string {
  const d=new Date(iso)
  if (!Number.isFinite(d.getTime())) throw new Error('Invalid time')
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function fromLocalDateTime(value:string):string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Invalid local date/time')
  const d=new Date(value)
  if (!Number.isFinite(d.getTime()) || localDateTime(d.toISOString())!==value) throw new Error('Time does not exist in this time zone')
  return d.toISOString()
}
/** Resolve unique physical instants for a local wall-clock minute.
 * Explicit UTC instants are canonical; ambiguous wall times require a choice. */
export function localInstantOptions(value:string):string[] {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Invalid local date/time')
  const initial=fromLocalDateTime(value)
  const base=Date.parse(initial)
  const found=new Set<string>([initial])
  for(let minutes=-180;minutes<=180;minutes+=15){
    const candidate=new Date(base+minutes*60000).toISOString()
    if(localDateTime(candidate)===value)found.add(candidate)
  }
  return Array.from(found).sort()
}
export function resolveLocalInstant(value:string,fold?:'earlier'|'later'):string {
  const options=localInstantOptions(value)
  if(options.length===1)return options[0]
  if(!fold)throw new Error('This local time occurs twice during a daylight-saving transition. Choose the first or second occurrence.')
  return fold==='earlier'?options[0]:options[options.length-1]
}
export function offsetLabel(iso:string):string {
  const offset=-new Date(iso).getTimezoneOffset()
  const hours=String(Math.floor(Math.abs(offset)/60)).padStart(2,'0')
  const minutes=String(Math.abs(offset)%60).padStart(2,'0')
  return 'UTC'+(offset>=0?'+':'-')+hours+':'+minutes
}
/** Reject nonexistent and duplicated local clock times on DST transitions.
 * Device zone is authoritative for this standalone local-only planner. */
export function fromUnambiguousLocalDateTime(value:string):string {
  const iso=fromLocalDateTime(value)
  const time=Date.parse(iso)
  for(let offset=-180;offset<=180;offset+=15){
    if(!offset)continue
    if(localDateTime(new Date(time+offset*60000).toISOString())===value)
      throw new Error('This local time occurs twice during a daylight-saving transition. Use a different time.')
  }
  return iso
}
export function displayTime(iso:string):string {
  return new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit'}).format(new Date(iso))
}
export function dateLabel(date:LocalDate,options:Intl.DateTimeFormatOptions={weekday:'short',month:'short',day:'numeric'}):string {
  return new Intl.DateTimeFormat(undefined,options).format(day(date))
}
export function dateSeries(from:LocalDate,to:LocalDate,cap=400):LocalDate[] {
  const count=daysBetween(from,to)+1
  if(count<0 || count>cap) throw new Error('Calendar date range outside limit')
  return Array.from({length:count},(_,i)=>addDays(from,i))
}
export function friendlyRange(from:LocalDate,to:LocalDate):string {
  return from===to ? dateLabel(from,{month:'long',day:'numeric',year:'numeric'}) :
    dateLabel(from,{month:'short',day:'numeric'})+' – '+dateLabel(to,{month:'short',day:'numeric',year:'numeric'})
}
