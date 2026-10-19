import {useState} from 'react'
import type {IcsSubscription} from '../core/ics-subscriptions'
import {feedHost} from '../core/ics-subscriptions'

interface Props{
  subscriptions:IcsSubscription[]
  error:string
  activeId:string|null
  onAdd:(url:string)=>void
  onCheck:(id:string)=>void
  onCancel:()=>void
  onRemove:(id:string)=>void
}
export function SubscriptionManager({subscriptions,error,activeId,onAdd,onCheck,onCancel,onRemove}:Props){
  const [address,setAddress]=useState('')
  const [consent,setConsent]=useState(false)
  return <section className="subscription-manager" aria-label="ICS subscriptions">
    <h3>ICS subscriptions</h3>
    <form className="subscription-form" onSubmit={event=>{
      event.preventDefault()
      if(!consent)return
      onAdd(address)
    }}>
      <label>HTTPS calendar feed URL
        <input type="url" aria-label="HTTPS calendar feed URL" placeholder="https://calendar.example.org/events.ics"
          value={address} onChange={event=>setAddress(event.target.value)} maxLength={2048}
          autoComplete="off" spellCheck={false} required/>
      </label>
      <label className="checkline"><input aria-label="Allow a manual feed connection" type="checkbox"
        checked={consent} onChange={event=>setConsent(event.target.checked)}/>
        Allow this browser to contact the supplied feed only when I select Check feed.
      </label>
      <p>Feed URLs, including any access tokens in the link, are saved on this device. Do not use shared devices for private feeds. The feed must allow browser CORS requests and cannot redirect. No automatic refresh runs.</p>
      <button type="submit" className="secondary" disabled={!consent||!address.trim()||subscriptions.length>=12}>
        Add subscription
      </button>
    </form>
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="subscription-list">
      {subscriptions.map(item=><div className="subscription-entry" key={item.id}>
        <div className="subscription-entry-info">
          <strong>{item.sourceName??'Not fetched yet'}</strong>
          <span>{feedHost(item.url)}</span>
          <span>State: {item.status==='ready'?'Not checked':item.status==='review'?'Review required':
            item.status==='unchanged'?'Not modified':item.status==='applied'?'Applied manually':'Refresh failed'}</span>
          {item.lastCheckedAt&&<span>Last checked: {new Date(item.lastCheckedAt).toLocaleString()}</span>}
          {item.lastAppliedAt&&<span>Last applied: {new Date(item.lastAppliedAt).toLocaleString()}</span>}
          {item.lastError&&<span role="alert">{item.lastError}</span>}
          {item.history?.length? <details className="subscription-history"><summary>Refresh history ({item.history.length})</summary>
            <ol>{[...item.history].reverse().map((entry,index)=><li key={index}>{new Date(entry.at).toLocaleString()} · {entry.kind}{entry.count!==undefined?' · '+entry.count+' supported':''}</li>)}</ol>
          </details>:null}
        </div>
        <div className="subscription-actions">
          {activeId===item.id?<button type="button" className="secondary" onClick={onCancel}>Cancel request</button>:
            <button type="button" className="secondary" disabled={activeId!==null} onClick={()=>onCheck(item.id)}>Check feed</button>}
          <button type="button" className="danger" disabled={activeId===item.id}
            onClick={()=>onRemove(item.id)}>Unsubscribe</button>
        </div>
      </div>)}
    </div>
    {!subscriptions.length&&<p>No subscribed feeds. Imported ICS files remain available separately.</p>}
  </section>
}
