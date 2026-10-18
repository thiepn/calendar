import {addDays,localDateTime,localInstantOptions,resolveLocalInstant} from './dates'
import {draftTimedRange} from './draft'

export type FoldChoice=''|'earlier'|'later'
export type MobileTimedAction=
  |{kind:'shift';minutes:-30|30}
  |{kind:'day';days:-1|1}
  |{kind:'duration';minutes:30|60|90|120}
export interface MobileTimedRange {
  start:string;end:string;startFold:FoldChoice;endFold:FoldChoice
}
function foldOf(instant:string):FoldChoice{
  const options=localInstantOptions(localDateTime(instant))
  return options.length===2?(options[0]===instant?'earlier':'later'):''
}
function fromInstants(start:string,end:string):MobileTimedRange{
  return {start:localDateTime(start),end:localDateTime(end),
    startFold:foldOf(start),endFold:foldOf(end)}
}
/** Changes only a local editor draft. No source record is read or written here.
 * Duration and +/-30 use physical instants through DST; date changes preserve
 * wall clock time and reject missing or ambiguous target times. */
export function mobileTimedChange(input:MobileTimedRange,action:MobileTimedAction):MobileTimedRange{
  if(action.kind==='day'){
    const shift=(wall:string)=>addDays(wall.slice(0,10),action.days)+wall.slice(10)
    const nextStart=shift(input.start),nextEnd=shift(input.end)
    // Do not silently choose a repeated DST hour on a date shift.
    const range=draftTimedRange(nextStart,nextEnd)
    return fromInstants(range.start,range.end)
  }
  if(action.kind==='duration'){
    const first=resolveLocalInstant(input.start,input.startFold||undefined)
    return fromInstants(first,new Date(Date.parse(first)+action.minutes*60000).toISOString())
  }
  const original=draftTimedRange(input.start,input.end,input.startFold||undefined,input.endFold||undefined)
  return fromInstants(
    new Date(Date.parse(original.start)+action.minutes*60000).toISOString(),
    new Date(Date.parse(original.end)+action.minutes*60000).toISOString())
}
/** For multi-day all-day drafts, shift both inclusive dates as one range. */
export function mobileAllDayShift(start:string,end:string,days:-1|1):{start:string;end:string}{
  if(end<start)throw new Error('All-day last date must follow the first date')
  return {start:addDays(start,days),end:addDays(end,days)}
}
