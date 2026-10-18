import type {LocalDate} from '../types'
import {addDays,day} from './dates'
export type FinderDaySpan=1|7|14
/** Display-only local finder window, not an availability or booking engine.
 * Never silently shift a requested day into the future if it becomes past.
 * The original complete-source findFreeSlots remains sole availability authority. */
export function finderDayWindow(from:LocalDate,days:FinderDaySpan,today:LocalDate):{
  from:LocalDate;through:LocalDate;days:FinderDaySpan
}{
  day(from);day(today)
  if(![1,7,14].includes(days))throw new Error('Invalid finder day range')
  if(from<today)throw new Error('Chosen day is in the past. Select today or a future day.')
  return {from,through:addDays(from,days-1),days}
}
export function advanceFinderDay(from:LocalDate,direction:-1|1,today:LocalDate):LocalDate{
  day(from);day(today)
  const next=addDays(from,direction)
  if(next<today)throw new Error('Cannot search a past day')
  return next
}
