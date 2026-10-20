import {useCallback,useEffect,useState} from 'react'
import {HardDriveDownload,RefreshCcw,ShieldCheck} from 'lucide-react'

interface OfflineReport{
  online:boolean
  worker:'active'|'installing'|'missing'|'unsupported'
  shell:boolean
  persistent:boolean|null
  usage:number|null
  quota:number|null
  error:string
}
const empty:OfflineReport={online:true,worker:'missing',shell:false,persistent:null,usage:null,quota:null,error:''}
const amount=(bytes:number|null)=>bytes===null?'Not available':(bytes/1048576).toFixed(1)+' MB'
/** Read-only diagnostics: do not cache any data or claim a background sync worker. */
export function OfflineReadiness(){
  const [report,setReport]=useState<OfflineReport>(empty)
  const [busy,setBusy]=useState(false)
  const check=useCallback(async()=>{
    setBusy(true)
    const result:OfflineReport={...empty,online:navigator.onLine}
    try{
      if('serviceWorker' in navigator){
        const reg=await navigator.serviceWorker.getRegistration()
        result.worker=reg?.active?'active':reg?.installing||reg?.waiting?'installing':'missing'
      }else result.worker='unsupported'
      if('caches' in window){
        const names=await caches.keys()
        const key=names.find(k=>k.startsWith('thiepn-calendar-shell-'))
        if(key){
          const cache=await caches.open(key)
          result.shell=Boolean(await cache.match('/index.html'))
        }
      }
      if(navigator.storage){
        if(navigator.storage.persisted)result.persistent=await navigator.storage.persisted()
        if(navigator.storage.estimate){
          const estimated=await navigator.storage.estimate()
          result.usage=typeof estimated.usage==='number'?estimated.usage:null
          result.quota=typeof estimated.quota==='number'?estimated.quota:null
        }
      }
    }catch(e){result.error=e instanceof Error?e.message:String(e)}
    setReport(result);setBusy(false)
  },[])
  useEffect(()=>{void check()},[check])
  async function requestPersistence(){
    if(!navigator.storage?.persist){setReport(r=>({...r,error:'Persistent storage requests are not supported by this browser.'}));return}
    try{
      const granted=await navigator.storage.persist()
      await check()
      if(!granted)setReport(r=>({...r,error:'The browser did not grant persistent storage. Export a backup regularly.'}))
    }catch(e){setReport(r=>({...r,error:'Persistence request failed: '+String(e)}))}
  }
  return <section className="offline-readiness" aria-label="Offline and storage readiness">
    <h3><HardDriveDownload size={17}/> Offline & storage</h3>
    <p className="fine-print">Checks this browser only. No calendar or imported data is cached by the offline shell. No background reminders, live provider sync or guaranteed storage retention.</p>
    <dl>
      <div><dt>Connection indication</dt><dd>{report.online?'Browser reports online':'Browser reports offline'}</dd></div>
      <div><dt>Offline app worker</dt><dd>{report.worker==='active'?'Registered and active':report.worker==='installing'?'Installing or waiting':report.worker==='missing'?'Not registered on this origin':'Not supported'}</dd></div>
      <div><dt>Cached app shell</dt><dd>{report.shell?'Cached for offline opening':'Not confirmed cached'}</dd></div>
      <div><dt>Persistent storage</dt><dd>{report.persistent===true?'Granted':report.persistent===false?'Not granted':'Unavailable'}</dd></div>
      <div><dt>Origin storage estimate</dt><dd>{amount(report.usage)} used / {amount(report.quota)} quota (all data on this origin)</dd></div>
    </dl>
    {report.worker==='active'&&report.shell&&<p className="offline-ready"><ShieldCheck size={14}/> Offline shell detected. Offline opening also depends on retained site data; verify before relying on it.</p>}
    {report.error&&<p className="error" role="alert">{report.error}</p>}
    <div className="offline-actions">
      <button type="button" className="secondary small" disabled={busy} onClick={()=>void check()}><RefreshCcw size={14}/> Check readiness</button>
      {report.persistent!==true&&<button type="button" className="secondary small" onClick={()=>void requestPersistence()}>Request persistent storage</button>}
    </div>
  </section>
}
