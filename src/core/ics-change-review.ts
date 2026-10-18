import type {CalendarRecord,CalendarState} from '../types'
import {mergeIcs,type IcsPreview} from './ics'

export type ImportedChangeKind='removed'|'updated'|'added'|'unchanged'
export interface ImportedChange{
  kind:ImportedChangeKind
  original?:CalendarRecord
  incoming?:CalendarRecord
  changedFields:string[]
}
export interface ImportedChangeReview{
  name:string
  mode:'update'|'replace'
  changes:ImportedChange[]
  counts:{added:number;updated:number;unchanged:number;removed:number}
}
const materialFields=['title','description','location','start','end','allDay','startDate','endDateExclusive','transparent'] as const

/** Compare ORIGINAL source identities, not display filters, generated UI keys or
 * sorted calendar positions. Validate via the authoritative merge function so
 * review and eventual commit cannot disagree about duplicates or unsafe replace. */
export function reviewImportedChanges(state:CalendarState,preview:IcsPreview,
  mode:'update'|'replace'):ImportedChangeReview{
  const validated=mergeIcs(state,preview,mode)
  const previous=new Map(state.records.filter(record=>
    record.source==='ics'&&record.sourceCalendar===preview.name)
    .map(record=>[record.sourceKey,record]))
  const incomingKeys=new Set<string>()
  const changes:ImportedChange[]=[]
  for(const incoming of preview.records){
    if(incomingKeys.has(incoming.sourceKey!))throw new Error('Duplicate source recurrence key in review')
    incomingKeys.add(incoming.sourceKey!)
    const original=previous.get(incoming.sourceKey)
    if(!original){changes.push({kind:'added',incoming,changedFields:[]});continue}
    const changedFields=materialFields.filter(field=>original[field]!==incoming[field])
    changes.push({kind:changedFields.length?'updated':'unchanged',original,incoming,changedFields})
  }
  if(mode==='replace')for(const original of previous.values())
    if(!incomingKeys.has(original.sourceKey!))
      changes.push({kind:'removed',original,changedFields:[]})
  const priority:Record<ImportedChangeKind,number>={removed:0,updated:1,added:2,unchanged:3}
  changes.sort((a,b)=>priority[a.kind]-priority[b.kind]||
    (a.original?.start??a.incoming?.start??'').localeCompare(b.original?.start??b.incoming?.start??'')||
    (a.original?.sourceKey??a.incoming?.sourceKey??'').localeCompare(
      b.original?.sourceKey??b.incoming?.sourceKey??''))
  const counts={
    added:changes.filter(c=>c.kind==='added').length,
    updated:changes.filter(c=>c.kind==='updated').length,
    unchanged:changes.filter(c=>c.kind==='unchanged').length,
    removed:changes.filter(c=>c.kind==='removed').length
  }
  if(counts.added!==validated.added||counts.updated!==validated.updated||
    counts.unchanged!==validated.duplicates||counts.removed!==validated.removed)
    throw new Error('Source change review does not match guarded merge outcome')
  return {name:preview.name,mode,changes,counts}
}
function cell(value:string):string{
  const normalized=value.replace(/\r\n?/g,'\n')
  // Neutralize spreadsheet formulas even with leading whitespace or control chars.
  const escaped=/^[\s\u0000-\u001f]*[=+\-@]/.test(normalized)?"'"+normalized:normalized
  return '"'+escaped.replace(/"/g,'""')+'"'
}
function range(record:CalendarRecord|undefined):string{
  if(!record)return ''
  return record.allDay?record.startDate+' through '+record.endDateExclusive+' (exclusive)':
    record.start+' to '+record.end
}
/** User-triggered device-local human review; excludes UID/sourceKey and private
 * personal events. No network transmission or canonical store mutations. */
export function exportImportedChangeCsv(review:ImportedChangeReview):string{
  const header=['Change','Calendar','Before title','After title','Before range','After range',
    'Changed fields']
  const rows=review.changes.map(item=>[
    item.kind,review.name,item.original?.title??'',item.incoming?.title??'',
    range(item.original),range(item.incoming),item.changedFields.join('; ')
  ])
  if(rows.length>6000)throw new Error('Imported change report exceeds safe export limit')
  return [header,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n'
}
