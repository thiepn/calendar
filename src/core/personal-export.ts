import type {CalendarOccurrence,CalendarState,LocalDate} from '../types'
import {day,daysBetween} from './dates'
import {occurrencesBetween} from './occurrences'
import {validateState} from './storage'
import {exportIcs,type PersonalIcsPrivacy} from './ics'

export interface ReviewedPersonalExportOptions{
  from:LocalDate
  through:LocalDate
  privacy:PersonalIcsPrivacy
  includeReminders:boolean
}
export interface ReviewedPersonalExport{
  options:ReviewedPersonalExportOptions
  occurrences:CalendarOccurrence[]
  total:number
  recurringInstances:number
  allDayInstances:number
  timedInstances:number
  reminderInstances:number
  importedExcluded:number
}
/** A user-initiated, finite, original-source-backed export preview.
 * Never confuse an interop snapshot with a complete durable JSON backup. */
export function reviewPersonalExport(state:CalendarState,options:ReviewedPersonalExportOptions):ReviewedPersonalExport{
  day(options.from);day(options.through)
  const span=daysBetween(options.from,options.through)
  if(span<0||span>365)throw new Error('Choose a date range of at most 366 inclusive days')
  if(!['busy','titles','details'].includes(options.privacy))
    throw new Error('Choose a supported export privacy level')
  if(typeof options.includeReminders!=='boolean')
    throw new Error('Invalid alarm preference')
  if(options.includeReminders&&options.privacy!=='details')
    throw new Error('Reminder alarms require full details')
  const original=validateState(state)
  const personal=original.records.filter(record=>record.source==='personal')
  const indexed=new Map(personal.map(record=>[record.id,record]))
  const occurrences=occurrencesBetween(personal,options.from,options.through)
  if(occurrences.length>5000)
    throw new Error('More than 5000 personal occurrences. Narrow the date range.')
  return {
    options,occurrences,total:occurrences.length,
    recurringInstances:occurrences.filter(item=>Boolean(indexed.get(item.recordId)?.repeat)).length,
    allDayInstances:occurrences.filter(item=>item.allDay).length,
    timedInstances:occurrences.filter(item=>!item.allDay).length,
    reminderInstances:occurrences.filter(item=>indexed.get(item.recordId)?.reminderMinutes!==undefined).length,
    importedExcluded:original.records.length-personal.length
  }
}
/** Re-evaluate at download-time; do not write a shadow calendar or export ICS sources. */
export function downloadPersonalExport(state:CalendarState,options:ReviewedPersonalExportOptions):string{
  const reviewed=reviewPersonalExport(state,options)
  if(!reviewed.total)throw new Error('No personal events in this date range')
  const ics=exportIcs(state,options.from,options.through,{
    privacy:options.privacy,includeReminders:options.includeReminders
  })
  if((ics.match(/^BEGIN:VEVENT$/gm)??[]).length!==reviewed.total)
    throw new Error('Personal export count changed during preparation')
  return ics
}
