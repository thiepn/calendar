import {Bell,Clock3,X} from 'lucide-react'
import type {ReminderItem} from '../core/reminders'
type Props={
  items:ReminderItem[]
  onClose:()=>void
  onOpen:(item:ReminderItem)=>void
  onDismiss:(item:ReminderItem)=>void
  onSnooze:(item:ReminderItem,minutes:number)=>void
  onEnableNotifications:()=>void
  permission:'unsupported'|'default'|'denied'|'granted'
  foregroundEnabled:boolean
  onDisableNotifications:()=>void
}
export function ReminderCenter({items,onClose,onOpen,onDismiss,onSnooze,onEnableNotifications,permission,foregroundEnabled,onDisableNotifications}:Props){
  const due=items.filter(x=>x.status==='due')
  const upcoming=items.filter(x=>x.status==='upcoming')
  const time=(iso:string)=>new Date(iso).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
  const render=(item:ReminderItem)=><div className={'reminder-entry '+(item.status==='due'?'reminder-due':'')} key={item.key}>
    <button type="button" className="reminder-visit" onClick={()=>onOpen(item)}>
      <strong>{item.occurrence.title}</strong>
      <span>{time(item.dueAt)} · {item.status==='due'?'Due':'Upcoming'}</span>
      <small>{item.occurrence.allDay?'All-day':time(item.occurrence.start)} · {item.leadMinutes===0?'At start':item.leadMinutes+' minutes before'}</small>
    </button>
    <div className="reminder-actions">
      <button type="button" onClick={()=>onSnooze(item,15)} aria-label={'Snooze '+item.occurrence.title+' for 15 minutes'}>Snooze 15m</button>
      <button type="button" onClick={()=>onDismiss(item)} aria-label={'Dismiss '+item.occurrence.title}>Dismiss</button>
    </div>
  </div>
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="reminder-dialog dialog-surface" role="dialog" aria-modal="true" aria-label="Local reminders">
      <header className="editor-head"><div className="heading-inline"><Bell size={19}/><h2>Local reminders</h2></div>
        <button type="button" className="icon-button" aria-label="Close reminders" onClick={onClose}><X size={19}/></button></header>
      <p className="fine-print">Personal-event reminders are calculated from your saved calendar in this browser. This center shows due reminders from the last 24 hours and upcoming reminders in the next 14 days; it is not remote scheduling. Dismissals and snoozes stay local.</p>
      <div className="reminder-notification-settings">
        <Clock3 size={16}/>
        {permission==='unsupported'?<p>Desktop notifications are unavailable in this browser. The in-app reminder center still works.</p>:
          permission==='denied'?<p>Browser notifications are blocked. Change the browser's site permissions to enable them; the in-app center still works.</p>:
          foregroundEnabled?<><p>Foreground notifications are enabled only while Calendar is open and visible. Closing the page stops alerts.</p>
            <button type="button" className="secondary small" onClick={onDisableNotifications}>Turn off desktop alerts</button></>:
            <><p>Optional desktop alerts only while this tab is open and visible. No background service or push notifications are installed.</p>
              <button type="button" className="secondary small" onClick={onEnableNotifications}>Enable foreground desktop alerts</button></>}
      </div>
      <div className="reminder-groups">
        <h3>Due now or overdue <span>{due.length}</span></h3>
        {due.length?due.map(render):<p className="empty-note">No due reminders in the past 24 hours.</p>}
        <h3>Upcoming <span>{upcoming.length}</span></h3>
        {upcoming.length?upcoming.map(render):<p className="empty-note">No upcoming reminders in the next 14 days. Set a reminder while creating a personal event.</p>}
      </div>
      {items.length>=150&&<p className="fine-print">Showing the first 150 reminders only; narrow the date range before relying on this list.</p>}
      <footer className="editor-actions"><button className="secondary" type="button" onClick={onClose}>Close</button></footer>
    </section>
  </div>
}
