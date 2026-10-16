import type {CalendarOccurrence,CalendarRecord} from '../types'
import {validateRecord} from './storage'

/** A real standalone personal draft from one imported occurrence. No linked
 * provider identity or recurrence controls are carried into the personal
 * source. Merely prepares a draft: EventEditor and the ordinary guarded owner
 * commit remain responsible for acceptance and persistence. */
export function personalDraftFromImported(item:CalendarOccurrence,id:string,defaultReminder=-1):CalendarRecord{
  if(item.source!=='ics'||!item.sourceCalendar)throw new Error('Only an imported snapshot can become a personal draft')
  if(!id||id.length>160)throw new Error('Invalid new personal event ID')
  if(defaultReminder!==-1&&![0,5,10,15,30,60,120,1440,10080].includes(defaultReminder))
    throw new Error('Invalid personal reminder preference')
  return validateRecord({
    id,title:item.title,description:item.description,location:item.location,
    source:'personal',allDay:item.allDay,start:item.start,end:item.end,
    ...(item.allDay?{startDate:item.startDate,endDateExclusive:item.endDateExclusive}:{}),
    ...(defaultReminder>=0?{reminderMinutes:defaultReminder}:{}),
    updatedAt:new Date().toISOString()
  })
}
