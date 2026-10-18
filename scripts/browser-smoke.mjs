import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {setTimeout as sleep} from 'node:timers/promises'
import {readFile} from 'node:fs/promises'
import {chromium} from 'playwright'

const url='http://127.0.0.1:4173'
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],
  {stdio:['ignore','pipe','pipe']})
let browser
let serverLog=''
server.stdout.on('data',b=>serverLog+=String(b))
server.stderr.on('data',b=>serverLog+=String(b))

async function ready(){
  for(let i=0;i<80;i++){
    if(server.exitCode!==null)throw new Error('Preview stopped: '+serverLog)
    try{const response=await fetch(url);if(response.ok)return}catch{}
    await sleep(250)
  }
  throw new Error('Preview unavailable: '+serverLog)
}
async function exerciseDesktop(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.getByRole('region',{name:'Graphical weekly schedule'}).waitFor()
  assert.equal(await page.locator('.timeline-day').count(),7,'Seven visible date columns required')
  await page.locator('.timeline-day').first().locator('.timeline-slot').nth(18).click()
  const editor=page.getByRole('dialog',{name:'New event'})
  await editor.waitFor()
  const start=await editor.locator('input[type="datetime-local"]').first().inputValue()
  assert.match(start,/T09:00$/)
  await editor.getByLabel('Event name').fill('Browser time slot')
  await editor.getByRole('button',{name:'Create event'}).click()
  await page.locator('.timeline-block').filter({hasText:'Browser time slot'}).first().waitFor()
  console.log('BROWSER_DESKTOP_SLOT_CREATE_PASS')
  await page.getByRole('button',{name:'New event'}).click()
  const recurring=page.getByRole('dialog',{name:'New event'})
  await recurring.getByLabel('Event name').fill('Browser recurring')
  await recurring.getByLabel('Repeats').selectOption('weekly')
  await recurring.getByLabel('Save despite these overlaps or recurrence time warnings').check()
  await recurring.getByRole('button',{name:'Create event'}).click()
  assert.ok(await page.locator('.timeline-block.overlap').count()>=2,'Colliding events should occupy separate lanes')
  const named=page.locator('.timeline-block').filter({hasText:'Browser recurring'}).first()
  await named.click()
  await page.getByRole('button',{name:'Edit this and future'}).click()
  await page.getByRole('dialog',{name:'Edit this and future'}).waitFor()
  await page.getByRole('button',{name:'Cancel'}).click()
  await page.locator('.timeline-block').filter({hasText:'Browser recurring'}).first().click()
  page.once('dialog',dialog=>dialog.accept())
  await page.getByRole('button',{name:'End after this date'}).click()
  const records=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')||'{}').records)
  assert.ok(records.some(r=>r.title==='Browser recurring'&&r.repeat?.until),'End-series action must persist a cutoff')
  assert.equal(errors.length,0,'Desktop JS errors: '+errors.join(';'))
  console.log('BROWSER_DESKTOP_OVERLAP_RECURRENCE_PASS')
  await context.close()
}
async function exerciseMobile(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.getByRole('region',{name:'Graphical weekly schedule'}).waitFor()
  const scroller=page.locator('.timeline-scroll')
  const widths=await scroller.evaluate(el=>({scroll:el.scrollWidth,viewport:el.clientWidth}))
  assert.ok(widths.scroll>widths.viewport,'Mobile week must scroll horizontally instead of compressing columns')
  await page.locator('.view-switch button').filter({hasText:'Day'}).click()
  assert.equal(await page.locator('.timeline-day').count(),1)
  await page.locator('.timeline-slot').nth(20).click()
  const editor=page.getByRole('dialog',{name:'New event'})
  await editor.waitFor()
  assert.match(await editor.locator('input[type="datetime-local"]').first().inputValue(),/T10:00$/)
  await editor.getByLabel('Event name').fill('Mobile time slot')
  await editor.getByRole('button',{name:'Create event'}).click()
  await page.locator('.timeline-block').filter({hasText:'Mobile time slot'}).first().waitFor()
  const pageWidth=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}))
  assert.ok(pageWidth.scroll<=pageWidth.width+2,'Unexpected mobile page overflow: '+JSON.stringify(pageWidth))
  assert.equal(errors.length,0,'Mobile JS errors: '+errors.join(';'))
  console.log('BROWSER_MOBILE_SLOT_CREATE_PASS')
  await context.close()
}

async function exerciseGesturesDesktop(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const first=page.locator('.timeline-day').first()
  await first.locator('.timeline-slot').nth(18).click()
  await page.getByRole('dialog',{name:'New event'}).getByLabel('Event name').fill('Pointer base')
  await page.getByRole('dialog',{name:'New event'}).getByRole('button',{name:'Create event'}).click()
  const base=page.locator('.timeline-block').filter({hasText:'Pointer base'}).first()
  await base.waitFor()

  // Create by a genuine mouse press-move-release, not an action-button click.
  const origin=first.locator('.timeline-slot').nth(24)
  await origin.scrollIntoViewIfNeeded()
  const originRect=await origin.boundingBox()
  assert.ok(originRect)
  await page.mouse.move(originRect.x+originRect.width*.5,originRect.y+originRect.height*.5)
  await page.mouse.down()
  await page.mouse.move(originRect.x+originRect.width*.5,originRect.y+originRect.height*.5+64,{steps:8})
  await page.mouse.up()
  const createDialog=page.getByRole('dialog',{name:'New event'})
  await createDialog.waitFor()
  assert.match(await createDialog.locator('input[type="datetime-local"]').first().inputValue(),/T12:00$/)
  assert.match(await createDialog.locator('input[type="datetime-local"]').last().inputValue(),/T13:30$/)
  await createDialog.getByLabel('Event name').fill('Pointer-created duration')
  await createDialog.getByRole('button',{name:'Create event'}).click()
  console.log('BROWSER_DESKTOP_DRAG_CREATE_PASS')

  // Move the existing 09:00 event down by exactly two 30-minute rows.
  await base.scrollIntoViewIfNeeded()
  const baseRect=await base.boundingBox()
  assert.ok(baseRect)
  await page.mouse.move(baseRect.x+Math.min(12,baseRect.width/2),baseRect.y+10)
  await page.mouse.down()
  await page.mouse.move(baseRect.x+Math.min(12,baseRect.width/2),baseRect.y+10+64,{steps:8})
  await page.mouse.up()
  const adjust=page.getByRole('dialog',{name:'Confirm time adjustment'})
  await adjust.waitFor()
  assert.match(await adjust.locator('input[type="datetime-local"]').inputValue(),/T10:00$/)
  await adjust.getByRole('button',{name:'Confirm change'}).click()
  const moved=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records.find(r=>r.title==='Pointer base'))
  assert.equal(await page.evaluate(iso=>new Date(iso).getHours(),moved.start),10)
  console.log('BROWSER_DESKTOP_DRAG_MOVE_PASS')

  // Resize with the dedicated pointer handle; the editor confirms before persisting.
  const handle=page.locator('.timeline-event-frame').filter({hasText:'Pointer base'}).first().locator('.timeline-resize-handle')
  await handle.scrollIntoViewIfNeeded()
  const handleRect=await handle.boundingBox()
  assert.ok(handleRect)
  await page.mouse.move(handleRect.x+handleRect.width/2,handleRect.y+handleRect.height/2)
  await page.mouse.down()
  await page.mouse.move(handleRect.x+handleRect.width/2,handleRect.y+handleRect.height/2+32,{steps:8})
  await page.mouse.up()
  const resize=page.getByRole('dialog',{name:'Confirm time adjustment'})
  await resize.waitFor()
  assert.equal(await resize.locator('input[type="number"]').inputValue(),'90')
  await resize.getByRole('button',{name:'Confirm change'}).click()
  const resized=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records.find(r=>r.title==='Pointer base'))
  assert.equal(Date.parse(resized.end)-Date.parse(resized.start),90*60000)
  console.log('BROWSER_DESKTOP_DRAG_RESIZE_PASS')

  // Keyboard users have real adjustment controls, not just decorative shortcuts.
  const focused=page.locator('.timeline-block').filter({hasText:'Pointer base'}).first()
  await focused.focus()
  await focused.press('Alt+ArrowDown')
  await page.getByRole('dialog',{name:'Confirm time adjustment'}).waitFor()
  await page.getByRole('button',{name:'Cancel',exact:true}).click()
  console.log('BROWSER_DESKTOP_KEYBOARD_ADJUST_PASS')

  // A hidden imported snapshot must still be disclosed when the new time overlaps.
  await page.evaluate(()=>{
    const key='thiepn.calendar.local.v1'
    const state=JSON.parse(localStorage.getItem(key))
    const event=state.records.find(r=>r.title==='Pointer base')
    const start=new Date(event.start);start.setHours(11,30,0,0)
    const end=new Date(start);end.setHours(12,30,0,0)
    state.records.push({...event,id:'ics-collision-check',title:'Hidden imported lecture',source:'ics',sourceCalendar:'Hidden',
      sourceKey:'Hidden|lecture',start:start.toISOString(),end:end.toISOString(),repeat:undefined,excludedDates:undefined,
      recurrenceParentId:undefined,recurrenceDate:undefined})
    localStorage.setItem(key,JSON.stringify(state))
  })
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:/^Personal \d+/}).click()
  await page.locator('.timeline-block').filter({hasText:'Pointer base'}).first().click()
  await page.getByRole('button',{name:'Adjust time & duration'}).click()
  const conflicts=page.getByRole('dialog',{name:'Confirm time adjustment'})
  const value=await conflicts.locator('input[type="datetime-local"]').inputValue()
  await conflicts.locator('input[type="datetime-local"]').fill(value.slice(0,10)+'T11:00')
  await conflicts.getByText('Hidden imported lecture').waitFor()
  assert.equal(await conflicts.getByRole('button',{name:'Confirm change'}).isDisabled(),true)
  await conflicts.getByLabel('Save despite these overlaps').check()
  await conflicts.getByRole('button',{name:'Confirm change'}).click()
  const current=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(current.find(r=>r.id==='ics-collision-check').title,'Hidden imported lecture')
  assert.equal(current.find(r=>r.title==='Pointer base').id,moved.id)
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_DESKTOP_HIDDEN_ICS_COLLISION_PASS')
  await context.close()
}

async function exerciseTouchDragMobile(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.locator('.view-switch button').filter({hasText:'Day'}).click()
  await page.getByLabel('Touch drag mode').check()
  const target=page.locator('.timeline-day .timeline-slot').nth(28)
  await target.scrollIntoViewIfNeeded()
  const rect=await target.boundingBox()
  assert.ok(rect)
  const x=rect.x+rect.width/2,y=rect.y+rect.height/2
  const client=await context.newCDPSession(page)
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})
  for(let step=1;step<=6;step++){
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+step*11}]})
  }
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  const editor=page.getByRole('dialog',{name:'New event'})
  await editor.waitFor()
  assert.match(await editor.locator('input[type="datetime-local"]').first().inputValue(),/T14:00$/)
  await editor.getByLabel('Event name').fill('Touch-dragged plan')
  await editor.getByRole('button',{name:'Create event'}).click()
  await page.locator('.timeline-block').filter({hasText:'Touch-dragged plan'}).waitFor()
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_MOBILE_TOUCH_DRAG_PASS')
  await context.close()
}


async function exerciseC6Desktop(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const allDayCols=page.locator('.timeline-all-day-col')
  await allDayCols.nth(0).locator('.timeline-all-day-create').scrollIntoViewIfNeeded()
  const a=await allDayCols.nth(0).locator('.timeline-all-day-create').boundingBox()
  const b=await allDayCols.nth(2).locator('.timeline-all-day-create').boundingBox()
  assert.ok(a&&b,'Graphical all-day row must expose selectable day columns')
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2)
  await page.mouse.down()
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12})
  await page.mouse.up()
  const editor=page.getByRole('dialog',{name:'New event'})
  await editor.waitFor()
  assert.equal(await editor.getByLabel('All-day event').isChecked(),true)
  const from=await editor.locator('input[type="date"]').first().inputValue()
  const through=await editor.locator('input[type="date"]').nth(1).inputValue()
  const plus=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)
  assert.equal(through,plus(from,2),'Pointer-selected multi-day range should span 3 days')
  await editor.getByLabel('Event name').fill('C6 vacation span')
  await editor.getByRole('button',{name:'Create event'}).click()
  const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records.find(x=>x.title==='C6 vacation span'))
  assert.equal(original.startDate,from)
  assert.equal(original.endDateExclusive,plus(from,3))
  console.log('BROWSER_C6_DESKTOP_ALLDAY_DRAG_CREATE_PASS')

  const moveButton=allDayCols.nth(0).locator('.timeline-all-day-event').filter({hasText:'C6 vacation span'})
  const move=await moveButton.boundingBox()
  const destination=await allDayCols.nth(1).locator('.timeline-all-day-create').boundingBox()
  assert.ok(move&&destination,'All-day move needs source and destination')
  await page.mouse.move(move.x+move.width/2,move.y+move.height/2)
  await page.mouse.down()
  await page.mouse.move(destination.x+destination.width/2,move.y+move.height/2,{steps:12})
  await page.mouse.up()
  const confirm=page.getByRole('dialog',{name:'Confirm all-day adjustment'})
  await confirm.waitFor()
  assert.equal(await confirm.locator('input[type="date"]').first().inputValue(),plus(from,1))
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records[0].startDate)
  assert.equal(before,from,'Drag should not save without explicit confirmation')
  await confirm.getByRole('button',{name:'Confirm all-day change'}).click()
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records.find(x=>x.title==='C6 vacation span'))
  assert.equal(after.id,original.id,'Moving must preserve original canonical record ID')
  assert.equal(after.startDate,plus(from,1))
  assert.equal(after.endDateExclusive,plus(from,4))
  console.log('BROWSER_C6_DESKTOP_ALLDAY_DRAG_MOVE_PASS')

  // Seed a read-only snapshot, hide it with the Personal source filter and check draft review.
  const imported=await page.evaluate(()=>{
    const key='thiepn.calendar.local.v1', state=JSON.parse(localStorage.getItem(key))
    const d=new Date(),local=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')
    const ics={id:'c6-read-only-ics',title:'C6 hidden ICS lecture',description:'',location:'',
      start:new Date(local+'T09:30:00').toISOString(),end:new Date(local+'T10:30:00').toISOString(),
      allDay:false,source:'ics',sourceCalendar:'C6 hidden',sourceKey:'C6 hidden|lecture',updatedAt:new Date().toISOString()}
    state.records.push(ics);localStorage.setItem(key,JSON.stringify(state));return ics
  })
  await page.reload({waitUntil:'networkidle'})
  await page.locator('.source-entry').filter({hasText:'Personal'}).first().click()
  await page.locator('.top-create').click()
  const newEditor=page.getByRole('dialog',{name:'New event'})
  await newEditor.getByLabel('Event name').fill('C6 explicit overlap')
  await newEditor.getByText('C6 hidden ICS lecture').waitFor()
  const reviewText=await newEditor.getByLabel('Calendar conflict review').innerText()
  assert.match(reviewText,/imported, read-only/)
  await newEditor.getByRole('button',{name:'Create event'}).click()
  await newEditor.getByText(/Acknowledge overlapping events/).waitFor()
  await newEditor.getByLabel('Save despite these overlaps or recurrence time warnings').check()
  await newEditor.getByRole('button',{name:'Create event'}).click()
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(saved.find(x=>x.id==='c6-read-only-ics').start,imported.start)
  assert.ok(saved.some(x=>x.title==='C6 explicit overlap'))
  console.log('BROWSER_C6_HIDDEN_SOURCE_DRAFT_CONFIRM_PASS')

  await page.locator('.top-create').click()
  const dst=page.getByRole('dialog',{name:'New event'})
  await dst.getByLabel('Starts').fill('2026-10-25T02:30')
  await dst.getByLabel('Ends').fill('2026-10-25T03:30')
  await dst.getByText(/occurs twice/).waitFor()
  assert.equal(await dst.getByRole('button',{name:'Create event'}).isDisabled(),true)
  await dst.getByRole('button',{name:'Cancel'}).click()
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_C6_EDITOR_DST_GUARD_PASS')
  await context.close()
}

async function exerciseC6Mobile(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.locator('.view-switch button').filter({hasText:'Day'}).click()
  await page.locator('.timeline-all-day-create').first().click()
  const editor=page.getByRole('dialog',{name:'New event'})
  await editor.waitFor()
  assert.equal(await editor.getByLabel('All-day event').isChecked(),true)
  await editor.getByLabel('Event name').fill('Mobile all-day dates')
  await editor.getByRole('button',{name:'Create event'}).click()
  await page.locator('.timeline-all-day-event').filter({hasText:'Mobile all-day dates'}).first().click()
  await page.getByRole('button',{name:'Adjust all-day dates'}).click()
  const dlg=page.getByRole('dialog',{name:'Confirm all-day adjustment'})
  await dlg.waitFor()
  const first=await dlg.locator('input[type="date"]').first().inputValue()
  const last=new Date(Date.parse(first+'T00:00:00Z')+86400000).toISOString().slice(0,10)
  await dlg.getByLabel('Last day (inclusive)').fill(last)
  await dlg.getByRole('button',{name:'Confirm all-day change'}).click()
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records.find(x=>x.title==='Mobile all-day dates'))
  assert.equal(saved.startDate,first)
  assert.equal(saved.endDateExclusive,new Date(Date.parse(last+'T00:00:00Z')+86400000).toISOString().slice(0,10))
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_C6_MOBILE_ALLDAY_DATE_EDIT_PASS')
  await context.close()
}


async function exerciseC7DstAndRange(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  // Friday 16 October 2026 -> the next displayed week includes Sunday 25 October.
  await page.getByRole('button',{name:'Next period'}).click()
  const autumn=page.locator('.timeline-day').nth(6)
  assert.equal(await autumn.locator('.timeline-slot').count(),50,'Autumn Sunday must have 50 physical slots')
  const earlier=autumn.locator('.timeline-slot[aria-label*="at 02:00 UTC+02:00"]')
  const later=autumn.locator('.timeline-slot[aria-label*="at 02:00 UTC+01:00"]')
  assert.equal(await earlier.count(),1)
  assert.equal(await later.count(),1)
  const firstRect=await earlier.boundingBox(),secondRect=await later.boundingBox()
  assert.ok(firstRect&&secondRect&&secondRect.y>firstRect.y,'The repeated hour should occupy distinct vertically ordered rows')
  await later.click()
  const edit=page.getByRole('dialog',{name:'New event'})
  await edit.waitFor()
  assert.equal(await edit.getByLabel('Repeated start hour').inputValue(),'later')
  await edit.getByLabel('Event name').fill('C7 second DST hour')
  await edit.getByRole('button',{name:'Create event'}).click()
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records.find(r=>r.title==='C7 second DST hour'))
  assert.equal(saved.start,'2026-10-25T01:00:00.000Z')
  await page.locator('.timeline-block').filter({hasText:'C7 second DST hour'}).click()
  await page.getByRole('button',{name:'Adjust time & duration'}).click()
  const change=page.getByRole('dialog',{name:'Confirm time adjustment'})
  await change.waitFor()
  assert.equal(await change.getByLabel('Repeated proposed hour').inputValue(),'later')
  await change.getByRole('button',{name:'Cancel',exact:true}).click()
  console.log('BROWSER_C7_DST_SECOND_HOUR_CREATE_AND_ADJUST_PASS')
  await page.locator('.top-create').click()
  const recurring=page.getByRole('dialog',{name:'New event'})
  await recurring.getByLabel('Repeats').selectOption('weekly')
  await recurring.getByLabel('Conflict planning horizon').selectOption('365')
  assert.match(await recurring.getByLabel('Calendar conflict review').innerText(),/first 365 days only/)
  await recurring.getByRole('button',{name:'Cancel'}).click()
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_C7_365_DAY_PLANNING_PASS')
  await context.close()
}
async function exerciseC7AllDayResize(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  // Create Mon–Wed from the accessible editor to seed an editable multi-day span.
  await page.locator('.timeline-all-day-col').first().locator('.timeline-all-day-create').click()
  const editor=page.getByRole('dialog',{name:'New event'})
  const from=await editor.locator('input[type="date"]').first().inputValue()
  const add=(str,n)=>new Date(Date.parse(str+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)
  await editor.getByLabel('Last day (inclusive)').fill(add(from,2))
  await editor.getByLabel('Event name').fill('C7 elastic retreat')
  await editor.getByRole('button',{name:'Create event'}).click()
  const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records.find(r=>r.title==='C7 elastic retreat'))
  // Drag the lower-right all-day resize affordance from Wednesday to Friday.
  const resize=page.locator('.timeline-all-day-col').nth(2).getByRole('button',{name:'Resize all-day C7 elastic retreat'})
  await resize.scrollIntoViewIfNeeded()
  const rect=await resize.boundingBox()
  const target=await page.locator('.timeline-all-day-col').nth(4).locator('.timeline-all-day-create').boundingBox()
  assert.ok(rect&&target)
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2)
  await page.mouse.down()
  await page.mouse.move(target.x+target.width/2,rect.y+rect.height/2,{steps:12})
  await page.mouse.up()
  const dlg=page.getByRole('dialog',{name:'Confirm all-day adjustment'})
  await dlg.waitFor()
  assert.equal(await dlg.getByLabel('Last day (inclusive)').inputValue(),add(from,4))
  await dlg.getByRole('button',{name:'Confirm all-day change'}).click()
  const longer=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records.find(r=>r.title==='C7 elastic retreat'))
  assert.equal(longer.id,original.id)
  assert.equal(longer.endDateExclusive,add(from,5))
  console.log('BROWSER_C7_ALLDAY_POINTER_RESIZE_PASS')
  // Keyboard resize can cross the week edge through repeated Alt+Shift+Right.
  for(let offset=4;offset<7;offset++){
    const button=page.locator('.timeline-all-day-col').nth(offset).locator('.timeline-all-day-event').filter({hasText:'C7 elastic retreat'})
    await button.focus()
    await button.press('Alt+Shift+ArrowRight')
    const adjust=page.getByRole('dialog',{name:'Confirm all-day adjustment'})
    await adjust.waitFor()
    await adjust.getByRole('button',{name:'Confirm all-day change'}).click()
  }
  const boundary=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records.find(r=>r.title==='C7 elastic retreat'))
  assert.equal(boundary.id,original.id)
  assert.equal(boundary.endDateExclusive,add(from,8),'Keyboard should extend an all-day range beyond week boundary')
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_C7_KEYBOARD_WEEK_BOUNDARY_RESIZE_PASS')
  await context.close()
}


async function exerciseC7HeldEdgeScrolling(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage()
  const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.locator('.view-switch button').filter({hasText:'Day'}).click()
  const scroller=page.locator('.timeline-scroll')
  const start=page.locator('.timeline-slot').nth(18)
  await start.scrollIntoViewIfNeeded()
  const first=await start.boundingBox(),bounds=await scroller.boundingBox()
  assert.ok(first&&bounds)
  await page.mouse.move(first.x+first.width*.5,first.y+first.height*.5)
  await page.mouse.down()
  await page.mouse.move(first.x+first.width*.5,bounds.y+bounds.height-7,{steps:8})
  const before=await scroller.evaluate(el=>el.scrollTop)
  await sleep(510)
  const after=await scroller.evaluate(el=>el.scrollTop)
  assert.ok(after>=before+20,'Holding a captured pointer near the bottom edge should auto-scroll without more mouse motion: '+before+' -> '+after)
  await page.mouse.up()
  await page.getByRole('dialog',{name:'New event'}).waitFor()
  await page.getByRole('dialog',{name:'New event'}).getByRole('button',{name:'Cancel'}).click()
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_C7_HELD_EDGE_AUTOSCROLL_PASS')
  await context.close()
}


async function exerciseC8RecoverySearchAndAgenda(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB',acceptDownloads:true})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const create=async(title)=>{
    await page.getByRole('button',{name:'New event'}).click()
    const form=page.getByRole('dialog',{name:'New event'})
    await form.getByLabel('Event name').fill(title)
    const acknowledgement=form.getByLabel('Save despite these overlaps or recurrence time warnings')
    if(await acknowledgement.count())await acknowledgement.check()
    await form.getByRole('button',{name:'Create event'}).click()
    await form.waitFor({state:'hidden'})
  }
  await create('C8 Original')
  await create('C8 Later')
  const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records.find(x=>x.title==='C8 Original'))
  await page.getByRole('button',{name:/Manage sources/}).click()
  const sources=page.getByRole('dialog',{name:'Calendar data management'})
  await sources.getByRole('button',{name:'Review previous-version checkpoint'}).click()
  const preview=page.getByRole('dialog',{name:'Review calendar restoration'})
  await preview.waitFor()
  assert.match(await preview.innerText(),/SAVED NOW[\s\S]*2 records/)
  assert.match(await preview.innerText(),/IN PROPOSED BACKUP[\s\S]*1 record/)
  assert.equal(await preview.getByRole('button',{name:'Restore this version'}).isDisabled(),true)
  await preview.getByLabel(/I understand that restoring replaces/).check()
  await preview.getByRole('button',{name:'Restore this version'}).click()
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(after.length,1)
  assert.equal(after[0].id,original.id)
  console.log('BROWSER_C8_PREVIEWED_RECOVERY_RESTORE_PASS')

  const date=await page.getByLabel('Jump to date').inputValue()
  const future=new Date(Date.parse(date+'T00:00:00Z')+21*86400000).toISOString().slice(0,10)
  await page.getByLabel('Jump to date').fill(future)
  await create('C8 Future Search Match')
  await page.getByLabel('Jump to date').fill(date)
  await page.getByLabel('Search calendar events').fill('Future Search Match')
  const results=page.getByRole('region',{name:'Calendar search results'})
  await results.getByRole('button',{name:/C8 Future Search Match/}).waitFor()
  await results.getByRole('button',{name:/C8 Future Search Match/}).click()
  await page.getByRole('dialog',{name:'Event details'}).waitFor()
  assert.equal(await page.getByLabel('Jump to date').inputValue(),future)
  await page.getByRole('button',{name:'Close event'}).click()
  await page.getByRole('button',{name:'Clear search'}).click()
  await page.getByRole('button',{name:'List'}).click()
  await page.getByLabel('Agenda range').selectOption('30')
  assert.equal(await page.locator('.agenda-row').count(),30)
  await page.getByLabel('Only days with commitments').check()
  assert.ok(await page.locator('.agenda-row').count()<30)
  console.log('BROWSER_C8_GLOBAL_SEARCH_JUMP_AGENDA_PASS')

  const ics='BEGIN:VCALENDAR\nVERSION:2.0\nX-WR-CALNAME:C8 Classroom\nBEGIN:VEVENT\nUID:c8-class-a\nDTSTART:20261109T120000Z\nDTEND:20261109T130000Z\nSUMMARY:C8 ICS Class\nEND:VEVENT\nEND:VCALENDAR'
  await page.locator('input[accept=".ics,text/calendar"]').setInputFiles({name:'classes.ics',mimeType:'text/calendar',buffer:Buffer.from(ics)})
  const importer=page.getByRole('dialog',{name:'ICS import review'})
  await importer.waitFor()
  assert.match(await importer.getByLabel('Import change preview').innerText(),/1 new/)
  await importer.getByRole('button',{name:'Apply reviewed changes'}).click()
  const imported=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(imported.find(x=>x.title==='C8 ICS Class').source,'ics')
  assert.equal(imported.find(x=>x.title==='C8 Original').id,original.id)
  await page.locator('input[accept=".ics,text/calendar"]').setInputFiles({name:'classes.ics',mimeType:'text/calendar',buffer:Buffer.from(ics)})
  const second=page.getByRole('dialog',{name:'ICS import review'})
  await second.waitFor()
  assert.match(await second.getByLabel('Import change preview').innerText(),/1 unchanged/)
  await second.getByRole('button',{name:'Cancel'}).click()
  console.log('BROWSER_C8_ICS_PREVIEW_SOURCE_INTEGRITY_PASS')

  const beforeRestore=await page.evaluate(()=>localStorage.getItem('thiepn.calendar.local.v1'))
  const file={schemaVersion:1,records:[original]}
  await page.locator('input[accept=".json,application/json"]').setInputFiles({name:'earlier.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))})
  const restore=page.getByRole('dialog',{name:'Review calendar restoration'})
  await restore.waitFor()
  assert.equal(await page.evaluate(()=>localStorage.getItem('thiepn.calendar.local.v1')),beforeRestore)
  await restore.getByRole('button',{name:'Cancel'}).click()
  assert.equal(await page.evaluate(()=>localStorage.getItem('thiepn.calendar.local.v1')),beforeRestore)
  console.log('BROWSER_C8_BACKUP_PREVIEW_NONDESTRUCTIVE_CANCEL_PASS')
  assert.equal(errors.length,0,errors.join(';'))
  await context.close()
}
async function exerciseC8MobileNavigation(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.getByRole('button',{name:'List'}).click()
  await page.getByLabel('Agenda range').selectOption('30')
  assert.equal(await page.locator('.agenda-row').count(),30)
  await page.getByLabel('Only days with commitments').check()
  await page.getByText('No commitments in this period').waitFor()
  await page.getByLabel('Only days with commitments').uncheck()
  await page.getByRole('button',{name:'Today'}).click()
  const content=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(content.scroll<=content.width+2,'C8 mobile navigation page overflow: '+JSON.stringify(content))
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_C8_MOBILE_AGENDA_NAVIGATION_PASS')
  await context.close()
}


async function exerciseC8UnreadableOriginalRescue(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const damaged='{"schemaVersion":1,"records":'
  await page.evaluate(value=>localStorage.setItem('thiepn.calendar.local.v1',value),damaged)
  await page.reload({waitUntil:'networkidle'})
  await page.locator('.recovery-danger').waitFor()
  const valid={schemaVersion:1,records:[]}
  await page.locator('input[accept=".json,application/json"]').setInputFiles({
    name:'repair.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(valid))})
  const dialog=page.getByRole('dialog',{name:'Review calendar restoration'})
  await dialog.waitFor()
  assert.match(await dialog.innerText(),/Current record counts unknown/)
  assert.match(await dialog.innerText(),/raw rescue snapshot/)
  await dialog.getByLabel(/I understand that restoring replaces/).check()
  await dialog.getByRole('button',{name:'Restore this version'}).click()
  const data=await page.evaluate(()=>({
    active:localStorage.getItem('thiepn.calendar.local.v1'),
    rescued:localStorage.getItem('thiepn.calendar.raw-rescue.v1')
  }))
  assert.equal(data.rescued,damaged)
  assert.deepEqual(JSON.parse(data.active),valid)
  await page.getByRole('button',{name:/Manage sources/}).click()
  await page.getByRole('dialog',{name:'Calendar data management'})
    .getByRole('button',{name:'Download retained raw rescue snapshot'}).waitFor()
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_C8_CORRUPT_RAW_RESCUE_REPAIR_PASS')
  await context.close()
}


async function exerciseC9RemindersAndIcs(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.getByRole('button',{name:'New event'}).click()
  const editor=page.getByRole('dialog',{name:'New event'})
  const times=await page.evaluate(()=>{
    const fmt=(d)=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes())}
    return [fmt(new Date(Date.now()+10*60000)),fmt(new Date(Date.now()+70*60000))]
  })
  await editor.getByLabel('Starts').fill(times[0])
  await editor.getByLabel('Ends').fill(times[1])
  await editor.getByLabel('Event name').fill('C9 local due alert')
  await editor.getByLabel('Local reminder').selectOption('15')
  await editor.getByRole('button',{name:'Create event'}).click()
  const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records.find(r=>r.title==='C9 local due alert'))
  assert.equal(original.reminderMinutes,15)
  await page.getByRole('button',{name:/Local reminders/}).click()
  const panel=page.getByRole('dialog',{name:'Local reminders'})
  await panel.waitFor()
  assert.match(await panel.innerText(),/C9 local due alert/)
  assert.match(await panel.innerText(),/Due now or overdue/)
  assert.match(await panel.innerText(),/only while Calendar is open|Browser notifications are blocked|Desktop notifications are unavailable/i)
  await panel.getByRole('button',{name:'Snooze C9 local due alert for 15 minutes'}).click()
  assert.match(await panel.innerText(),/Upcoming/)
  const actions=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.reminder-actions.v1')))
  assert.equal(Object.values(actions)[0].kind,'snooze')
  await panel.getByRole('button',{name:'Dismiss C9 local due alert'}).click()
  assert.equal(await panel.getByRole('button',{name:/C9 local due alert/}).count(),0)
  await panel.getByRole('button',{name:'Close',exact:true}).click()
  console.log('BROWSER_C9_REMINDER_DUE_SNOOZE_DISMISS_PASS')

  const recurrence=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:C9 all-day class',
    'BEGIN:VEVENT','UID:holiday-1','SUMMARY:C9 recurrent lecture','DTSTART;VALUE=DATE:20261019',
    'DTEND;VALUE=DATE:20261020','RRULE:FREQ=DAILY;COUNT=4','EXDATE;VALUE=DATE:20261020',
    'END:VEVENT','END:VCALENDAR'].join('\r\n')
  await page.locator('input[accept=".ics,text/calendar"]').setInputFiles({
    name:'recurring.ics',mimeType:'text/calendar',buffer:Buffer.from(recurrence)})
  const importDialog=page.getByRole('dialog',{name:'ICS import review'})
  await importDialog.waitFor()
  assert.match(await importDialog.getByLabel('Import change preview').innerText(),/3 new/)
  assert.match(await importDialog.innerText(),/materialized into 3 read-only instance/)
  await importDialog.getByRole('button',{name:'Apply reviewed changes'}).click()
  const imports=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records.filter(r=>r.source==='ics'))
  assert.equal(imports.length,3)
  assert.ok(imports.every(r=>r.repeat===undefined&&r.reminderMinutes===undefined))
  await page.locator('input[accept=".ics,text/calendar"]').setInputFiles({
    name:'recurring.ics',mimeType:'text/calendar',buffer:Buffer.from(recurrence)})
  const reviewAgain=page.getByRole('dialog',{name:'ICS import review'})
  await reviewAgain.waitFor()
  assert.match(await reviewAgain.getByLabel('Import change preview').innerText(),/3 unchanged/)
  await reviewAgain.getByRole('button',{name:'Cancel'}).click()
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_C9_FINITE_READONLY_ICS_IMPORT_PASS')
  await context.close()
}
async function exerciseC9MobileDuplicate(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.locator('.view-switch button').filter({hasText:'Day'}).click()
  await page.locator('.timeline-slot').nth(18).click()
  const form=page.getByRole('dialog',{name:'New event'})
  await form.getByLabel('Event name').fill('C9 mobile class')
  await form.getByLabel('Local reminder').selectOption('60')
  await form.getByRole('button',{name:'Create event'}).click()
  await page.locator('.timeline-block').filter({hasText:'C9 mobile class'}).first().click()
  const details=page.getByRole('dialog',{name:'Event details'})
  await details.waitFor()
  const from=await details.getByLabel('Move to date').inputValue()
  const next=new Date(Date.parse(from+'T00:00:00Z')+86400000).toISOString().slice(0,10)
  await details.getByLabel('Move to date').fill(next)
  await details.getByRole('button',{name:'Duplicate to selected date'}).click()
  const duplicate=page.getByRole('dialog',{name:'Duplicate event'})
  await duplicate.waitFor()
  assert.equal(await duplicate.getByLabel('Local reminder').inputValue(),'60')
  assert.match(await duplicate.getByLabel('Starts').inputValue(),new RegExp('^'+next))
  await duplicate.getByRole('button',{name:'Create duplicate'}).click()
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(state.length,2)
  const original=state.find(x=>x.title==='C9 mobile class')
  const copy=state.find(x=>x.title==='C9 mobile class copy')
  assert.ok(original&&copy&&original.id!==copy.id)
  assert.equal(copy.reminderMinutes,60)
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_C9_MOBILE_DUPLICATE_REMINDER_PASS')
  await context.close()
}


async function exerciseC10TimezoneImportAndSettings(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:C10 Timetable',
    'BEGIN:VEVENT','UID:c10-utc-clock','SUMMARY:C10 Lab',
    'DTSTART;TZID=Europe/Berlin:20261019T100000','DTEND;TZID=Europe/Berlin:20261019T110000',
    'RRULE:FREQ=WEEKLY;COUNT=3','END:VEVENT','END:VCALENDAR'].join('\r\n')
  await page.locator('input[accept=".ics,text/calendar"]').setInputFiles({name:'lab.ics',mimeType:'text/calendar',buffer:Buffer.from(ics)})
  const review=page.getByRole('dialog',{name:'ICS import review'})
  await review.waitFor()
  assert.match(await review.getByLabel('Import change preview').innerText(),/3 new/)
  await review.getByRole('button',{name:'Apply reviewed changes'}).click()
  const imported=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.deepEqual(imported.map(x=>x.start),[
    '2026-10-19T08:00:00.000Z','2026-10-26T09:00:00.000Z','2026-11-02T09:00:00.000Z'])
  assert.ok(imported.every(x=>x.source==='ics'&&x.repeat===undefined))
  await page.locator('input[accept=".ics,text/calendar"]').setInputFiles({name:'lab.ics',mimeType:'text/calendar',buffer:Buffer.from(ics.replace('SUMMARY:C10 Lab','SUMMARY:C10 Lab updated'))})
  const second=page.getByRole('dialog',{name:'ICS import review'})
  await second.waitFor()
  assert.match(await second.getByLabel('Import change preview').innerText(),/3 updated/)
  await second.getByRole('button',{name:'Apply reviewed changes'}).click()
  const refreshed=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.deepEqual(refreshed.map(x=>x.id),imported.map(x=>x.id))
  console.log('BROWSER_C10_TZID_DST_UID_UPDATE_PASS')

  await page.getByRole('button',{name:/Local reminders/}).click()
  const panel=page.getByRole('dialog',{name:'Local reminders'})
  await panel.getByLabel('Default reminder on new events').selectOption('30')
  await panel.getByLabel('Foreground alert quiet hours').selectOption('22-07')
  await panel.getByRole('button',{name:'Close',exact:true}).click()
  await page.getByRole('button',{name:'New event'}).click()
  const editor=page.getByRole('dialog',{name:'New event'})
  assert.equal(await editor.getByLabel('Local reminder').inputValue(),'30')
  await editor.getByRole('button',{name:'Cancel'}).click()
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:/Local reminders/}).click()
  const reopened=page.getByRole('dialog',{name:'Local reminders'})
  assert.equal(await reopened.getByLabel('Default reminder on new events').inputValue(),'30')
  assert.equal(await reopened.getByLabel('Foreground alert quiet hours').inputValue(),'22-07')
  await reopened.getByRole('button',{name:'Close',exact:true}).click()
  console.log('BROWSER_C10_REMINDER_DEFAULT_QUIET_SETTINGS_PASS')
  assert.equal(errors.length,0,errors.join(';'))
  await context.close()
}
async function exerciseC10ReversibleDismissal(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.getByRole('button',{name:'New event'}).click()
  const editor=page.getByRole('dialog',{name:'New event'})
  const times=await page.evaluate(()=>{
    const fmt=(d)=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes())}
    return [fmt(new Date(Date.now()+10*60000)),fmt(new Date(Date.now()+70*60000))]
  })
  await editor.getByLabel('Starts').fill(times[0]);await editor.getByLabel('Ends').fill(times[1])
  await editor.getByLabel('Event name').fill('C10 undo reminder')
  await editor.getByLabel('Local reminder').selectOption('15')
  await editor.getByRole('button',{name:'Create event'}).click()
  await page.getByRole('button',{name:/Local reminders/}).click()
  const panel=page.getByRole('dialog',{name:'Local reminders'})
  await panel.getByRole('button',{name:'Dismiss C10 undo reminder'}).click()
  await panel.locator('.dismissed-reminders summary').click()
  await panel.getByRole('button',{name:'Restore reminder C10 undo reminder'}).click()
  await panel.getByRole('button',{name:'Dismiss C10 undo reminder'}).waitFor()
  assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('thiepn.calendar.reminder-actions.v1'))).length),0)
  console.log('BROWSER_C10_UNDO_DISMISSED_REMINDER_PASS')
  assert.equal(errors.length,0,errors.join(';'))
  await context.close()
}
async function exerciseC10OfflineShell(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    serviceWorkers:'allow',timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const manifest=await page.evaluate(async()=>{
    const r=await fetch('/manifest.webmanifest')
    return r.json()
  })
  assert.equal(manifest.name,'THIEPN Calendar')
  assert.equal(manifest.display,'standalone')
  const registration=await page.evaluate(async()=>{
    const reg=await Promise.race([navigator.serviceWorker.ready,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('SW registration timeout')),8000))])
    return {scope:reg.scope,active:reg.active?.state}
  })
  assert.match(registration.scope,/127\.0\.0\.1:4173/)
  await page.reload({waitUntil:'networkidle'})
  assert.ok(await page.evaluate(()=>navigator.serviceWorker.controller!==null),'Calendar must be controlled after registration')
  await page.locator('.view-switch button').filter({hasText:'Day'}).click()
  await page.locator('.timeline-slot').nth(18).click()
  const form=page.getByRole('dialog',{name:'New event'})
  await form.getByLabel('Event name').fill('C10 offline personal')
  await form.getByRole('button',{name:'Create event'}).click()
  await page.locator('.timeline-block').filter({hasText:'C10 offline personal'}).waitFor()
  await context.setOffline(true)
  await page.reload({waitUntil:'load'})
  await page.waitForTimeout(800)
  const offlineStatus=await page.evaluate(async()=>({
    body:document.body.innerText.slice(0,180),
    records:JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')||'{"records":[]}').records.map(x=>({title:x.title,start:x.start})),
    weekBlocks:document.querySelectorAll('.timeline-block').length,
    script:Array.from(document.scripts).map(x=>x.src),
    controller:navigator.serviceWorker.controller?.scriptURL,
    caches:await caches.keys()
  }))
  console.log('BROWSER_C10_OFFLINE_DIAGNOSTIC',JSON.stringify(offlineStatus))
  await page.locator('.timeline-block').filter({hasText:'C10 offline personal'}).waitFor()
  const stats=await page.evaluate(async()=>{
    const cache=await caches.keys()
    return {cache,records:JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records.length,
      scope:navigator.serviceWorker.controller?.scriptURL}
  })
  assert.ok(stats.cache.some(x=>x.startsWith('thiepn-calendar-shell-')))
  assert.equal(stats.records,1)
  assert.ok(stats.scope?.endsWith('/sw.js'))
  console.log('BROWSER_C10_MOBILE_OFFLINE_PWA_RELOAD_PASS')
  assert.equal(errors.length,0,errors.join(';'))
  await context.close()
}


async function exerciseC10SourceReplaceSafety(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage()
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const good=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:Department C10',
    'BEGIN:VEVENT','UID:lab-master','SUMMARY:Department tutorial',
    'DTSTART;TZID=Europe/Berlin:20261019T100000',
    'DTEND;TZID=Europe/Berlin:20261019T110000',
    'RRULE:FREQ=WEEKLY;COUNT=3','END:VEVENT','END:VCALENDAR'].join('\r\n')
  const put=async text=>page.locator('input[accept=".ics,text/calendar"]').setInputFiles({
    name:'department.ics',mimeType:'text/calendar',buffer:Buffer.from(text)})
  await put(good)
  const first=page.getByRole('dialog',{name:'ICS import review'})
  await first.waitFor()
  assert.match(await first.getByLabel('Import change preview').innerText(),/3 new/)
  await first.getByRole('button',{name:'Apply reviewed changes'}).click()
  const current=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(current.length,3)
  const bad=good.replace('RRULE:FREQ=WEEKLY;COUNT=3','RRULE:FREQ=WEEKLY')
  await put(bad)
  const review=page.getByRole('dialog',{name:'ICS import review'})
  await review.waitFor()
  await review.locator('input[type="radio"]').nth(1).check()
  await review.getByRole('alert').getByText(/Cannot replace an incomplete ICS snapshot/).waitFor()
  assert.equal(await review.getByRole('button',{name:'Apply reviewed changes'}).isDisabled(),true)
  const still=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.deepEqual(still,current)
  await review.locator('input[type="radio"]').nth(0).check()
  await review.getByRole('button',{name:'Apply reviewed changes'}).click()
  const unchanged=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.deepEqual(unchanged,current)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C10_INCOMPLETE_ICS_REPLACE_BLOCKED_PASS')
  await context.close()
}
async function exerciseC10SnoozeLifecycleAndOfflineReadiness(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage()
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.getByRole('button',{name:'New event'}).click()
  const editor=page.getByRole('dialog',{name:'New event'})
  const times=await page.evaluate(()=>{
    const fmt=d=>{const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes())}
    return [fmt(new Date(Date.now()+10*60000)),fmt(new Date(Date.now()+65*60000))]
  })
  await editor.getByLabel('Starts').fill(times[0])
  await editor.getByLabel('Ends').fill(times[1])
  await editor.getByLabel('Event name').fill('C10 snooze undo event')
  await editor.getByLabel('Local reminder').selectOption('15')
  await editor.getByRole('button',{name:'Create event'}).click()
  const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records[0])
  await page.getByRole('button',{name:/Local reminders/}).click()
  const panel=page.getByRole('dialog',{name:'Local reminders'})
  await panel.getByRole('button',{name:'Snooze C10 snooze undo event for 1 hour'}).click()
  await panel.getByRole('button',{name:'Cancel snooze C10 snooze undo event'}).click()
  const zero=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('thiepn.calendar.reminder-actions.v1'))).length)
  assert.equal(zero,0)
  await panel.getByRole('button',{name:'Snooze C10 snooze undo event for 5 minutes'}).click()
  assert.ok(await panel.getByRole('button',{name:'Cancel snooze C10 snooze undo event'}).count())
  await panel.getByRole('button',{name:'Dismiss C10 snooze undo event'}).click()
  const current=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records[0])
  assert.deepEqual(current,original,'Reminder actions must not mutate canonical personal events')
  await panel.getByRole('button',{name:'Close',exact:true}).click()
  await page.getByRole('button',{name:/Manage sources/}).click()
  const source=page.getByRole('dialog',{name:'Calendar data management'})
  await source.getByRole('region',{name:'Offline and storage readiness'}).waitFor()
  const status=source.getByRole('region',{name:'Offline and storage readiness'})
  assert.match(await status.innerText(),/Offline app worker/)
  assert.match(await status.innerText(),/Origin storage estimate/)
  assert.match(await status.innerText(),/No calendar or imported data is cached/)
  await status.getByRole('button',{name:'Check readiness'}).click()
  await source.getByRole('button',{name:'Close sources'}).click()
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C10_SNOOZE_UNDO_OFFLINE_STATUS_PASS')
  await context.close()
}
async function exerciseC10MobileSavedViewPreferences(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.locator('.view-switch button').filter({hasText:'List'}).click()
  await page.getByLabel('Agenda range').selectOption('30')
  await page.getByLabel('Only days with commitments').check()
  await page.reload({waitUntil:'networkidle'})
  assert.equal(await page.getByLabel('Agenda range').inputValue(),'30')
  assert.equal(await page.getByLabel('Only days with commitments').isChecked(),true)
  assert.equal(await page.locator('.view-switch .active').innerText(),'List')
  const values=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.view-preferences.v1')))
  assert.equal(values.mode,'agenda')
  assert.equal(values.agendaSpan,30)
  assert.equal(values.agendaBusyOnly,true)
  await page.getByRole('button',{name:'Open navigation'}).click()
  await page.getByRole('button',{name:/Manage sources/}).click()
  const dialog=page.getByRole('dialog',{name:'Calendar data management'})
  await dialog.getByRole('button',{name:'Reset display preferences'}).click()
  await dialog.getByRole('button',{name:'Close sources'}).click()
  await page.reload({waitUntil:'networkidle'})
  assert.equal(await page.locator('.view-switch .active').innerText(),'Week')
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C10_MOBILE_VIEW_PREFERENCE_RECOVERY_PASS')
  await context.close()
}


async function exerciseC11SourceAgendaAndCheckpoint(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB',acceptDownloads:true})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:C11 Seminars','BEGIN:VEVENT',
    'UID:c11-rdate','SUMMARY:Seminar','DTSTART;VALUE=DATE:20261102','DTEND;VALUE=DATE:20261103',
    'RDATE;VALUE=DATE:20261105,20261107','END:VEVENT','END:VCALENDAR'].join('\r\n')
  const choose=()=>page.locator('input[accept=".ics,text/calendar"]').setInputFiles({
    name:'c11.ics',mimeType:'text/calendar',buffer:Buffer.from(ics)})
  await choose()
  const review=page.getByRole('dialog',{name:'ICS import review'})
  await review.waitFor()
  assert.match(await review.getByLabel('Import change preview').innerText(),/3 new/)
  await review.getByRole('button',{name:'Apply reviewed changes'}).click()
  await choose()
  const again=page.getByRole('dialog',{name:'ICS import review'})
  await again.waitFor()
  assert.match(await again.getByLabel('Import change preview').innerText(),/3 unchanged/)
  await again.getByRole('button',{name:'Cancel'}).click()
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(state.length,3)
  assert.ok(state.every(x=>x.source==='ics'&&!x.repeat))
  console.log('BROWSER_C11_RDATE_READONLY_UID_REFRESH_PASS')

  await page.getByLabel('Jump to date').fill('2026-11-03')
  await page.getByRole('button',{name:'Next busy day'}).click()
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-11-05')
  await page.getByRole('button',{name:'Previous busy day'}).click()
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-11-02')
  await page.getByLabel('Jump to date').fill('2026-11-05')
  await page.getByRole('button',{name:'New event'}).click()
  const editor=page.getByRole('dialog',{name:'New event'})
  await editor.getByLabel('Event name').fill('C11 private seminar work')
  await editor.getByLabel('Notes').fill('CONFIDENTIAL JOURNAL NOT FOR CSV')
  const acknowledged=editor.getByLabel('Save despite these overlaps or recurrence time warnings')
  if(await acknowledged.count())await acknowledged.check()
  await editor.getByRole('button',{name:'Create event'}).click()
  await editor.waitFor({state:'hidden'})
  const all=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(all.length,4)
  await page.getByRole('button',{name:'List'}).click()
  const csvPending=page.waitForEvent('download')
  await page.getByRole('button',{name:'Download visible agenda CSV'}).click()
  const csvDownload=await csvPending
  assert.match(csvDownload.suggestedFilename(),/\.csv$/)
  const csv=await readFile(await csvDownload.path(),'utf8')
  assert.match(csv,/C11 private seminar work/)
  assert.match(csv,/Imported: C11 Seminars/)
  assert.ok(!csv.includes('CONFIDENTIAL JOURNAL'),'Private event notes must not leak into exported agenda')
  console.log('BROWSER_C11_BUSY_DAY_CSV_SAFE_EXPORT_PASS')
  await page.getByRole('button',{name:/Manage sources/}).click()
  const sourceDialog=page.getByRole('dialog',{name:'Calendar data management'})
  const checkpointPending=page.waitForEvent('download')
  await sourceDialog.getByRole('button',{name:'Export previous-version checkpoint JSON'}).click()
  const file=await checkpointPending
  const backup=JSON.parse(await readFile(await file.path(),'utf8'))
  assert.equal(backup.schemaVersion,1)
  assert.equal(backup.records.length,3)
  assert.equal(backup.records.filter(x=>x.source==='ics').length,3)
  assert.ok(!backup.records.some(x=>x.title==='C11 private seminar work'))
  console.log('BROWSER_C11_PORTABLE_PREVIOUS_VERSION_CHECKPOINT_PASS')
  assert.equal(errors.length,0,errors.join(';'))
  await context.close()
}
async function exerciseC11MobileOverdueTriage(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.evaluate(()=>{
    const now=Date.now(),source=Array.from({length:2},(_,i)=>{
      const start=new Date(now-(4+i)*86400000),end=new Date(start.getTime()+3600000)
      return {id:'c11-overdue-'+i,title:'C11 overdue '+i,description:'',location:'',
        start:start.toISOString(),end:end.toISOString(),allDay:false,source:'personal',
        reminderMinutes:15,updatedAt:new Date().toISOString()}
    })
    localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify({schemaVersion:1,records:source}))
  })
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:/Local reminders/}).click()
  const panel=page.getByRole('dialog',{name:'Local reminders'})
  await panel.waitFor()
  await panel.getByLabel('Overdue review range').selectOption('7')
  await panel.getByRole('button',{name:'Dismiss 2 reviewed due reminders'}).waitFor()
  page.once('dialog',dialog=>void dialog.accept())
  await panel.getByRole('button',{name:'Dismiss 2 reviewed due reminders'}).click()
  const data=await page.evaluate(()=>({
    original:JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records,
    actions:JSON.parse(localStorage.getItem('thiepn.calendar.reminder-actions.v1'))
  }))
  assert.equal(data.original.length,2)
  assert.ok(Object.values(data.actions).every(x=>x.kind==='dismiss'))
  await panel.locator('.dismissed-reminders summary').click()
  await panel.getByRole('button',{name:'Restore reminder C11 overdue 0'}).click()
  const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.reminder-actions.v1')))
  assert.equal(Object.values(restored).length,1)
  const width=await page.evaluate(()=>({screen:innerWidth,document:document.documentElement.scrollWidth}))
  assert.ok(width.document<=width.screen+2,'Mobile overdue panel caused page overflow '+JSON.stringify(width))
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_C11_MOBILE_OVERDUE_BULK_DISMISS_UNDO_PASS')
  await context.close()
}


async function exerciseC12DesktopMonthlyPersonalWorkflow(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:C12 Monthly Source','BEGIN:VEVENT',
    'UID:c12-lastday','SUMMARY:C12 Monthclose',
    'DTSTART;TZID=Europe/Berlin:20260131T100000','DTEND;TZID=Europe/Berlin:20260131T110000',
    'RRULE:FREQ=MONTHLY;COUNT=4;BYMONTHDAY=-1','END:VEVENT','END:VCALENDAR'].join('\r\n')
  const choose=()=>page.locator('input[accept=".ics,text/calendar"]').setInputFiles({
    name:'c12.ics',mimeType:'text/calendar',buffer:Buffer.from(ics)})
  await choose()
  const importer=page.getByRole('dialog',{name:'ICS import review'})
  await importer.waitFor()
  assert.match(await importer.getByLabel('Import change preview').innerText(),/4 new/)
  await importer.getByRole('button',{name:'Apply reviewed changes'}).click()
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.deepEqual(before.map(x=>x.start),[
    '2026-01-31T09:00:00.000Z','2026-02-28T09:00:00.000Z',
    '2026-03-31T08:00:00.000Z','2026-04-30T08:00:00.000Z'])
  console.log('BROWSER_C12_MONTHLY_BYMONTHDAY_TZID_PASS')
  await page.getByLabel('Jump to date').fill('2026-10-01')
  await page.getByLabel('Search calendar events').fill('C12 Monthclose')
  const results=page.getByRole('region',{name:'Calendar search results'})
  await results.getByLabel('Search period').selectOption('backward')
  assert.equal(await results.getByRole('button',{name:/C12 Monthclose/}).count(),4)
  await results.getByRole('button',{name:/C12 Monthclose/}).first().click()
  const details=page.getByRole('dialog',{name:'Event details'})
  await details.waitFor()
  await details.getByRole('button',{name:'Make personal copy'}).click()
  const draft=page.getByRole('dialog',{name:'Duplicate event'})
  await draft.waitFor()
  assert.equal(await draft.getByLabel('Event name').inputValue(),'C12 Monthclose')
  await draft.getByLabel('Event name').fill('C12 Personal study')
  await draft.getByLabel('Local reminder').selectOption('30')
  const acknowledgement=draft.getByLabel('Save despite these overlaps or recurrence time warnings')
  if(await acknowledgement.count())await acknowledgement.check()
  await draft.getByRole('button',{name:'Create duplicate'}).click()
  await draft.waitFor({state:'hidden'})
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(after.length,5)
  assert.deepEqual(after.slice(0,4),before)
  assert.equal(after[4].source,'personal')
  assert.equal(after[4].reminderMinutes,30)
  assert.equal(after[4].sourceKey,undefined)
  await choose()
  const again=page.getByRole('dialog',{name:'ICS import review'})
  await again.waitFor()
  assert.match(await again.getByLabel('Import change preview').innerText(),/4 unchanged/)
  await again.getByRole('button',{name:'Cancel'}).click()
  console.log('BROWSER_C12_HISTORIC_SEARCH_PERSONAL_COPY_UID_REFRESH_PASS')
  await page.getByLabel('Search calendar events').fill('')
  await page.getByRole('button',{name:/Local reminders/}).click()
  const panel=page.getByRole('dialog',{name:'Local reminders'})
  await panel.waitFor()
  assert.equal(await panel.getByLabel('Desktop notification preview privacy').inputValue(),'private')
  await panel.getByLabel('Desktop notification preview privacy').selectOption('details')
  await panel.getByRole('button',{name:'Close',exact:true}).click()
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:/Local reminders/}).click()
  const reopened=page.getByRole('dialog',{name:'Local reminders'})
  assert.equal(await reopened.getByLabel('Desktop notification preview privacy').inputValue(),'details')
  await reopened.getByLabel('Desktop notification preview privacy').selectOption('private')
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_C12_LOCKSCREEN_PREVIEW_OPT_IN_RESTORES_PASS')
  await context.close()
}
async function exerciseC12MobileAdditiveRecovery(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const record=(id,title,source='personal')=>({id,title,description:'',location:'',source,
    ...(source==='ics'?{sourceCalendar:'School',sourceKey:'School|original'}:{}),
    start:'2026-11-04T09:00:00.000Z',end:'2026-11-04T10:00:00.000Z',
    allDay:false,updatedAt:'2026-10-16T00:00:00.000Z'})
  const current=[record('kept','Local latest'),record('readonly','Original School','ics')]
  const backup={schemaVersion:1,records:[record('kept','Old backup value'),
    record('missing','C12 recovered course'),record('external-backup','Other source','ics')]}
  await page.evaluate(records=>localStorage.setItem('thiepn.calendar.local.v1',
    JSON.stringify({schemaVersion:1,records})),current)
  await page.reload({waitUntil:'networkidle'})
  const before=await page.evaluate(()=>localStorage.getItem('thiepn.calendar.local.v1'))
  await page.locator('input[accept=".json,application/json"]').setInputFiles({
    name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))})
  const dialog=page.getByRole('dialog',{name:'Review calendar restoration'})
  await dialog.waitFor()
  const region=dialog.getByRole('region',{name:'Selective personal recovery'})
  await region.waitFor()
  assert.match(await region.innerText(),/1 personal record/)
  assert.ok(await region.getByRole('button',{name:'Recover 1 missing personal record'}).isDisabled())
  assert.equal(await page.evaluate(()=>localStorage.getItem('thiepn.calendar.local.v1')),before)
  await region.getByLabel(/Append only these missing personal records/).check()
  await region.getByRole('button',{name:'Recover 1 missing personal record'}).click()
  await dialog.waitFor({state:'hidden'})
  const actual=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(actual.length,3)
  assert.deepEqual(actual.slice(0,2),current)
  assert.equal(actual[2].id,'missing')
  assert.equal(actual[2].source,'personal')
  assert.ok(!actual.some(x=>x.id==='external-backup'))
  const prior=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.recovery.v1')).state.records)
  assert.deepEqual(prior,current)
  const width=await page.evaluate(()=>({screen:innerWidth,document:document.documentElement.scrollWidth}))
  assert.ok(width.document<=width.screen+2,'C12 mobile recovery overflow '+JSON.stringify(width))
  assert.equal(errors.length,0,errors.join(';'))
  console.log('BROWSER_C12_MOBILE_ADD_MISSING_PERSONAL_BACKUP_PASS')
  await context.close()
}


async function exerciseC13DesktopIcsAndWorkload(){
  const context=await browser.newContext({viewport:{width:1440,height:900},
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const source=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:C13 University',
    'BEGIN:VEVENT','UID:c13-month','SUMMARY:C13 Second Tuesday',
    'DTSTART;TZID=Europe/Berlin:20260113T090000','DURATION:PT90M',
    'RRULE:FREQ=MONTHLY;COUNT=4;BYDAY=2TU','END:VEVENT',
    'BEGIN:VEVENT','UID:c13-retreat','SUMMARY:C13 Retreat',
    'DTSTART;VALUE=DATE:20260114','DURATION:P2D','END:VEVENT','END:VCALENDAR'].join('\r\n')
  const choose=()=>page.locator('input[accept=".ics,text/calendar"]').setInputFiles({
    name:'c13.ics',mimeType:'text/calendar',buffer:Buffer.from(source)})
  await choose()
  const review=page.getByRole('dialog',{name:'ICS import review'})
  await review.waitFor()
  assert.match(await review.getByLabel('Import change preview').innerText(),/5 new/)
  await review.getByRole('button',{name:'Apply reviewed changes'}).click()
  const records=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(records.length,5)
  assert.deepEqual(records.filter(r=>r.title==='C13 Second Tuesday').map(r=>r.start),[
    '2026-01-13T08:00:00.000Z','2026-02-10T08:00:00.000Z',
    '2026-03-10T08:00:00.000Z','2026-04-14T07:00:00.000Z'])
  assert.equal(records.find(r=>r.title==='C13 Retreat').endDateExclusive,'2026-01-16')
  assert.ok(records.every(r=>r.source==='ics'&&!r.repeat))
  await choose()
  const refreshed=page.getByRole('dialog',{name:'ICS import review'})
  await refreshed.waitFor()
  assert.match(await refreshed.getByLabel('Import change preview').innerText(),/5 unchanged/)
  await refreshed.getByRole('button',{name:'Cancel'}).click()
  console.log('BROWSER_C13_ORDINAL_MONTHLY_EXPLICIT_DURATION_SOURCE_IDS_PASS')
  await page.getByLabel('Jump to date').fill('2026-01-13')
  await page.locator('.view-switch button').filter({hasText:'Week'}).click()
  const strip=page.getByRole('region',{name:'Seven-day planning overview'})
  await strip.waitFor()
  const tue=strip.getByRole('button',{name:'Open daily plan 2026-01-13'})
  assert.match(await tue.innerText(),/1 event/)
  assert.match(await tue.innerText(),/1h 30m timed/)
  const wed=strip.getByRole('button',{name:'Open daily plan 2026-01-14'})
  assert.match(await wed.innerText(),/1 all-day/)
  await page.locator('.source-entry').filter({hasText:'Personal'}).click()
  const privateStrip=page.getByRole('region',{name:'Seven-day planning overview'})
  assert.match(await privateStrip.getByRole('button',{name:'Open daily plan 2026-01-13'}).innerText(),/0 events/)
  await page.locator('.source-entry').filter({hasText:'Imported snapshots'}).click()
  await strip.getByRole('button',{name:'Open daily plan 2026-01-14'}).click()
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-01-14')
  assert.match(await page.locator('.inspector').innerText(),/C13 Retreat/)
  const latest=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.deepEqual(latest,records)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C13_SOURCE_FILTERED_SEVEN_DAY_PLAN_AND_DAY_JUMP_PASS')
  await context.close()
}
async function exerciseC13MobileDstPlanningAndStaleReminder(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const cross={id:'c13-midnight',title:'C13 overnight preparation',description:'',location:'',
    source:'personal',allDay:false,start:'2026-03-28T22:30:00.000Z',
    end:'2026-03-29T01:30:00.000Z',updatedAt:'2026-03-28T00:00:00.000Z'}
  await page.evaluate(record=>localStorage.setItem('thiepn.calendar.local.v1',
    JSON.stringify({schemaVersion:1,records:[record]})),cross)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-03-28')
  await page.locator('.view-switch button').filter({hasText:'List'}).click()
  const strip=page.getByRole('region',{name:'Seven-day planning overview'})
  const first=strip.getByRole('button',{name:'Open daily plan 2026-03-28'})
  const second=strip.getByRole('button',{name:'Open daily plan 2026-03-29'})
  assert.match(await first.innerText(),/0h 30m timed/)
  assert.match(await second.innerText(),/2h 30m timed/)
  const geometry=await page.evaluate(()=>({window:innerWidth,document:document.documentElement.scrollWidth}))
  assert.ok(geometry.document<=geometry.window+2,'C13 mobile plan overflow '+JSON.stringify(geometry))
  await second.click()
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-03-29')
  await page.getByRole('button',{name:/Local reminders/}).click()
  const reminders=page.getByRole('dialog',{name:'Local reminders'})
  await reminders.waitFor()
  await reminders.getByRole('button',{name:'Close',exact:true}).click()
  await page.evaluate(()=>{
    const begin=new Date(Date.now()+10*60000).toISOString()
    const end=new Date(Date.now()+70*60000).toISOString()
    const current={schemaVersion:1,records:[{id:'c13-now',title:'C13 due soon',description:'',location:'',
      source:'personal',allDay:false,start:begin,end,reminderMinutes:15,updatedAt:new Date().toISOString()}]}
    localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(current))
  })
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:/Local reminders/}).click()
  const panel=page.getByRole('dialog',{name:'Local reminders'})
  await panel.getByRole('button',{name:'Dismiss C13 due soon'}).waitFor()
  await page.evaluate(()=>{
    const data=JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))
    data.records[0].title='Latest change from other tab'
    localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(data))
  })
  await panel.getByRole('button',{name:'Dismiss C13 due soon'}).click()
  assert.match(await page.locator('.notice').last().innerText(),/Reminder preference not saved/)
  const actions=await page.evaluate(()=>localStorage.getItem('thiepn.calendar.reminder-actions.v1'))
  assert.ok(!actions||JSON.stringify(JSON.parse(actions))==='{}')
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C13_MOBILE_DST_PLAN_AND_STALE_REMINDER_GUARD_PASS')
  await context.close()
}


async function exerciseC14YearlyFinderDesktop(){
  const ctx=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await ctx.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const source=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:C14 Annual',
    'BEGIN:VEVENT','UID:c14-annual','SUMMARY:C14 annual review',
    'DTSTART;VALUE=DATE:20260228','DTEND;VALUE=DATE:20260301',
    'RRULE:FREQ=YEARLY;COUNT=2;BYMONTH=2;BYMONTHDAY=-1',
    'END:VEVENT','END:VCALENDAR'].join('\r\n')
  const choose=()=>page.locator('input[accept=".ics,text/calendar"]').setInputFiles({
    name:'annual.ics',mimeType:'text/calendar',buffer:Buffer.from(source)})
  await choose()
  let review=page.getByRole('dialog',{name:'ICS import review'})
  await review.waitFor()
  assert.match(await review.getByLabel('Import change preview').innerText(),/2 new/)
  await review.getByRole('button',{name:'Apply reviewed changes'}).click()
  const imported=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.deepEqual(imported.map(x=>x.startDate),['2026-02-28','2027-02-28'])
  assert.ok(imported.every(x=>x.source==='ics'&&!x.repeat))
  await choose()
  review=page.getByRole('dialog',{name:'ICS import review'})
  await review.waitFor()
  assert.match(await review.getByLabel('Import change preview').innerText(),/2 unchanged/)
  await review.getByRole('button',{name:'Cancel'}).click()
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records),imported)
  console.log('BROWSER_C14_YEARLY_BYMONTH_ORIGINAL_UID_REFRESH_PASS')

  const date=await page.evaluate(()=>{
    const d=new Date('2031-03-10T12:00:00')
    d.setDate(d.getDate()+(8-d.getDay())%7)
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')
  })
  await page.evaluate(date=>{
    const state=JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))
    state.records.push({id:'c14-imported-blocker',title:'Hidden imported session',
      description:'',location:'',source:'ics',sourceCalendar:'Private ICS',sourceKey:'c14-block',
      start:new Date(date+'T08:00:00').toISOString(),
      end:new Date(date+'T12:00:00').toISOString(),allDay:false,updatedAt:new Date().toISOString()})
    localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state))
  },date)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill(date)
  await page.getByRole('button',{name:'Find time'}).click()
  const finder=page.getByRole('dialog',{name:'Find an available time'})
  await finder.waitFor()
  await finder.getByLabel('Preferred days').selectOption('weekdays')
  await finder.getByLabel('Spacing between commitments').selectOption('0')
  assert.match(await finder.locator('.finder-slot').first().innerText(),/12:00/)
  await finder.getByLabel('Spacing between commitments').selectOption('30')
  assert.match(await finder.locator('.finder-slot').first().innerText(),/12:30/)
  await finder.getByLabel('Preferred days').selectOption('weekends')
  assert.match(await finder.locator('.finder-slot').first().innerText(),/Sat/)
  await finder.getByLabel('Preferred days').selectOption('weekdays')
  await page.evaluate(date=>{
    const state=JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))
    state.records.push({id:'c14-other-tab',title:'Another local event',
      description:'',location:'',source:'personal',
      start:new Date(date+'T12:30:00').toISOString(),
      end:new Date(date+'T13:30:00').toISOString(),allDay:false,updatedAt:new Date().toISOString()})
    localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state))
  },date)
  await finder.locator('.finder-slot').first().click()
  assert.equal(await page.getByRole('dialog',{name:'New event'}).count(),0,
    'A stale finder suggestion must not open a prefilled personal event')
  assert.match(await page.locator('.notice').last().innerText(),/Time proposal not opened/)
  assert.equal(await finder.count(),1)
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)).length,4)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C14_WEEKDAY_WEEKEND_BUFFER_CROSS_TAB_GUARD_PASS')
  await ctx.close()
}
async function exerciseC14MobileFinder(){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await ctx.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2031-03-10')
  await page.getByRole('button',{name:'Find time'}).click()
  const finder=page.getByRole('dialog',{name:'Find an available time'})
  await finder.getByLabel('Preferred days').selectOption('weekdays')
  await finder.getByLabel('Spacing between commitments').selectOption('15')
  assert.ok(await finder.locator('.finder-slot').count()>0)
  const measure=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth}))
  assert.ok(measure.content<=measure.viewport+2,'C14 mobile finder overflow '+JSON.stringify(measure))
  await finder.locator('.finder-slot').first().click()
  const editor=page.getByRole('dialog',{name:'New event'})
  await editor.waitFor()
  assert.equal(await page.evaluate(()=>localStorage.getItem('thiepn.calendar.local.v1')),null,
    'Finding a time must not write source records until explicitly saved')
  await editor.getByRole('button',{name:'Cancel'}).click()
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C14_MOBILE_PREFERENCES_AND_ORIGINAL_DRAFT_PASS')
  await ctx.close()
}

let failed=false
try{
  await ready()
  browser=await chromium.launch({headless:true,args:['--no-sandbox']})
  await exerciseDesktop()
  await exerciseMobile()
  await exerciseGesturesDesktop()
  await exerciseTouchDragMobile()
  await exerciseC6Desktop()
  await exerciseC6Mobile()
  await exerciseC7DstAndRange()
  await exerciseC7AllDayResize()
  await exerciseC7HeldEdgeScrolling()
  await exerciseC8RecoverySearchAndAgenda()
  await exerciseC8MobileNavigation()
  await exerciseC8UnreadableOriginalRescue()
  await exerciseC9RemindersAndIcs()
  await exerciseC9MobileDuplicate()
  await exerciseC10TimezoneImportAndSettings()
  await exerciseC10ReversibleDismissal()
  await exerciseC10OfflineShell()
  await exerciseC10SourceReplaceSafety()
  await exerciseC10SnoozeLifecycleAndOfflineReadiness()
  await exerciseC10MobileSavedViewPreferences()
  await exerciseC11SourceAgendaAndCheckpoint()
  await exerciseC11MobileOverdueTriage()
  await exerciseC12DesktopMonthlyPersonalWorkflow()
  await exerciseC12MobileAdditiveRecovery()
  await exerciseC13DesktopIcsAndWorkload()
  await exerciseC13MobileDstPlanningAndStaleReminder()
  await exerciseC14YearlyFinderDesktop()
  await exerciseC14MobileFinder()
  console.log('CHROMIUM_DESKTOP_MOBILE_PASS')
}catch(error){
  failed=true
  console.error('CHROMIUM_ACCEPTANCE_FAIL',error)
}finally{
  if(browser)await browser.close()
  server.kill('SIGTERM')
}
if(failed)process.exitCode=1
