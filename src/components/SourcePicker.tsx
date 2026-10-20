import {useEffect,useMemo,useRef,useState} from 'react'
import {ChevronLeft,ChevronRight,Eye,EyeOff,Search} from 'lucide-react'
import {sourcePickerPage,type NamedSource,type SourcePickerAction} from '../core/source-picker'

type Props={
  sources:NamedSource[]
  hidden:string[]
  onApply:(action:SourcePickerAction,matching:string[])=>void
  onToggle:(name:string)=>void
  onRemove:(name:string)=>void
  onExplore?:(name:string)=>void
  error:string
}
export function SourcePicker({sources,hidden,onApply,onToggle,onRemove,onExplore,error}:Props){
  const [query,setQuery]=useState('')
  const [page,setPage]=useState(0)
  const searchRef=useRef<HTMLInputElement>(null)
  const result=useMemo(()=>sourcePickerPage(sources,hidden,query,page),[sources,hidden,query,page])
  useEffect(()=>{if(page!==result.page)setPage(result.page)},[page,result.page])
  const matches=result.matching.map(([name])=>name)
  const suffix=query.trim()?'matching sources':'imported sources'
  return <section className="source-picker" aria-label="Imported source picker">
    <header className="source-picker-heading">
      <h3>Imported calendar visibility</h3>
      <p>{result.shown} shown · {result.hidden} hidden · {result.total} imported calendars</p>
    </header>
    <label className="source-picker-search"><Search size={16}/>
      <input ref={searchRef} aria-label="Find imported source" type="search" maxLength={250}
        placeholder="Filter calendar name" value={query}
        onChange={e=>{setQuery(e.target.value);setPage(0)}}/>
    </label>
    <p className="source-picker-result" role="status">
      {result.matching.length} {suffix} · {result.matchingShown} shown · {result.matchingHidden} hidden
      {result.matching.length>8?' · browse pages below':''}
    </p>
    <div className="source-picker-batch" aria-label="Change matching imported calendars">
      <button type="button" className="secondary compact" disabled={!matches.length}
        onClick={()=>onApply('show',matches)}><Eye size={15}/> Show matching</button>
      <button type="button" className="secondary compact" disabled={!matches.length}
        onClick={()=>onApply('hide',matches)}><EyeOff size={15}/> Hide matching</button>
      <button type="button" className="secondary compact" disabled={!matches.length||!query.trim()}
        onClick={()=>onApply('only',matches)}>Only matching imports</button>
    </div>
    {error&&<p className="source-picker-error" role="alert">{error}</p>}
    <p className="source-picker-caption">Changes affect only which imported calendars are displayed. Personal events are unchanged. All imported busy appointments still count for Find time, even when hidden.</p>
    <div className="source-picker-list" aria-label="Filtered imported calendars">
      {result.items.map(([name,count])=><div key={name} className="source-card source-visibility-card">
        <strong><span className="source-card-name">{name}</span><span>{count} entries</span></strong>
        <p>ICS snapshot · read-only · {hidden.includes(name)?'hidden from calendar':'shown on calendar'}</p>
        <div className="source-visibility-actions">
          <label><input type="checkbox" aria-label={'Show '+name+' on calendar'}
            checked={!hidden.includes(name)} onChange={()=>onToggle(name)}/> Show on calendar</label>
          {onExplore&&<button type="button" className="secondary" onClick={()=>onExplore(name)}
            aria-label={'Explore original source '+name}>Browse events</button>}
          <button type="button" className="danger small" onClick={()=>onRemove(name)}>Remove local copy</button>
        </div>
      </div>)}
      {!result.matching.length&&<p className="empty-note">No imported calendars match this name. Clear the filter to browse every source.</p>}
    </div>
    {result.pages>1&&<nav className="source-picker-pages" aria-label="Imported source pages">
      <button type="button" className="secondary compact" disabled={!result.hasPrevious}
        onClick={()=>setPage(result.page-1)}><ChevronLeft size={14}/> Previous sources</button>
      <span>Sources {result.fromIndex}–{result.throughIndex} of {result.matching.length} · Page {result.page+1} of {result.pages}</span>
      <button type="button" className="secondary compact" disabled={!result.hasNext}
        onClick={()=>setPage(result.page+1)}>Next sources <ChevronRight size={14}/></button>
    </nav>}
  </section>
}
