import {Bell,Clock3,X} from 'lucide-react'
import type {ReminderItem} from '../core/reminders'
import type {ReminderSettings} from '../core/reminder-settings'
type Props={
  items:ReminderItem[]
  dismissed:ReminderItem[]
  snoozedKeys:ReadonlySet<string>
  settings:ReminderSettings
  onSettingsChange:(value:ReminderSettings)=>void
  onUndoDismiss:(item:ReminderItem)=>void
  onCancelSnooze:(item:ReminderItem)=>void
  lookBackDays:1|7
  onLookBackChange:(days:1|7)=>void
  onDismissDue:(items:ReminderItem[])=>void
  onClose:()=>void
  onOpen:(item:ReminderItem)=>void
  onDismiss:(item:ReminderItem)=>void
  onSnooze:(item:ReminderItem,minutes:number)=>void
  onEnableNotifications:()=>void
  permission:'unsupported'|'default'|'denied'|'granted'
  foregroundEnabled:boolean
  onDisableNotifications:()=>void
}
export function ReminderCenter({items,dismissed,snoozedKeys,settings,onSettingsChange,onUndoDismiss,onCancelSnooze,lookBackDays,onLookBackChange,onDismissDue,onClose,onOpen,onDismiss,onSnooze,onEnableNotifications,permission,foregroundEnabled,onDisableNotifications}:Props){
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
      <button type="button" onClick={()=>onSnooze(item,5)} aria-label={'Snooze '+item.occurrence.title+' for 5 minutes'}>5m</button>
      <button type="button" onClick={()=>onSnooze(item,15)} aria-label={'Snooze '+item.occurrence.title+' for 15 minutes'}>15m</button>
      <button type="button" onClick={()=>onSnooze(item,60)} aria-label={'Snooze '+item.occurrence.title+' for 1 hour'}>1h</button>
      {snoozedKeys.has(item.key)&&<button type="button" onClick={()=>onCancelSnooze(item)} aria-label={'Cancel snooze '+item.occurrence.title}>Undo snooze</button>}
      <button type="button" onClick={()=>onDismiss(item)} aria-label={'Dismiss '+item.occurrence.title}>Dismiss</button>
    </div>
  </div>
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="reminder-dialog dialog-surface" role="dialog" aria-modal="true" aria-label="Local reminders">
      <header className="editor-head"><div className="heading-inline"><Bell size={19}/><h2>Local reminders</h2></div>
        <button type="button" className="icon-button" aria-label="Close reminders" onClick={onClose}><X size={19}/></button></header>
      <p className="fine-print">Personal-event reminders are calculated from your saved calendar in this browser. This center shows due reminders from the selected last 24 hours or 7 days, and upcoming reminders in the next 14 days; it is not remote scheduling. Dismissals and snoozes stay local. Choose 5 minutes, 15 minutes or 1 hour to snooze; undo a snooze to restore the original due time.</p>
      <div className="reminder-notification-settings">
        <Clock3 size={16}/>
        {permission==='unsupported'?<p>Desktop notifications are unavailable in this browser. The in-app reminder center still works.</p>:
          permission==='denied'?<p>Browser notifications are blocked. Change the browser's site permissions to enable them; the in-app center still works.</p>:
          foregroundEnabled?<><p>Foreground notifications are enabled only while Calendar is open and visible. Closing the page stops alerts.</p>
            <button type="button" className="secondary small" onClick={onDisableNotifications}>Turn off desktop alerts</button></>:
            <><p>Optional desktop alerts only while this tab is open and visible. No background service or push notifications are installed.</p>
              <button type="button" className="secondary small" onClick={onEnableNotifications}>Enable foreground desktop alerts</button></>}
      </div>
      <div className="reminder-local-settings">
        <label>Default reminder on new events
          <select aria-label="Default reminder on new events" value={settings.defaultLead} onChange={e=>onSettingsChange({...settings,defaultLead:Number(e.target.value)})}>
            <option value={-1}>No reminder</option><option value={0}>At event start</option><option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={1440}>1 day</option>
          </select></label>
        <label>Foreground alert quiet hours
          <select aria-label="Foreground alert quiet hours" value={settings.quietHours} onChange={e=>onSettingsChange({...settings,quietHours:e.target.value as ReminderSettings['quietHours']})}>
            <option value="off">Off</option><option value="22-07">22:00–07:00</option><option value="00-08">00:00–08:00</option>
          </select></label>
        <p>Quiet hours suppress only optional foreground desktop notifications on this device; due items stay visible here. Suppressed alerts are not guaranteed to be delivered later.</p>
      </div>
      <div className="reminder-triage">
        <label>Overdue review range
          <select aria-label="Overdue review range" value={lookBackDays} onChange={e=>onLookBackChange(Number(e.target.value) as 1|7)}>
            <option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option>
          </select>
        </label>
        {due.length>1&&<button type="button" className="secondary small" onClick={()=>onDismissDue(due)}>Dismiss {due.length} reviewed due reminders</button>}
      </div>
      <div className="reminder-groups">
        <h3>Due now or overdue <span>{due.length}</span></h3>
        {due.length?due.map(render):<p className="empty-note">No due reminders in the selected review range.</p>}
        <h3>Upcoming <span>{upcoming.length}</span></h3>
        {upcoming.length?upcoming.map(render):<p className="empty-note">No upcoming reminders in the next 14 days. Set a reminder while creating a personal event.</p>}
      </div>
      {dismissed.length>0&&<details className="dismissed-reminders"><summary>Dismissed reminders ({dismissed.length})</summary>
        {dismissed.map(item=><div key={item.key} className="reminder-entry">
          <span className="reminder-visit"><strong>{item.occurrence.title}</strong><small>Dismissed · {time(item.dueAt)}</small></span>
          <button type="button" className="secondary small" onClick={()=>onUndoDismiss(item)} aria-label={'Restore reminder '+item.occurrence.title}>Restore reminder</button>
        </div>)}
      </details>}
      {items.length>=150&&<p className="fine-print">Showing the first 150 reminders only; narrow the date range before relying on this list.</p>}
      <footer className="editor-actions"><button className="secondary" type="button" onClick={onClose}>Close</button></footer>
    </section>
  </div>
}
