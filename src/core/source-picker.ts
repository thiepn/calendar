/** C33 — pure transformations of existing local display preferences.
 * Never edit source records, UIDs, event availability, or a backup. */
export type SourcePickerAction='show'|'hide'|'only'
export type NamedSource=readonly [name:string,count:number]
export interface SourcePickerPage{
  items:NamedSource[]
  matching:NamedSource[]
  total:number
  shown:number
  hidden:number
  matchingShown:number
  matchingHidden:number
  page:number
  pages:number
  fromIndex:number
  throughIndex:number
  hasPrevious:boolean
  hasNext:boolean
}
export function sourcePickerPage(sources:NamedSource[],hidden:readonly string[],search:string,page:number,pageSize=8):SourcePickerPage{
  if(!Number.isInteger(page)||page<0||!Number.isInteger(pageSize)||pageSize<1||pageSize>20)
    throw new Error('Invalid source-picker page')
  if(search.length>250)throw new Error('Source filter is too long')
  const nameSet=new Set<string>()
  for(const [name,count] of sources){
    if(typeof name!=='string'||!name||name.length>100||nameSet.has(name)||
      !Number.isInteger(count)||count<0)throw new Error('Invalid imported source list')
    nameSet.add(name)
  }
  const hiddenSet=new Set(hidden)
  const q=search.trim().toLocaleLowerCase()
  const matching=sources.filter(([name])=>name.toLocaleLowerCase().includes(q))
  const pages=Math.max(1,Math.ceil(matching.length/pageSize))
  const actualPage=Math.min(page,pages-1)
  const start=actualPage*pageSize
  const items=matching.slice(start,start+pageSize)
  return {items,matching,total:sources.length,
    shown:sources.filter(([name])=>!hiddenSet.has(name)).length,
    hidden:sources.filter(([name])=>hiddenSet.has(name)).length,
    matchingShown:matching.filter(([name])=>!hiddenSet.has(name)).length,
    matchingHidden:matching.filter(([name])=>hiddenSet.has(name)).length,
    page:actualPage,pages,fromIndex:items.length?start+1:0,throughIndex:start+items.length,
    hasPrevious:actualPage>0,hasNext:actualPage+1<pages}
}
/** Show/hide every searched match, or show just searched matches among
 * currently present imports. Preserve hidden choices for unavailable names:
 * they may be source-owned and reimported later. Keep original preference
 * schema limits so no display change can corrupt or discard local settings. */
export function applySourcePicker(
  hidden:readonly string[],allSources:readonly string[],matching:readonly string[],
  action:SourcePickerAction
):string[]{
  if(!['show','hide','only'].includes(action))throw new Error('Invalid source action')
  const all=new Set(allSources),match=new Set(matching),existing=new Set(hidden)
  if(all.size!==allSources.length||match.size!==matching.length||
    [...all,...existing,...match].some(name=>typeof name!=='string'||name.length<1||name.length>100))
    throw new Error('Invalid imported source identity')
  if([...match].some(name=>!all.has(name)))throw new Error('Unknown imported source')
  if(!matching.length)throw new Error('No imported source matches this search')
  const next=new Set(hidden)
  for(const name of all){
    if(action==='only'){
      if(match.has(name))next.delete(name)
      else next.add(name)
    }else if(match.has(name)){
      if(action==='hide')next.add(name)
      else next.delete(name)
    }
  }
  if(next.size>80)throw new Error('Too many hidden imported sources (80 maximum); use a narrower selection')
  return [...next]
}
