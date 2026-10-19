import type { CalendarRecord,CalendarOccurrence,LocalDate,RepeatRule } from '../types'
import {addDays,day,daysBetween,dateSeries,localDate} from './dates'
import {zoneDate,zoneWall,zoneInstantOptions} from './time-zone'
function anchorOf(record:CalendarRecord):LocalDate {
  return record.allDay ? record.startDate! : record.timeZone?zoneDate(record.start,record.timeZone):localDate(new Date(record.start))
}
function matches(date:LocalDate,anchor:LocalDate,rule:RepeatRule):boolean {
  if (date<anchor || (rule.until && date>rule.until)) return false
  const gap=daysBetween(anchor,date)
  if (rule.frequency==='daily') return gap%rule.interval===0
  if (rule.frequency==='weekly') {
    const weekIndex=Math.floor((gap+((day(anchor).getDay()+6)%7))/7)
    return weekIndex%rule.interval===0 && (rule.weekdays?.length ? rule.weekdays.includes(day(date).getDay()) : day(date).getDay()===day(anchor).getDay())
  }
  const a=day(anchor),d=day(date)
  const months=(d.getFullYear()-a.getFullYear())*12+d.getMonth()-a.getMonth()
  return months>=0 && months%rule.interval===0 && d.getDate()===a.getDate()
}
function dateTimeOn(date:LocalDate,anchor:string):string|null {
  const d=day(date), initial=new Date(anchor)
  d.setHours(initial.getHours(),initial.getMinutes(),initial.getSeconds(),initial.getMilliseconds())
  if(localDate(d)!==date || d.getHours()!==initial.getHours() || d.getMinutes()!==initial.getMinutes()) return null
  return d.toISOString()
}
function instantiate(record:CalendarRecord,date:LocalDate):CalendarOccurrence|null {
  const length=record.allDay ? daysBetween(record.startDate!,record.endDateExclusive!) :
    Math.ceil((Date.parse(record.end)-Date.parse(record.start))/86400000)
  const endDateExclusive=addDays(date,Math.max(1,length))
  const start=record.allDay ? new Date(date+'T00:00:00').toISOString() : date===anchorOf(record)?record.start:
    record.timeZone?zoneInstantOptions(date+'T'+zoneWall(record.start,record.timeZone).slice(11),record.timeZone)[0]??null:
    dateTimeOn(date,record.start)
  if(!start) return null
  const end=record.allDay ? new Date(endDateExclusive+'T00:00:00').toISOString() :
    new Date(Date.parse(start)+(Date.parse(record.end)-Date.parse(record.start))).toISOString()
  return {key:record.id+'@'+date,recordId:record.id,date,start,end,allDay:record.allDay,startDate:date,endDateExclusive,
    title:record.title,source:record.source,sourceCalendar:record.sourceCalendar,location:record.location,description:record.description,
    ...(record.transparent?{transparent:true}:{})}
}
export function occurrencesBetween(records:CalendarRecord[],from:LocalDate,to:LocalDate):CalendarOccurrence[] {
  const found:CalendarOccurrence[]=[]
  for(const record of records) {
    const anchor=anchorOf(record)
    const durationDays=record.allDay ? Math.max(1,daysBetween(record.startDate!,record.endDateExclusive!)) :
      Math.max(1,Math.ceil((Date.parse(record.end)-Date.parse(record.start))/86400000))
    const scanFrom=addDays(from,-Math.min(durationDays-1,31)-(record.timeZone?2:0))
    const scanTo=record.timeZone?addDays(to,2):to
    const occurrenceDates=record.repeat ? dateSeries(scanFrom,scanTo,450).filter(d=>matches(d,anchor,record.repeat!)) : [anchor]
    for(const date of occurrenceDates) {
      if(record.excludedDates?.includes(date)) continue
      const occurrence=instantiate(record,date)
      if(!occurrence) continue
      const hits=record.allDay ? occurrence.startDate<=to && occurrence.endDateExclusive>from :
        Date.parse(occurrence.end)>Date.parse(new Date(from+'T00:00:00').toISOString()) &&
        Date.parse(occurrence.start)<Date.parse(new Date(addDays(to,1)+'T00:00:00').toISOString())
      if(hits) found.push(occurrence)
    }
  }
  return found.sort((a,b)=>Number(b.allDay)-Number(a.allDay)||a.start.localeCompare(b.start)||a.title.localeCompare(b.title))
}
/** Original source-local recurrence date, regardless of the viewer's device. */
export function seriesOccurrenceOn(record:CalendarRecord,date:LocalDate):CalendarOccurrence|null{
  day(date)
  if(record.excludedDates?.includes(date))return null
  if(!record.repeat||!matches(date,anchorOf(record),record.repeat))return null
  return instantiate(record,date)
}
export function dayOccurrences(records:CalendarRecord[],date:LocalDate):CalendarOccurrence[] {
  return occurrencesBetween(records,date,date)
}
export function excludeOccurrence(record:CalendarRecord,date:LocalDate):CalendarRecord {
  if(!record.repeat) throw new Error('This event does not repeat')
  return {...record,excludedDates:Array.from(new Set([...(record.excludedDates??[]),date])).sort(),updatedAt:new Date().toISOString()}
}
export function conflictsOnDay(items:CalendarOccurrence[]):Set<string> {
  const timed=items.filter(x=>!x.allDay&&!x.transparent).sort((a,b)=>a.start.localeCompare(b.start))
  const conflicts=new Set<string>()
  for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length;j++){
    if(Date.parse(timed[j].start)>=Date.parse(timed[i].end))break
    if(Date.parse(timed[j].end)>Date.parse(timed[i].start)){conflicts.add(timed[i].key);conflicts.add(timed[j].key)}
  }
  return conflicts
}
