import type {CalendarState,CalendarRecord} from '../types'
import {validateState} from './storage'

export interface MissingPersonalPreview{
  state:CalendarState
  added:CalendarRecord[]
  existingCount:number
}
/** Only recover absent personal IDs from an explicitly reviewed valid JSON
 * calendar backup. Existing records, imported providers and original IDs are
 * never modified, even if a matching ID contains different content. Validation
 * rejects broken detached exceptions rather than silently unlinking them. */
export function previewMissingPersonal(current:CalendarState,backup:CalendarState):MissingPersonalPreview{
  const saved=validateState(current),candidate=validateState(backup)
  const existingIds=new Set(saved.records.map(r=>r.id))
  const added=candidate.records.filter(r=>r.source==='personal'&&!existingIds.has(r.id))
  if(added.length===0)return {state:saved,added:[],existingCount:saved.records.length}
  const state=validateState({schemaVersion:1,records:[...saved.records,...added]})
  // Preserve references and exact byte-level identities of every existing
  // canonical entry; only append the validated backup's missing personal ones.
  if(state.records.length!==saved.records.length+added.length||
    state.records.some((r,i)=>i<saved.records.length&&r!==saved.records[i]))
    throw new Error('Selective recovery cannot modify existing records')
  return {state,added,existingCount:saved.records.length}
}
