import {addDays} from './dates'

/** Deliberately narrow RFC5545 DURATION support. A date-only VEVENT is measured
 * in civil days; a timed VEVENT only accepts elapsed PT hours/minutes/seconds,
 * not nominal days that could cross a source-zone DST offset transition. */
export function parseIcsDuration(value:string,allDay:boolean):number{
  if(allDay){
    const match=/^P([1-9][0-9]{0,2})([DW])$/.exec(value)
    if(!match)throw new Error('All-day DURATION must use positive PnD or PnW')
    const days=Number(match[1])*(match[2]==='W'?7:1)
    if(days<1||days>31)throw new Error('All-day DURATION exceeds 31-day range')
    return days
  }
  const match=/^PT(?:(\d{1,3})H)?(?:(\d{1,6})M)?(?:(\d{1,6})S)?$/.exec(value)
  if(!match||(match[1]===undefined&&match[2]===undefined&&match[3]===undefined))
    throw new Error('Timed DURATION must use elapsed PT hours/minutes/seconds')
  const hours=Number(match[1]??0),minutes=Number(match[2]??0),seconds=Number(match[3]??0)
  const duration=(hours*3600+minutes*60+seconds)*1000
  if(duration<=0||duration>7*86400000)
    throw new Error('Timed DURATION exceeds bounded elapsed-time range')
  return duration
}
export function endFromIcsDuration(start:{iso:string;date?:string},value:string):{iso:string;date?:string}{
  const span=parseIcsDuration(value,Boolean(start.date))
  if(start.date){
    const date=addDays(start.date,span)
    return {date,iso:new Date(date+'T00:00:00').toISOString()}
  }
  return {iso:new Date(Date.parse(start.iso)+span).toISOString()}
}
