import type {LocalDate} from '../types'
import {addDays,day,daysBetween,dateSeries} from './dates'

export interface FiniteAllDayRule {frequency:'DAILY'|'WEEKLY'|'MONTHLY'|'YEARLY';interval:number;count?:number;until?:LocalDate;weekdays?:number[];monthdays?:number[];months?:number[];monthlyWeekdays?:{ordinal:number;weekday:number}[];setPositions?:number[]}
const weekdays:Record<string,number>={SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6}
export function parseFiniteAllDayRule(value:string,start:LocalDate):FiniteAllDayRule {
  day(start)
  const pairs=value.split(';').map(v=>v.split('='))
  if(pairs.some(p=>p.length!==2)||new Set(pairs.map(p=>p[0])).size!==pairs.length)throw new Error('Unsupported or duplicate RRULE fields')
  const map=Object.fromEntries(pairs) as Record<string,string>
  if(Object.keys(map).some(x=>!['FREQ','INTERVAL','COUNT','UNTIL','BYDAY','BYMONTHDAY','BYMONTH','BYSETPOS'].includes(x)))throw new Error('Unsupported RRULE qualifier')
  if(!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(map.FREQ))throw new Error('Unsupported RRULE frequency')
  const freq=map.FREQ as FiniteAllDayRule['frequency']
  if(map.BYDAY&&freq!=='WEEKLY'&&freq!=='MONTHLY'&&freq!=='YEARLY')
    throw new Error('BYDAY requires weekly, monthly or bounded yearly recurrence')
  if(freq==='YEARLY'&&map.BYDAY&&!map.BYMONTH)
    throw new Error('Yearly BYDAY requires explicit BYMONTH to avoid ambiguous year-wide ordinal positions')
  if(freq==='YEARLY'&&map.BYDAY&&map.BYMONTHDAY)
    throw new Error('Combined yearly BYDAY and BYMONTHDAY are not supported in a bounded snapshot')
  if(map.BYMONTH&&freq!=='MONTHLY'&&freq!=='YEARLY')
    throw new Error('BYMONTH supports monthly or yearly recurrence only')
  if(freq==='MONTHLY'&&map.BYDAY&&map.BYMONTHDAY)
    throw new Error('Combined monthly BYDAY and BYMONTHDAY are not supported in a bounded snapshot')
  if(map.BYMONTHDAY&&freq!=='MONTHLY'&&freq!=='YEARLY')throw new Error('BYMONTHDAY supports monthly or yearly recurrence only')
  if(map.BYSETPOS&&(freq!=='MONTHLY'||!map.BYDAY||map.BYMONTHDAY))
    throw new Error('BYSETPOS supports monthly weekday lists only')
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
  let monthlyWeekdays:{ordinal:number;weekday:number}[]|undefined
  if(map.BYDAY){
    const values=map.BYDAY.split(',')
    if(!values.length||values.length>7||new Set(values).size!==values.length)
      throw new Error('Unsupported or duplicate BYDAY list')
    if(freq==='WEEKLY'){
      if(values.some(x=>!(x in weekdays)))throw new Error('Unsupported weekly BYDAY rule')
      selected=values.map(x=>weekdays[x])
      if(!selected.includes(day(start).getDay()))throw new Error('DTSTART weekday is not in BYDAY')
    }else{
      monthlyWeekdays=values.map(value=>{
        const match=/^(-?[1-5])?(SU|MO|TU|WE|TH|FR|SA)$/.exec(value)
        if(!match||match[1]==='0'||match[1]==='-0')
          throw new Error('Unsupported monthly BYDAY ordinal (use 1..5 or -1..-5)')
        return {ordinal:match[1]?Number(match[1]):0,weekday:weekdays[match[2]]}
      })
      if(!monthlyWeekdays.some(selector=>matchesMonthlyWeekday(day(start),selector)))
        throw new Error('DTSTART is not included in '+(freq==='YEARLY'?'yearly':'monthly')+' BYDAY')
    }
  }
  let months:number[]|undefined
  if(map.BYMONTH){
    const items=map.BYMONTH.split(',')
    months=items.map(Number)
    if(items.length<1||items.length>12||items.some((v,i)=>!/^(?:[1-9]|1[0-2])$/.test(v)||
        !Number.isInteger(months![i]))||new Set(months).size!==months.length)
      throw new Error('Unsupported or duplicate BYMONTH (1..12)')
    if(!months.includes(day(start).getMonth()+1))
      throw new Error('DTSTART month is not included in BYMONTH')
  }
  let monthdays:number[]|undefined
  if(map.BYMONTHDAY){
    const items=map.BYMONTHDAY.split(',')
    monthdays=items.map(Number)
    if(items.length<1||items.length>12||items.some((value,i)=>!/^[-]?(?:[1-9]|[12][0-9]|3[01])$/.test(value)||
        value==='-0'||!Number.isInteger(monthdays![i])||monthdays![i]===0)||
        new Set(monthdays).size!==monthdays.length)
      throw new Error('Unsupported BYMONTHDAY list (use unique -31..-1 or 1..31)')
    const current=day(start)
    const lastDay=new Date(current.getFullYear(),current.getMonth()+1,0).getDate()
    if(!monthdays.some(n=>n>0?n===current.getDate():lastDay+n+1===current.getDate()))
      throw new Error('DTSTART is not included in BYMONTHDAY')
  }
  let setPositions:number[]|undefined
  if(map.BYSETPOS){
    const tokens=map.BYSETPOS.split(',')
    setPositions=tokens.map(Number)
    if(tokens.length<1||tokens.length>6||
      tokens.some((token,i)=>!/^[-]?(?:[1-9]|[12][0-9]|3[01])$/.test(token)||
        !Number.isInteger(setPositions![i])||setPositions![i]===0)||
      new Set(setPositions).size!==setPositions.length||
      !monthlyWeekdays?.length||monthlyWeekdays.some(selector=>selector.ordinal!==0))
      throw new Error('BYSETPOS requires unique bounded positions and unnumbered monthly BYDAY')
    if(!matchesMonthlySetPosition(day(start),monthlyWeekdays,setPositions))
      throw new Error('DTSTART is not included in monthly BYSETPOS')
  }
  return {frequency:freq,interval,count,until,weekdays:selected,monthdays,months,monthlyWeekdays,setPositions}
}
/** Bounded RFC5545 monthly selector (and YEARLY only when BYMONTH is explicit):
 * positive and negative ordinals are relative to the matching source month.
 * Never interpret yearly bare ordinal BYDAY without BYMONTH as month-relative.
 * RFC 5545 monthly selector: a positive ordinal counts from month start,
 * a negative ordinal from month end. Zero means every named weekday. */
function matchesMonthlyWeekday(date:Date,rule:{ordinal:number;weekday:number}):boolean {
  if(date.getDay()!==rule.weekday)return false
  if(rule.ordinal===0)return true
  const last=new Date(date.getFullYear(),date.getMonth()+1,0).getDate()
  const ordinal=rule.ordinal>0?Math.floor((date.getDate()-1)/7)+1:
    -Math.floor((last-date.getDate())/7)-1
  return ordinal===rule.ordinal
}
/** RFC BYSETPOS is applied to the ordered candidate weekdays WITHIN each
 * original calendar month; never to a floating 730-day expansion or an
 * isolated weekday occurrence. This preserves correct first/last workdays. */
function matchesMonthlySetPosition(
  date:Date,weekdaysInMonth:{ordinal:number;weekday:number}[],positions:number[]
):boolean {
  const year=date.getFullYear(),month=date.getMonth()
  const end=new Date(year,month+1,0).getDate()
  const candidates:number[]=[]
  for(let d=1;d<=end;d++){
    const candidate=new Date(year,month,d,12)
    if(weekdaysInMonth.some(rule=>matchesMonthlyWeekday(candidate,rule)))candidates.push(d)
  }
  return positions.some(position=>{
    const index=position>0?position-1:candidates.length+position
    return index>=0&&index<candidates.length&&candidates[index]===date.getDate()
  })
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
      const yearDiff=at.getFullYear()-first.getFullYear()
      const scheduled=rule.frequency==='YEARLY'?
        yearDiff%rule.interval===0&&(rule.months?.includes(at.getMonth()+1)??at.getMonth()===first.getMonth()):
        diff%rule.interval===0&&(!rule.months||rule.months.includes(at.getMonth()+1))
      if(!scheduled)continue
      if(rule.monthdays?.length){
        const lastDay=new Date(at.getFullYear(),at.getMonth()+1,0).getDate()
        matches=rule.monthdays.some(n=>n>0?n===at.getDate():lastDay+n+1===at.getDate())
      }else if(rule.monthlyWeekdays?.length)
        matches=rule.monthlyWeekdays.some(selector=>matchesMonthlyWeekday(at,selector))&&
          (!rule.setPositions||matchesMonthlySetPosition(at,rule.monthlyWeekdays,rule.setPositions))
      else matches=at.getDate()===anchorDay
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
