import type {LocalDate} from '../types'
import {addDays,day,daysBetween,dateSeries} from './dates'

export interface FiniteAllDayRule {frequency:'DAILY'|'WEEKLY'|'MONTHLY';interval:number;count?:number;until?:LocalDate;weekdays?:number[]}
const weekdays:Record<string,number>={SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6}
export function parseFiniteAllDayRule(value:string,start:LocalDate):FiniteAllDayRule {
  day(start)
  const pairs=value.split(';').map(v=>v.split('='))
  if(pairs.some(p=>p.length!==2)||new Set(pairs.map(p=>p[0])).size!==pairs.length)throw new Error('Unsupported or duplicate RRULE fields')
  const map=Object.fromEntries(pairs) as Record<string,string>
  if(Object.keys(map).some(x=>!['FREQ','INTERVAL','COUNT','UNTIL','BYDAY'].includes(x)))throw new Error('Unsupported RRULE qualifier')
  if(!['DAILY','WEEKLY','MONTHLY'].includes(map.FREQ))throw new Error('Unsupported RRULE frequency')
  const freq=map.FREQ as FiniteAllDayRule['frequency']
  if(map.BYDAY&&freq!=='WEEKLY')throw new Error('BYDAY currently supports weekly all-day only')
  const interval=map.INTERVAL?Number(map.INTERVAL):1
  if(!Number.isInteger(interval)||interval<1||interval>12)throw new Error('Unsupported recurrence interval')
  if(Boolean(map.COUNT)===Boolean(map.UNTIL))throw new Error('Finite RRULE must specify exactly one of COUNT or UNTIL')
  let count:number|undefined,until:LocalDate|undefined
  if(map.COUNT){count=Number(map.COUNT);if(!Number.isInteger(count)||count<1||count>150)throw new Error('COUNT exceeds bounded import limit')}
  if(map.UNTIL){
    if(!/^\d{8}$/.test(map.UNTIL))throw new Error('Only date-only UNTIL is supported for all-day events')
    until=map.UNTIL.slice(0,4)+'-'+map.UNTIL.slice(4,6)+'-'+map.UNTIL.slice(6)
    day(until)
    if(until<start||daysBetween(start,until)>730)throw new Error('Recurring date window exceeds 730-day import limit')
  }
  let selected:number[]|undefined
  if(map.BYDAY){
    const values=map.BYDAY.split(',')
    if(values.some(x=>!(x in weekdays))||new Set(values).size!==values.length)throw new Error('Unsupported BYDAY rule')
    selected=values.map(x=>weekdays[x])
    if(!selected.includes(day(start).getDay()))throw new Error('DTSTART weekday is not in BYDAY')
  }
  return {frequency:freq,interval,count,until,weekdays:selected}
}
export function expandFiniteAllDay(start:LocalDate,rule:FiniteAllDayRule,exdates:LocalDate[]=[]):LocalDate[]{
  day(start)
  const first=day(start),anchorWeekday=(first.getDay()+6)%7,anchorDay=first.getDate()
  const scanEnd=rule.until??addDays(start,730)
  let emitted=0
  const results:LocalDate[]=[]
  const excludes=new Set(exdates)
  for(const d of dateSeries(start,scanEnd,732)){
    const gap=daysBetween(start,d)
    let matches=false
    if(rule.frequency==='DAILY')matches=gap%rule.interval===0
    else if(rule.frequency==='WEEKLY')
      matches=Math.floor((gap+anchorWeekday)/7)%rule.interval===0&&
        (rule.weekdays?.length?rule.weekdays.includes(day(d).getDay()):day(d).getDay()===first.getDay())
    else{
      const at=day(d),diff=(at.getFullYear()-first.getFullYear())*12+at.getMonth()-first.getMonth()
      matches=diff%rule.interval===0&&at.getDate()===anchorDay
    }
    if(!matches)continue
    emitted++
    if(!excludes.has(d))results.push(d)
    if(rule.count&&emitted>=rule.count)return results
    if(results.length>150)throw new Error('Too many recurring date instances')
  }
  if(rule.count&&emitted<rule.count)throw new Error('Finite RRULE extends beyond 730-day import window')
  return results
}
