import type {Frequency} from '../types'

/** Transient comparison of user-editable input, not event storage or a new writer. */
export interface EventEditorFields {
  title:string
  description:string
  location:string
  reminder:number
  allDay:boolean
  start:string
  end:string
  startFold:''|'earlier'|'later'
  endFold:''|'earlier'|'later'
  frequency:'none'|Frequency
  interval:number
  until:string
  weekdays:number[]
}
/** Review horizon and acknowledgement choices are not saved event fields. */
export function changedEditorFields(initial:EventEditorFields,current:EventEditorFields):string[]{
  const changed:string[]=[]
  if(initial.title!==current.title)changed.push('Name')
  if(initial.allDay!==current.allDay||initial.start!==current.start||initial.end!==current.end||
     initial.startFold!==current.startFold||initial.endFold!==current.endFold)changed.push('Date or time')
  if(initial.frequency!==current.frequency||initial.interval!==current.interval||
     initial.until!==current.until||
     [...initial.weekdays].sort((a,b)=>a-b).join(',')!==[...current.weekdays].sort((a,b)=>a-b).join(','))
    changed.push('Repeat settings')
  if(initial.reminder!==current.reminder)changed.push('Reminder')
  if(initial.location!==current.location)changed.push('Location')
  if(initial.description!==current.description)changed.push('Notes')
  return changed
}
