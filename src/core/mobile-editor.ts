import {addDays,localDateTime,localInstantOptions,resolveLocalInstant} from './dates'
import {draftTimedRange} from './draft'
import {zoneInstantOptions,zoneWall,resolveZoneInstant} from './time-zone'

export type FoldChoice=''|'earlier'|'later'
export type MobileTimedAction=
  |{kind:'shift';minutes:-30|30}
  |{kind:'day';days:-1|1}
  |{kind:'duration';minutes:30|60|90|120}
export interface MobileTimedRange {
  start:string;end:string;startFold:FoldChoice;endFold:FoldChoice
}
function foldOf(instant:string,zone?:string):FoldChoice{
  const options=zone?zoneInstantOptions(zoneWall(instant,zone),zone):localInstantOptions(localDateTime(instant))
  return options.length===2?(options[0]===instant?'earlier':'later'):''
}
function fromInstants(start:string,end:string,zone?:string):MobileTimedRange{
  return {start:zone?zoneWall(start,zone):localDateTime(start),end:zone?zoneWall(end,zone):localDateTime(end),
    startFold:foldOf(start,zone),endFold:foldOf(end,zone)}
}
/** Changes only a local editor draft. No source record is read or written here.
 * Duration and +/-30 use physical instants through DST; date changes preserve
 * wall clock time and reject missing or ambiguous target times. */
export function mobileTimedChange(input:MobileTimedRange,action:MobileTimedAction,zone?:string):MobileTimedRange{
  if(action.kind==='day'){
    const shift=(wall:string)=>addDays(wall.slice(0,10),action.days)+wall.slice(10)
    const nextStart=shift(input.start),nextEnd=shift(input.end)
    // Do not silently choose a repeated DST hour on a date shift.
    const range=draftTimedRange(nextStart,nextEnd,undefined,undefined,zone)
    return fromInstants(range.start,range.end,zone)
  }
  if(action.kind==='duration'){
    const first=zone?resolveZoneInstant(input.start,zone,input.startFold||undefined):resolveLocalInstant(input.start,input.startFold||undefined)
    return fromInstants(first,new Date(Date.parse(first)+action.minutes*60000).toISOString(),zone)
  }
  const original=draftTimedRange(input.start,input.end,input.startFold||undefined,input.endFold||undefined,zone)
  return fromInstants(
    new Date(Date.parse(original.start)+action.minutes*60000).toISOString(),
    new Date(Date.parse(original.end)+action.minutes*60000).toISOString(),zone)
}
/** For multi-day all-day drafts, shift both inclusive dates as one range. */
export function mobileAllDayShift(start:string,end:string,days:-1|1):{start:string;end:string}{
  if(end<start)throw new Error('All-day last date must follow the first date')
  return {start:addDays(start,days),end:addDays(end,days)}
}
