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
    state.records.push({...event,id:'ics-collision-check',title:'Hidden imported lecture',source:'ics',timeZone:undefined,sourceCalendar:'Hidden',
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
  await page.getByRole('alertdialog',{name:'Discard unsaved changes?'}).getByRole('button',{name:'Discard changes'}).click()
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
  // Anchor this regression to the 2026 transition week instead of current
  // real-world week, which crosses its boundary on Monday 19 October 2026.
  await page.getByLabel('Jump to date').fill('2026-10-18')
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
  await page.getByRole('alertdialog',{name:'Discard unsaved changes?'}).getByRole('button',{name:'Discard changes'}).click()
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


async function exerciseC15OrdinalAnnualAndTwoIndependentSources(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const annual=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:University',
    'BEGIN:VEVENT','UID:annual-thursday','SUMMARY:C15 annual study review',
    'DTSTART;VALUE=DATE:20261126','DTEND;VALUE=DATE:20261127',
    'RRULE:FREQ=YEARLY;COUNT=2;BYMONTH=11;BYDAY=4TH',
    'END:VEVENT','END:VCALENDAR'].join('\r\n')
  const work=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:Work',
    'BEGIN:VEVENT','UID:busy-friday','SUMMARY:C15 hidden imported shift',
    'DTSTART;TZID=Europe/Berlin:20261127T080000',
    'DURATION:PT4H','END:VEVENT','END:VCALENDAR'].join('\r\n')
  async function importOne(data,name,count){
    await page.locator('input[accept=".ics,text/calendar"]').setInputFiles({
      name,mimeType:'text/calendar',buffer:Buffer.from(data)})
    const dialog=page.getByRole('dialog',{name:'ICS import review'})
    await dialog.waitFor()
    assert.match(await dialog.getByLabel('Import change preview').innerText(),new RegExp(count+' new'))
    await dialog.getByRole('button',{name:'Apply reviewed changes'}).click()
  }
  await importOne(annual,'c15-yearly.ics',2)
  await importOne(work,'c15-shift.ics',1)
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.deepEqual(before.records.filter(x=>x.sourceCalendar==='University').map(x=>x.startDate),
    ['2026-11-26','2027-11-25'])
  assert.equal(before.records.length,3)
  await page.getByLabel('Jump to date').fill('2026-11-26')
  await page.locator('.view-switch button').filter({hasText:'Week'}).click()
  const workload=page.getByRole('region',{name:'Seven-day planning overview'})
  assert.match(await workload.getByRole('button',{name:'Open daily plan 2026-11-26'}).innerText(),/1 event/)
  await page.getByRole('button',{name:'Toggle imported calendar University'}).click()
  assert.equal(await page.getByRole('button',{name:'Toggle imported calendar University'}).getAttribute('aria-pressed'),'false')
  assert.match(await workload.getByRole('button',{name:'Open daily plan 2026-11-26'}).innerText(),/0 events/)
  await page.getByLabel('Search calendar events').fill('annual study review')
  const search=page.getByRole('region',{name:'Calendar search results'})
  assert.match(await search.innerText(),/No matching saved events/)
  await page.getByLabel('Search calendar events').fill('')
  await page.getByRole('button',{name:'Toggle imported calendar Work'}).click()
  await page.getByLabel('Jump to date').fill('2026-11-27')
  assert.match(await workload.getByRole('button',{name:'Open daily plan 2026-11-27'}).innerText(),/0 events/)
  await page.getByRole('button',{name:'Find time'}).click()
  const finder=page.getByRole('dialog',{name:'Find an available time'})
  assert.match(await finder.locator('.finder-slot').first().innerText(),/12:00/,
    'Find Time must still count visually hidden imported source commitments')
  await finder.getByRole('button',{name:'Close time finder'}).click()
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.deepEqual(after,before,'Visibility changes must never mutate any original calendar record')
  await page.reload({waitUntil:'networkidle'})
  assert.equal(await page.getByRole('button',{name:'Toggle imported calendar University'}).getAttribute('aria-pressed'),'false')
  assert.equal(await page.getByRole('button',{name:'Toggle imported calendar Work'}).getAttribute('aria-pressed'),'false')
  // The selected date intentionally resets on reload; restore the inspected
  // date before asserting the persisted per-source visibility state.
  await page.getByLabel('Jump to date').fill('2026-11-27')
  assert.match(await page.getByRole('region',{name:'Seven-day planning overview'})
    .getByRole('button',{name:'Open daily plan 2026-11-27'}).innerText(),/0 events/)
  await page.getByRole('button',{name:'Manage sources'}).click()
  const manage=page.getByRole('dialog',{name:'Calendar data management'})
  const uni=manage.getByLabel('Show University on calendar')
  const shift=manage.getByLabel('Show Work on calendar')
  assert.equal(await uni.isChecked(),false)
  assert.equal(await shift.isChecked(),false)
  await uni.check()
  assert.equal(await uni.isChecked(),true)
  assert.equal(await shift.isChecked(),false)
  await shift.check()
  const final=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.deepEqual(final,before)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C15_ORDINAL_YEARLY_DUAL_SOURCE_DISPLAY_PERSISTENCE_AND_FIND_TIME_AUTHORITY_PASS')
  await context.close()
}
async function exerciseC15MobileSourceVisibilityAndAccountBoundaries(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const original={
    schemaVersion:1,records:[
      {id:'mobile-uni',title:'University day',description:'',location:'',allDay:true,
        start:'2026-11-26T00:00:00.000Z',end:'2026-11-27T00:00:00.000Z',
        startDate:'2026-11-26',endDateExclusive:'2026-11-27',
        source:'ics',sourceCalendar:'University',sourceKey:'University|a',updatedAt:'2026-10-18T00:00:00.000Z'},
      {id:'mobile-work',title:'Work event',description:'',location:'',allDay:false,
        start:'2026-11-26T08:00:00.000Z',end:'2026-11-26T09:00:00.000Z',
        source:'ics',sourceCalendar:'Work',sourceKey:'Work|b',updatedAt:'2026-10-18T00:00:00.000Z'}
    ]
  }
  await page.evaluate(state=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state)),original)
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:'Open navigation'}).click()
  const university=page.getByRole('button',{name:'Toggle imported calendar University'})
  await university.click()
  assert.equal(await university.getAttribute('aria-pressed'),'false')
  await page.getByRole('button',{name:'Manage sources'}).click()
  const panel=page.getByRole('dialog',{name:'Calendar data management'})
  const visible=panel.getByLabel('Show University on calendar')
  assert.equal(await visible.isChecked(),false)
  await visible.check()
  assert.equal(await visible.isChecked(),true)
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(size.scroll<=size.width+2,'C15 mobile source controls overflow '+JSON.stringify(size))
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),original)
  await panel.getByRole('button',{name:'Close sources'}).click()
  await page.getByLabel('Jump to date').fill('2026-11-26')
  const result=await page.evaluate(()=>localStorage.getItem('thiepn.calendar.view-preferences.v1'))
  assert.ok(result&&JSON.parse(result).hiddenImportedCalendars.length===0)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C15_MOBILE_SNAPSHOT_TOGGLE_AND_ORIGINAL_DATA_BOUNDARY_PASS')
  await context.close()
}


async function exerciseC16FiniteMonthlySetPosAndSourceClockGuard(){
  const context=await browser.newContext({viewport:{width:1440,height:900},
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const valid=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:C16 Payroll',
    'BEGIN:VEVENT','UID:last-business-day','SUMMARY:C16 final weekday payroll',
    'DTSTART;TZID=Europe/Berlin:20261030T163000',
    'DURATION:PT90M','RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
    'END:VEVENT','END:VCALENDAR'].join('\r\n')
  const choose=async source=>page.locator('input[accept=".ics,text/calendar"]').setInputFiles({
    name:'c16-payroll.ics',mimeType:'text/calendar',buffer:Buffer.from(source)})
  await choose(valid)
  let dialog=page.getByRole('dialog',{name:'ICS import review'})
  await dialog.waitFor()
  assert.match(await dialog.getByLabel('Import change preview').innerText(),/3 new/)
  await dialog.getByRole('button',{name:'Apply reviewed changes'}).click()
  const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(original.length,3)
  assert.deepEqual(original.map(r=>r.start),[
    '2026-10-30T15:30:00.000Z','2026-11-30T15:30:00.000Z',
    '2026-12-31T15:30:00.000Z'])
  assert.ok(original.every(r=>r.source==='ics'&&!r.repeat))
  await choose(valid)
  dialog=page.getByRole('dialog',{name:'ICS import review'})
  await dialog.waitFor()
  assert.match(await dialog.getByLabel('Import change preview').innerText(),/3 unchanged/)
  await dialog.getByRole('button',{name:'Cancel'}).click()
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records),original)
  await page.getByLabel('Jump to date').fill('2026-11-30')
  await page.locator('.view-switch button').filter({hasText:'Day'}).click()
  assert.match(await page.locator('.inspector').innerText(),/C16 final weekday payroll/)
  console.log('BROWSER_C16_SOURCE_TZID_MONTHLY_BYSETPOS_UID_REFRESH_PASS')

  const unsafe=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:C16 Payroll',
    'BEGIN:VEVENT','UID:last-business-day','SUMMARY:Unsafe wrong-zone exclusion',
    'DTSTART;TZID=Europe/Berlin:20261030T163000','DURATION:PT90M',
    'RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
    'EXDATE;TZID=America/New_York:20261130T163000',
    'END:VEVENT','END:VCALENDAR'].join('\r\n')
  await choose(unsafe)
  dialog=page.getByRole('dialog',{name:'ICS import review'})
  await dialog.waitFor()
  assert.match(await dialog.innerText(),/1 source event/)
  assert.match(await dialog.innerText(),/EXDATE.*clock system/)
  await dialog.locator('input[type=radio]').nth(1).check()
  assert.match(await dialog.innerText(),/Import cannot be applied/)
  assert.equal(await dialog.getByRole('button',{name:'Apply reviewed changes'}).isDisabled(),true)
  await dialog.getByRole('button',{name:'Cancel'}).click()
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records),original)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C16_MIXED_SOURCE_CLOCK_INCOMPLETE_REPLACE_GUARD_PASS')
  await context.close()
}
async function exerciseC16MobileMonthlySourceAndNoFalseEventEdits(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,
    hasTouch:true,timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:C16 Mobile Schedule',
    'BEGIN:VEVENT','UID:c16-mobile-payday',
    'SUMMARY:Last workday mobile snapshot','DTSTART;VALUE=DATE:20261030',
    'DURATION:P1D','RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
    'END:VEVENT','END:VCALENDAR'].join('\r\n')
  await page.locator('input[accept=".ics,text/calendar"]').setInputFiles({
    name:'c16-mobile.ics',mimeType:'text/calendar',buffer:Buffer.from(ics)})
  const review=page.getByRole('dialog',{name:'ICS import review'})
  await review.waitFor()
  assert.match(await review.getByLabel('Import change preview').innerText(),/3 new/)
  await review.getByRole('button',{name:'Apply reviewed changes'}).click()
  await page.getByLabel('Jump to date').fill('2026-12-31')
  await page.locator('.view-switch button').filter({hasText:'List'}).click()
  assert.match(await page.locator('.calendar-surface').innerText(),/Last workday mobile snapshot/)
  const pre=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.deepEqual(pre.records.map(r=>r.startDate),['2026-10-30','2026-11-30','2026-12-31'])
  assert.ok(pre.records.every(r=>r.source==='ics'))
  const size=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}))
  assert.ok(size.document<=size.viewport+2,'C16 mobile agenda overflow '+JSON.stringify(size))
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),pre)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C16_MOBILE_BOUND_MONTHLY_AGENDA_NO_SHADOW_WRITES_PASS')
  await context.close()
}


async function exerciseC17ImportChangeReviewAndStructureGuardDesktop(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB',acceptDownloads:true})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const event=(uid,title,start,end)=>[
    'BEGIN:VEVENT','UID:'+uid,'SUMMARY:'+title,'DTSTART:'+start,'DTEND:'+end,'END:VEVENT']
  const source=(events,extra=[])=>['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:C17 Department',
    ...extra,...events.flat(),'END:VCALENDAR'].join('\r\n')
  const originalFile=source([
    event('a','C17 Laboratory','20261109T100000Z','20261109T110000Z'),
    event('b','C17 Consultation','20261110T100000Z','20261110T110000Z'),
    event('c','C17 Unchanged','20261111T100000Z','20261111T110000Z')])
  const updatedFile=source([
    event('a','C17 Laboratory moved','20261109T140000Z','20261109T150000Z'),
    event('c','C17 Unchanged','20261111T100000Z','20261111T110000Z'),
    event('d','C17 New workshop','20261112T100000Z','20261112T110000Z')])
  const put=async value=>page.locator('input[accept=".ics,text/calendar"]').setInputFiles({
    name:'c17-department.ics',mimeType:'text/calendar',buffer:Buffer.from(value)})
  await page.evaluate(()=>{
    const state={schemaVersion:1,records:[{id:'c17-personal',title:'Keep private',
      description:'Original note',location:'',source:'personal',allDay:false,
      start:'2026-11-08T09:00:00.000Z',end:'2026-11-08T10:00:00.000Z',
      updatedAt:'2026-10-18T00:00:00.000Z'}]}
    localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state))
  })
  await page.reload({waitUntil:'networkidle'})
  await put(originalFile)
  let dialog=page.getByRole('dialog',{name:'ICS import review'})
  await dialog.waitFor()
  assert.match(await dialog.getByLabel('Import change preview').innerText(),/3 new/)
  assert.equal(await dialog.getByRole('region',{name:'Imported changes by event'})
    .locator('.change-added').count(),3)
  await dialog.getByRole('button',{name:'Apply reviewed changes'}).click()
  const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(original.length,4)
  await put(updatedFile)
  dialog=page.getByRole('dialog',{name:'ICS import review'})
  await dialog.waitFor()
  let detail=dialog.getByRole('region',{name:'Imported changes by event'})
  assert.equal(await detail.locator('.change-updated').count(),1)
  assert.equal(await detail.locator('.change-added').count(),1)
  assert.equal(await detail.locator('.change-removed').count(),0)
  assert.match(await detail.innerText(),/C17 Laboratory moved/)
  assert.match(await dialog.getByLabel('Import change preview').innerText(),/0 removed/)
  await dialog.locator('input[type="radio"]').nth(1).check()
  detail=dialog.getByRole('region',{name:'Imported changes by event'})
  assert.equal(await detail.locator('.change-removed').count(),1)
  assert.match(await detail.locator('.change-removed').innerText(),/C17 Consultation/)
  assert.match(await dialog.getByLabel('Import change preview').innerText(),/1 removed/)
  const promise=page.waitForEvent('download')
  await detail.getByRole('button',{name:/Download complete change report/}).click()
  const file=await promise
  const csv=await readFile(await file.path(),'utf8')
  assert.match(csv,/removed","C17 Department","C17 Consultation"/)
  assert.match(csv,/updated","C17 Department","C17 Laboratory","C17 Laboratory moved"/)
  assert.ok(!csv.includes('Keep private'),'Export must not include any personal calendar record')
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)).length,4)
  page.once('dialog',message=>message.dismiss())
  await dialog.getByRole('button',{name:'Apply reviewed changes'}).click()
  assert.equal(await dialog.count(),1,'Declined destructive review must retain original snapshot')
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records),original)
  page.once('dialog',message=>message.accept())
  await dialog.getByRole('button',{name:'Apply reviewed changes'}).click()
  await dialog.waitFor({state:'detached'})
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records)
  assert.equal(saved.length,4)
  assert.deepEqual(saved[0],original[0])
  assert.equal(saved.some(x=>x.title==='C17 Consultation'),false)
  assert.equal(saved.find(x=>x.sourceKey==='C17 Department|a|').id,
    original.find(x=>x.sourceKey==='C17 Department|a|').id)
  const truncated=updatedFile.replace('END:VCALENDAR','')
  await put(truncated)
  assert.equal(await page.getByRole('dialog',{name:'ICS import review'}).count(),0)
  assert.match(await page.locator('.notice').last().innerText(),/Incomplete ICS/)
  const cancellation=updatedFile.replace('VERSION:2.0','VERSION:2.0\r\nMETHOD:CANCEL')
  await put(cancellation)
  assert.equal(await page.getByRole('dialog',{name:'ICS import review'}).count(),0)
  assert.match(await page.locator('.notice').last().innerText(),/METHOD/)
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records),saved)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C17_DESKTOP_SOURCE_CHANGE_REVIEW_CSV_EXPLICIT_REMOVAL_AND_INCOMPLETE_FILE_GUARD_PASS')
  await context.close()
}
async function exerciseC17MobileSourceReviewWithoutWrites(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB',acceptDownloads:true})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const current=['BEGIN:VCALENDAR','X-WR-CALNAME:C17 Mobile',
    'BEGIN:VEVENT','UID:one','SUMMARY:Original mobile event','DTSTART;VALUE=DATE:20261126',
    'DURATION:P1D','END:VEVENT','END:VCALENDAR'].join('\r\n')
  const revised=current.replace('Original mobile event','Revised mobile event')
  const put=async text=>page.locator('input[accept=".ics,text/calendar"]').setInputFiles({
    name:'c17-mobile.ics',mimeType:'text/calendar',buffer:Buffer.from(text)})
  await put(current)
  let review=page.getByRole('dialog',{name:'ICS import review'})
  await review.waitFor()
  await review.getByRole('button',{name:'Apply reviewed changes'}).click()
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  await put(revised)
  review=page.getByRole('dialog',{name:'ICS import review'})
  await review.waitFor()
  const changes=review.getByRole('region',{name:'Imported changes by event'})
  assert.equal(await changes.locator('.change-updated').count(),1)
  assert.match(await changes.locator('.change-updated').innerText(),/Revised mobile event/)
  const width=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}))
  assert.ok(width.document<=width.viewport+2,'C17 mobile change preview overflow '+JSON.stringify(width))
  const promise=page.waitForEvent('download')
  await changes.getByRole('button',{name:/Download complete change report/}).click()
  const file=await promise
  assert.match(await readFile(await file.path(),'utf8'),/Revised mobile event/)
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),before)
  await review.getByRole('button',{name:'Cancel'}).click()
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),before)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C17_MOBILE_PREVIEW_DOWNLOAD_CANCEL_NO_ORIGINAL_SOURCE_WRITES_PASS')
  await context.close()
}


async function exerciseC18DesktopReviewedPrivateIcsSharing(){
  const context=await browser.newContext({viewport:{width:1440,height:900},
    timezoneId:'Europe/Berlin',locale:'en-GB',acceptDownloads:true})
  const page=await context.newPage(),errors=[],downloads=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('download',file=>downloads.push(file.suggestedFilename()))
  await page.goto(url,{waitUntil:'networkidle'})
  const original={schemaVersion:1,records:[
    {id:'c18-canonical-private',title:'C18 secret therapy appointment',
      description:'Private journal confidential',location:'Do not share address',
      source:'personal',allDay:false,start:'2026-10-12T08:00:00.000Z',
      end:'2026-10-12T09:00:00.000Z',reminderMinutes:15,
      repeat:{frequency:'daily',interval:1,until:'2026-10-13'},
      updatedAt:'2026-10-10T00:00:00.000Z'},
    {id:'c18-all-day',title:'C18 private two-day retreat',
      description:'Personal only notes',location:'Undisclosed',
      source:'personal',allDay:true,start:'2026-10-14T00:00:00.000Z',
      end:'2026-10-16T00:00:00.000Z',startDate:'2026-10-14',
      endDateExclusive:'2026-10-16',updatedAt:'2026-10-10T00:00:00.000Z'},
    {id:'c18-ics',title:'C18 imported provider secret',description:'Original read only',
      location:'Provider location',source:'ics',sourceCalendar:'External',
      sourceKey:'External|c18-ics',allDay:false,start:'2026-10-12T10:00:00.000Z',
      end:'2026-10-12T11:00:00.000Z',updatedAt:'2026-10-10T00:00:00.000Z'}
  ]}
  await page.evaluate(state=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state)),original)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-10-12')
  await page.getByRole('button',{name:'Export personal events'}).click()
  const modal=page.getByRole('dialog',{name:'Personal ICS export review'})
  await modal.waitFor()
  assert.equal(await modal.getByLabel('ICS export from date').inputValue(),'2026-10-12')
  assert.equal(await modal.getByLabel('ICS export through date').inputValue(),'2026-11-11')
  assert.equal(await modal.getByRole('radio',{name:/Busy only/}).isChecked(),true)
  assert.equal(downloads.length,0,'A reviewed ICS dialog must never auto-export')
  await modal.getByLabel('ICS export through date').fill('2026-10-16')
  const summary=modal.getByRole('region',{name:'Personal ICS export contents'})
  assert.match(await summary.innerText(),/3 personal occurrences/)
  assert.match(await summary.innerText(),/1 imported record excluded/)
  assert.doesNotMatch(await summary.innerText(),/secret therapy appointment/)
  const busyPending=page.waitForEvent('download')
  await modal.getByRole('button',{name:'Download reviewed personal ICS'}).click()
  const busyFile=await busyPending
  const busy=await readFile(await busyFile.path(),'utf8')
  assert.match(busyFile.suggestedFilename(),/thiepn-calendar-personal-2026-10-12-to-2026-10-16\.ics/)
  assert.equal((busy.match(/BEGIN:VEVENT/g)||[]).length,3)
  assert.equal((busy.match(/SUMMARY:Busy/g)||[]).length,3)
  assert.ok(!busy.includes('secret therapy')&&!busy.includes('imported provider')&&
    !busy.includes('Private journal')&&!busy.includes('canonical-private'))
  assert.ok(!busy.includes('BEGIN:VALARM')&&!busy.includes('LOCATION:'))
  assert.match(busy,/DTSTART;VALUE=DATE:20261014/)
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),original)
  console.log('BROWSER_C18_DESKTOP_BUSY_ONLY_REVIEW_AND_SOURCE_PRIVATE_DOWNLOAD_PASS')

  await page.getByRole('button',{name:'Export personal events'}).click()
  const titled=page.getByRole('dialog',{name:'Personal ICS export review'})
  await titled.getByLabel('ICS export through date').fill('2026-10-16')
  await titled.getByRole('radio',{name:/Event titles/}).check()
  const titlesPending=page.waitForEvent('download')
  await titled.getByRole('button',{name:'Download reviewed personal ICS'}).click()
  const titles=await readFile(await (await titlesPending).path(),'utf8')
  assert.match(titles,/SUMMARY:C18 secret therapy appointment/)
  assert.ok(!titles.includes('Private journal')&&!titles.includes('Do not share address')&&
    !titles.includes('BEGIN:VALARM')&&!titles.includes('imported provider'))
  assert.ok(titles.includes('c18-canonical-private@2026-10-12@calendar.thiepn.local'))
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),original)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C18_DESKTOP_TITLE_ONLY_WITHOUT_PRIVATE_NOTES_PASS')
  await context.close()
}
async function exerciseC18MobileFullExportAndStaleGuard(){
  const context=await browser.newContext({viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin',locale:'en-GB',acceptDownloads:true})
  const page=await context.newPage(),errors=[],downloads=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('download',file=>downloads.push(file.suggestedFilename()))
  await page.goto(url,{waitUntil:'networkidle'})
  const original={schemaVersion:1,records:[
    {id:'c18-mobile-secret',title:'Mobile original note',
      description:'Unshared medical history',location:'Private room',
      source:'personal',allDay:false,start:'2026-10-12T08:00:00.000Z',
      end:'2026-10-12T09:00:00.000Z',reminderMinutes:15,
      updatedAt:'2026-10-10T00:00:00.000Z'},
    {id:'c18-mobile-ics',title:'No provider export',description:'External source',
      location:'Imported',source:'ics',sourceCalendar:'Provider',
      sourceKey:'Provider|mobile',allDay:false,start:'2026-10-12T12:00:00.000Z',
      end:'2026-10-12T13:00:00.000Z',updatedAt:'2026-10-10T00:00:00.000Z'}
  ]}
  await page.evaluate(state=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state)),original)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-10-12')
  await page.getByRole('button',{name:'Export personal events'}).click()
  const modal=page.getByRole('dialog',{name:'Personal ICS export review'})
  await modal.getByLabel('ICS export through date').fill('2028-10-19')
  assert.match(await modal.getByRole('alert').innerText(),/366 inclusive days/)
  assert.equal(await modal.getByRole('button',{name:'Download reviewed personal ICS'}).isDisabled(),true)
  await modal.getByLabel('ICS export through date').fill('2026-10-12')
  await modal.getByRole('radio',{name:/Full event details/}).check()
  const alarms=modal.getByLabel('Include reminder alarms in ICS')
  assert.equal(await alarms.isChecked(),false)
  await alarms.check()
  const geometry=await page.evaluate(()=>({visible:innerWidth,content:document.documentElement.scrollWidth}))
  assert.ok(geometry.content<=geometry.visible+2,'C18 mobile personal export overflow '+JSON.stringify(geometry))
  const pending=page.waitForEvent('download')
  await modal.getByRole('button',{name:'Download reviewed personal ICS'}).click()
  const ics=await readFile(await (await pending).path(),'utf8')
  assert.match(ics,/SUMMARY:Mobile original note/)
  assert.match(ics,/DESCRIPTION:Unshared medical history/)
  assert.match(ics,/LOCATION:Private room/)
  assert.match(ics,/TRIGGER:-PT15M/)
  assert.ok(!ics.includes('No provider export')&&!ics.includes('External source'))
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),original)
  console.log('BROWSER_C18_MOBILE_FULL_OPT_IN_ALARM_AND_NO_PROVIDER_LEAK_PASS')

  await page.getByRole('button',{name:'Export personal events'}).click()
  const stale=page.getByRole('dialog',{name:'Personal ICS export review'})
  await stale.getByLabel('ICS export through date').fill('2026-10-12')
  const recorded=downloads.length
  await page.evaluate(()=>{
    const state=JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))
    state.records[0].title='Other tab edited this event'
    localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state))
  })
  await stale.getByRole('button',{name:'Download reviewed personal ICS'}).click()
  assert.match(await page.locator('.notice').last().innerText(),/Personal ICS export failed/)
  assert.equal(downloads.length,recorded,'Stale snapshot must not download after a concurrent change')
  assert.equal(await stale.count(),1)
  await stale.getByRole('button',{name:'Cancel'}).click()
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C18_MOBILE_STALE_CALENDAR_EXPORT_REFUSED_PASS')
  await context.close()
}


async function exerciseC19ExactSnoozeDesktopAndOldSource(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const state=await page.evaluate(()=>{
    const start=new Date(Date.now()+10*60000)
    const personal={id:'c19-current',title:'C19 reviewed personal reminder',
      description:'Original private note',location:'Home',source:'personal',allDay:false,
      start:start.toISOString(),end:new Date(start.getTime()+3600000).toISOString(),
      reminderMinutes:15,updatedAt:new Date().toISOString()}
    const result={schemaVersion:1,records:[personal]}
    localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(result))
    return result
  })
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:/Local reminders/}).click()
  const panel=page.getByRole('dialog',{name:'Local reminders'})
  await panel.getByRole('button',{name:'Choose snooze time for C19 reviewed personal reminder'}).click()
  const picker=panel.getByRole('group',{name:'Custom snooze for C19 reviewed personal reminder'})
  const requested=await page.evaluate(()=>{
    const d=new Date(Date.now()+50*60000),pad=n=>String(n).padStart(2,'0')
    return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-')+
      'T'+[pad(d.getHours()),pad(d.getMinutes())].join(':')
  })
  await picker.getByLabel('Snooze until date and time for C19 reviewed personal reminder').fill(requested)
  await picker.getByRole('button',{name:'Save snooze time'}).click()
  const actions=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.reminder-actions.v1')))
  assert.equal(Object.keys(actions).length,1)
  assert.equal(Object.values(actions)[0].kind,'snooze')
  assert.equal(Object.values(actions)[0].until,await page.evaluate(wall=>new Date(wall).toISOString(),requested))
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),state)
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:/Local reminders/}).click()
  const reopened=page.getByRole('dialog',{name:'Local reminders'})
  await reopened.getByRole('button',{name:'Cancel snooze C19 reviewed personal reminder'}).click()
  assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('thiepn.calendar.reminder-actions.v1'))).length),0)
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),state)
  console.log('BROWSER_C19_DESKTOP_EXACT_SNOOZE_RELOAD_CANCEL_ORIGINAL_PRESERVED_PASS')

  // Date-window eviction: original source event was 12 days ago. A current,
  // explicitly snoozed due time must still be available to undo/review.
  await page.evaluate(()=>{
    const start=new Date(Date.now()-12*86400000)
    const pad=n=>String(n).padStart(2,'0')
    const date=[start.getFullYear(),pad(start.getMonth()+1),pad(start.getDate())].join('-')
    const event={id:'older|source',title:'C19 older snoozed reminder',
      description:'Old original',location:'Local',source:'personal',allDay:false,
      start:start.toISOString(),end:new Date(start.getTime()+3600000).toISOString(),
      reminderMinutes:15,updatedAt:new Date().toISOString()}
    const imported={...event,id:'ics-old',source:'ics',sourceCalendar:'Read only',
      sourceKey:'Read only|old',title:'External not reminded',reminderMinutes:undefined}
    const key=[event.id,date,event.start,15].join('|')
    localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify({schemaVersion:1,records:[event,imported]}))
    localStorage.setItem('thiepn.calendar.reminder-actions.v1',JSON.stringify({
      [key]:{kind:'snooze',until:new Date(Date.now()+60*60000).toISOString()}
    }))
  })
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:/Local reminders/}).click()
  const older=page.getByRole('dialog',{name:'Local reminders'})
  await older.getByRole('button',{name:'Cancel snooze C19 older snoozed reminder'}).waitFor()
  assert.doesNotMatch(await older.innerText(),/External not reminded/)
  await older.getByRole('button',{name:'Cancel snooze C19 older snoozed reminder'}).click()
  assert.equal(await older.getByRole('button',{name:'Choose snooze time for C19 older snoozed reminder'}).count(),0)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C19_OLDER_SOURCE_SNOOZE_STAYS_ACTIONABLE_AFTER_DATE_WINDOW_PASS')
  await context.close()
}
async function exerciseC19MobileCustomSnoozeStaleSourceGuard(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.evaluate(()=>{
    const start=new Date(Date.now()+10*60000)
    const state={schemaVersion:1,records:[{id:'c19-mobile',title:'C19 mobile custom reminder',
      description:'Private mobile notes',location:'Private',source:'personal',allDay:false,
      start:start.toISOString(),end:new Date(start.getTime()+3600000).toISOString(),
      reminderMinutes:15,updatedAt:new Date().toISOString()}]}
    localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state))
  })
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:/Local reminders/}).click()
  const panel=page.getByRole('dialog',{name:'Local reminders'})
  await panel.getByRole('button',{name:'Choose snooze time for C19 mobile custom reminder'}).click()
  const picker=panel.getByRole('group',{name:'Custom snooze for C19 mobile custom reminder'})
  const requested=await page.evaluate(()=>{
    const d=new Date(Date.now()+55*60000),pad=n=>String(n).padStart(2,'0')
    return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-')+
      'T'+[pad(d.getHours()),pad(d.getMinutes())].join(':')
  })
  await picker.getByLabel('Snooze until date and time for C19 mobile custom reminder').fill(requested)
  const geo=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(geo.scroll<=geo.width+2,'C19 mobile snooze overflow '+JSON.stringify(geo))
  await page.evaluate(()=>{
    const state=JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))
    state.records[0].title='Edited in another tab'
    localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state))
  })
  await picker.getByRole('button',{name:'Save snooze time'}).click()
  assert.match(await page.locator('.notice').last().innerText(),/Reminder preference not saved/)
  assert.equal(await page.evaluate(()=>localStorage.getItem('thiepn.calendar.reminder-actions.v1')),null)
  assert.equal(await picker.count(),1)
  await picker.getByRole('button',{name:'Cancel custom snooze'}).click()
  assert.equal(await picker.count(),0)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C19_MOBILE_CUSTOM_SNOOZE_STALE_TAB_AND_TOUCH_PASS')
  await context.close()
}


async function exerciseC20DesktopSafeAlternativesAndActualSave(){
  const context=await browser.newContext({viewport:{width:1440,height:900},
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const original={schemaVersion:1,records:[
    {id:'c20-moving-original',title:'C20 personal appointment',
      source:'personal',description:'Keep personal notes',location:'Personal room',
      allDay:false,start:'2026-11-04T08:00:00.000Z',end:'2026-11-04T09:00:00.000Z',
      updatedAt:'2026-10-18T00:00:00.000Z'},
    {id:'c20-hidden-provider',title:'C20 hidden provider collision',
      source:'ics',sourceCalendar:'Hidden University',
      sourceKey:'Hidden University|c20',description:'Provider-owned notes',location:'Lecture room',
      allDay:false,start:'2026-11-04T10:00:00.000Z',end:'2026-11-04T11:00:00.000Z',
      updatedAt:'2026-10-18T00:00:00.000Z'},
    {id:'c20-other-personal',title:'C20 other personal commitment',
      source:'personal',description:'Keep separate',location:'Different address',
      allDay:false,start:'2026-11-04T12:00:00.000Z',end:'2026-11-04T13:00:00.000Z',
      updatedAt:'2026-10-18T00:00:00.000Z'}
  ]}
  await page.evaluate(state=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state)),original)
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:'Toggle imported calendar Hidden University'}).click()
  assert.equal(await page.getByRole('button',{name:'Toggle imported calendar Hidden University'}).getAttribute('aria-pressed'),'false')
  await page.getByLabel('Jump to date').fill('2026-11-04')
  await page.locator('.timeline-block').filter({hasText:'C20 personal appointment'}).first().click()
  await page.getByRole('button',{name:'Adjust time & duration'}).click()
  const dlg=page.getByRole('dialog',{name:'Confirm time adjustment'})
  await dlg.locator('input[type="datetime-local"]').fill('2026-11-04T11:00')
  await dlg.getByText('C20 hidden provider collision').waitFor()
  assert.equal(await dlg.getByRole('button',{name:'Confirm change'}).isDisabled(),true)
  assert.equal(await dlg.getByRole('button',{name:'Find conflict-free alternatives'}).count(),1)
  await dlg.getByRole('button',{name:'Find conflict-free alternatives'}).click()
  await dlg.getByLabel('Alternative search days').selectOption('1')
  await dlg.getByLabel('Alternative spacing').selectOption('15')
  const slots=dlg.locator('.adjust-alternative-list button')
  assert.ok(await slots.count()>0,'Need real alternatives after hidden source blocks proposed move')
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.deepEqual(before,original,'Simply opening suggestions must not mutate original calendar')
  const chosen=await slots.first().getAttribute('aria-label')
  assert.match(chosen,/Use alternative 2026-11-04/)
  await slots.first().click()
  assert.equal(await dlg.getByRole('button',{name:'Confirm change'}).isDisabled(),false)
  assert.equal(await dlg.locator('.adjust-conflicts').count(),0)
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records[0].start),
    original.records[0].start,'Selecting an alternative must not save event prematurely')
  await dlg.getByRole('button',{name:'Confirm change'}).click()
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.equal(saved.records.length,3)
  assert.equal(saved.records[0].id,original.records[0].id)
  assert.notEqual(saved.records[0].start,original.records[0].start)
  assert.notEqual(saved.records[0].start,original.records[1].start)
  assert.deepEqual(saved.records.slice(1),original.records.slice(1),
    'Hidden provider snapshot and other personal appointments remain byte-equivalent')
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C20_DESKTOP_HIDDEN_SOURCE_SAFE_ALTERNATIVE_SELECTED_AND_CONFIRMED_PASS')
  await context.close()
}
async function exerciseC20MobileRecurringAlternativesAndStaleSourceGuard(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const original={schemaVersion:1,records:[
    {id:'c20-recurring',title:'C20 recurring personal session',
      source:'personal',description:'One original weekly series',location:'Private workroom',
      allDay:false,start:'2026-11-06T09:00:00.000Z',end:'2026-11-06T10:00:00.000Z',
      repeat:{frequency:'weekly',interval:1,weekdays:[5]},updatedAt:'2026-10-18T00:00:00.000Z'},
    {id:'c20-hidden',title:'C20 imported busy interval',
      source:'ics',sourceCalendar:'Imported Mobile',sourceKey:'Imported Mobile|event',
      description:'Read-only external',location:'External hall',
      allDay:false,start:'2026-11-13T10:00:00.000Z',end:'2026-11-13T11:00:00.000Z',
      updatedAt:'2026-10-18T00:00:00.000Z'}
  ]}
  await page.evaluate(state=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state)),original)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-11-06')
  await page.locator('.timeline-block').filter({hasText:'C20 recurring personal session'}).first().click()
  await page.getByRole('button',{name:'Adjust time & duration'}).click()
  const dlg=page.getByRole('dialog',{name:'Confirm time adjustment'})
  await dlg.locator('input[type="datetime-local"]').fill('2026-11-13T11:00')
  await dlg.getByText('C20 imported busy interval').waitFor()
  await dlg.getByRole('button',{name:'Find conflict-free alternatives'}).click()
  await dlg.getByLabel('Alternative search days').selectOption('1')
  assert.ok(await dlg.locator('.adjust-alternative-list button').count()>0)
  assert.equal(await dlg.getByRole('button',{name:/Use alternative 2026-11-13 10:00/}).count(),0,
    'Other original recurring instance at 10:00 must remain busy')
  assert.equal(await dlg.getByRole('button',{name:/Use alternative 2026-11-13 11:00/}).count(),0,
    'Read-only imported snapshot at 11:00 must remain busy')
  const geo=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(geo.scroll<=geo.width+2,'C20 mobile alternatives overflow '+JSON.stringify(geo))
  const first=dlg.locator('.adjust-alternative-list button').first()
  const old=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.deepEqual(old,original,'Finding alternatives must not alter series')
  // Simulate an independently modified source tab without a storage event, so
  // the visible alternative becomes stale but no calendar data may be saved.
  await page.evaluate(()=>{
    const state=JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))
    state.records[1].title='Imported Mobile was independently refreshed'
    localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state))
  })
  await first.click()
  assert.match(await page.locator('.notice').last().innerText(),/Alternative time not selected/)
  assert.equal(await dlg.count(),1,'Stale preview stays open for deliberate review')
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.equal(after.records.length,2)
  assert.deepEqual(after.records[0],original.records[0])
  assert.equal(after.records[1].title,'Imported Mobile was independently refreshed')
  await dlg.getByRole('button',{name:'Cancel',exact:true}).click()
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C20_MOBILE_RECURRING_INSTANCE_HIDDEN_SOURCE_AND_STALE_TAB_GUARD_PASS')
  await context.close()
}


async function exerciseC21DesktopTransparentSourceReview(){
  const context=await browser.newContext({viewport:{width:1440,height:900},
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const source=value=>['BEGIN:VCALENDAR','VERSION:2.0',
    'X-WR-CALNAME:C21 College','BEGIN:VEVENT','UID:original-c21',
    'SUMMARY:C21 free office hours','DTSTART:20261109T080000Z',
    'DTEND:20261109T090000Z','TRANSP:'+value,
    'END:VEVENT','END:VCALENDAR'].join('\r\n')
  const put=async text=>page.locator('input[accept=".ics,text/calendar"]')
    .setInputFiles({name:'c21-college.ics',mimeType:'text/calendar',buffer:Buffer.from(text)})
  await put(source('TRANSPARENT'))
  let review=page.getByRole('dialog',{name:'ICS import review'})
  await review.waitFor()
  await review.getByRole('button',{name:'Apply reviewed changes'}).click()
  await page.getByLabel('Jump to date').fill('2026-11-09')
  await page.locator('.view-switch button').filter({hasText:'List'}).click()
  assert.ok((await page.locator('.calendar-surface').innerText()).includes('Free (non-blocking)'))
  await page.locator('.event-chip').filter({hasText:'C21 free office hours'}).first().click()
  const details=page.getByRole('dialog',{name:'Event details'})
  assert.match(await details.innerText(),/TRANSP:TRANSPARENT/)
  await page.getByRole('button',{name:'Close event'}).click()
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  await put(source('OPAQUE'))
  review=page.getByRole('dialog',{name:'ICS import review'})
  await review.waitFor()
  assert.ok((await review.getByRole('region',{name:'Imported changes by event'}).innerText()).includes('free/busy status'))
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),before,
    'Import preview must never write to the source calendar')
  await review.getByRole('button',{name:'Apply reviewed changes'}).click()
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.equal(after.records[0].id,before.records[0].id)
  assert.equal(after.records[0].sourceKey,before.records[0].sourceKey)
  assert.equal(after.records[0].transparent,undefined)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C21_DESKTOP_TRANSPARENT_REIMPORT_ORIGINAL_ID_PASS')
  await context.close()
}
async function exerciseC21MobileFreeBusyFinder(){
  const context=await browser.newContext({viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const source=['BEGIN:VCALENDAR','VERSION:2.0','X-WR-CALNAME:C21 Mobile',
    'BEGIN:VEVENT','UID:day','SUMMARY:C21 flexible day',
    'DTSTART;VALUE=DATE:20261109','DTEND;VALUE=DATE:20261110',
    'TRANSP:TRANSPARENT','END:VEVENT',
    'BEGIN:VEVENT','UID:busy','SUMMARY:C21 busy morning',
    'DTSTART:20261109T070000Z','DTEND:20261109T080000Z',
    'TRANSP:OPAQUE','END:VEVENT',
    'BEGIN:VEVENT','UID:free','SUMMARY:C21 flexible office hours',
    'DTSTART:20261109T080000Z','DTEND:20261109T090000Z',
    'TRANSP:TRANSPARENT','END:VEVENT','END:VCALENDAR'].join('\r\n')
  await page.locator('input[accept=".ics,text/calendar"]').setInputFiles({
    name:'c21-mobile.ics',mimeType:'text/calendar',buffer:Buffer.from(source)})
  const review=page.getByRole('dialog',{name:'ICS import review'})
  await review.waitFor()
  await review.getByRole('button',{name:'Apply reviewed changes'}).click()
  await page.getByLabel('Jump to date').fill('2026-11-09')
  await page.getByRole('button',{name:'Find time'}).click()
  const finder=page.getByRole('dialog',{name:'Find an available time'})
  await finder.waitFor()
  assert.match(await finder.locator('.finder-slot').first().innerText(),/09:00.*10:00/,
    'C21 09:00 suggestion must remain free despite all-day and timed transparent imports')
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  await finder.locator('.finder-slot').first().click()
  await page.getByRole('dialog',{name:'New event'}).waitFor()
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),before,
    'Provisional planner must not write canonical source data')
  const widths=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}))
  assert.ok(widths.document<=widths.viewport+2,'C21 mobile overflow: '+JSON.stringify(widths))
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C21_MOBILE_TRANSPARENT_FREE_BUSY_FINDER_PASS')
  await context.close()
}


async function exerciseC22MobileFocusedWeekOriginalIdentityAndDST(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',err=>errors.push(err.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const saved={schemaVersion:1,records:[
    {id:'c22-series',source:'personal',title:'C22 recurring source',description:'',location:'',
      start:'2026-10-18T07:00:00.000Z',end:'2026-10-18T08:00:00.000Z',
      allDay:false,repeat:{frequency:'weekly',interval:1},excludedDates:['2026-10-25'],
      updatedAt:'2026-10-18T12:00:00.000Z'},
    {id:'c22-detached',source:'personal',title:'C22 detached review',description:'',location:'',
      start:'2026-10-25T08:00:00.000Z',end:'2026-10-25T09:00:00.000Z',
      allDay:false,recurrenceParentId:'c22-series',recurrenceDate:'2026-10-25',
      updatedAt:'2026-10-18T12:00:00.000Z'},
    {id:'c22-free-ics',source:'ics',sourceCalendar:'C22 Campus',sourceKey:'C22 Campus|orig',
      title:'C22 free seminar',description:'Imported original',location:'',
      start:'2026-10-25T00:15:00.000Z',end:'2026-10-25T00:45:00.000Z',
      allDay:false,transparent:true,updatedAt:'2026-10-18T12:00:00.000Z'},
    {id:'c22-all-day',source:'ics',sourceCalendar:'C22 Campus',sourceKey:'C22 Campus|all',
      title:'C22 all-day information',description:'',location:'',
      start:'2026-10-24T22:00:00.000Z',end:'2026-10-25T23:00:00.000Z',
      allDay:true,startDate:'2026-10-25',endDateExclusive:'2026-10-26',
      updatedAt:'2026-10-18T12:00:00.000Z'}
  ]}
  await page.evaluate(state=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state)),saved)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-10-25')
  const scroller=page.locator('.timeline-scroll')
  const full=await scroller.evaluate(el=>({viewport:el.clientWidth,scroll:el.scrollWidth}))
  assert.equal(await page.locator('.timeline-day').count(),7)
  assert.ok(full.scroll>full.viewport,'C22 prior mobile full-week scroll must remain default')
  await page.getByRole('button',{name:'Focus selected week day'}).click()
  assert.equal(await page.locator('.timeline-day').count(),1,
    'Focus day must display a genuine full-width selected calendar column')
  assert.equal(await page.locator('.mobile-focus-date').count(),7)
  assert.equal(await page.locator('.mobile-focus-date').nth(6).getAttribute('aria-pressed'),'true')
  assert.match(await page.locator('.mobile-focus-date').nth(6).innerText(),/3 events/)
  assert.ok(await page.locator('.timeline-block.imported').count()>=1)
  const focused=await scroller.evaluate(el=>({viewport:el.clientWidth,scroll:el.scrollWidth,top:el.scrollTop}))
  assert.ok(focused.scroll<=focused.viewport+2,'Focused timeline must not require horizontal scrolling')
  assert.ok(Math.abs(focused.top-96)<=3,'DST first event should scroll using 02:15 exact elapsed instant: '+JSON.stringify(focused))
  await page.locator('.mobile-focus-date').nth(4).click()
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-10-23')
  assert.equal(await page.locator('.timeline-day').count(),1)
  assert.equal(await page.locator('.timeline-event-frame').count(),0)
  await page.locator('.mobile-focus-date').nth(6).click()
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-10-25')
  await page.getByRole('button',{name:'07:00',exact:true}).click()
  assert.ok(Math.abs(await scroller.evaluate(el=>el.scrollTop)-448)<=3)
  await page.getByRole('button',{name:'First event'}).click()
  assert.ok(Math.abs(await scroller.evaluate(el=>el.scrollTop)-96)<=3)
  await page.locator('.timeline-block.imported').filter({hasText:'C22 free seminar'}).click()
  const details=page.getByRole('dialog',{name:'Event details'})
  assert.match(await details.innerText(),/TRANSP:TRANSPARENT/)
  assert.equal(await details.getByRole('button',{name:'Edit event'}).count(),0)
  await details.getByRole('button',{name:'Close event'}).click()
  await page.locator('.timeline-slot').nth(24).click()
  await page.getByRole('dialog',{name:'New event'}).waitFor()
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),saved)
  await page.getByRole('button',{name:'Close editor'}).click()
  await page.getByRole('button',{name:'Show scrollable full week'}).click()
  assert.equal(await page.locator('.timeline-day').count(),7)
  const final=await scroller.evaluate(el=>({viewport:el.clientWidth,scroll:el.scrollWidth}))
  assert.ok(final.scroll>final.viewport,'Full week must restore seven original columns')
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),saved,
    'C22 only changes presentation, never original records or detached exceptions')
  const viewport=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(viewport.scroll<=viewport.width+2,'Mobile outer document overflow: '+JSON.stringify(viewport))
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C22_MOBILE_WEEK_FOCUS_DST_ORIGINAL_RECURRING_IMPORTED_SOURCE_PASS')
  await context.close()
}
async function exerciseC22DesktopUnchangedFullWeek(){
  const context=await browser.newContext({viewport:{width:1440,height:900},
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',err=>errors.push(err.message))
  await page.goto(url,{waitUntil:'networkidle'})
  assert.equal(await page.locator('.timeline-day').count(),7)
  assert.equal(await page.getByRole('button',{name:'Focus selected week day'}).isVisible(),false)
  assert.equal(await page.locator('.mobile-focus-strip').count(),0)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C22_DESKTOP_ORIGINAL_SEVEN_COLUMN_WEEK_PASS')
  await context.close()
}


async function exerciseC23MobileQuickDraftAndOriginalEdit(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-10-19')
  const before=await page.evaluate(()=>localStorage.getItem('thiepn.calendar.local.v1'))
  await page.locator('.top-create').click()
  let editor=page.getByRole('dialog',{name:'New event'})
  const start=editor.locator('input[type="datetime-local"]').first()
  const end=editor.locator('input[type="datetime-local"]').nth(1)
  assert.equal(await editor.locator('.mobile-editor-shortcuts').isVisible(),true)
  assert.equal(await editor.getByRole('button',{name:'30 min later'}).isVisible(),true)
  assert.equal(await editor.getByRole('button',{name:'2 h',exact:true}).isVisible(),true)
  assert.notEqual(await page.evaluate(()=>document.activeElement?.getAttribute('placeholder')),'What are you planning?',
    'Mobile draft should not force the on-screen keyboard before scheduling')
  await editor.getByLabel('Event name').fill('C23 original mobile event')
  await start.fill('2026-10-19T09:00')
  await end.fill('2026-10-19T10:00')
  await editor.getByRole('button',{name:'30 min later'}).click()
  assert.equal(await start.inputValue(),'2026-10-19T09:30')
  assert.equal(await end.inputValue(),'2026-10-19T10:30')
  await editor.getByRole('button',{name:'2 h',exact:true}).click()
  assert.equal(await end.inputValue(),'2026-10-19T11:30')
  await editor.getByRole('button',{name:'Next day'}).click()
  assert.equal(await start.inputValue(),'2026-10-20T09:30')
  assert.equal(await end.inputValue(),'2026-10-20T11:30')
  await editor.getByRole('button',{name:'Previous day'}).click()
  assert.equal(await start.inputValue(),'2026-10-19T09:30')
  assert.equal(await end.inputValue(),'2026-10-19T11:30')
  await editor.getByLabel('Notes').fill('Local unsaved notes')
  assert.equal(await page.evaluate(()=>localStorage.getItem('thiepn.calendar.local.v1')),before,
    'All shortcut actions must stay in memory before Save')
  await editor.evaluate(el=>{el.scrollTop=el.scrollHeight})
  const footer=editor.locator('.editor-actions')
  const sticky=await footer.evaluate(el=>getComputedStyle(el).position)
  assert.equal(sticky,'sticky')
  const bounds=await Promise.all([editor.boundingBox(),footer.boundingBox()])
  assert.ok(bounds[0]&&bounds[1]&&bounds[1].y+bounds[1].height<=bounds[0].y+bounds[0].height+2,
    'Mobile save controls must remain within the editor viewport')
  await editor.getByRole('button',{name:'Create event'}).click()
  await editor.waitFor({state:'hidden'})
  const created=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records
    .find(x=>x.title==='C23 original mobile event'))
  assert.ok(created?.id)
  assert.equal(new Date(created.start).toISOString(),'2026-10-19T07:30:00.000Z')
  assert.equal(new Date(created.end).toISOString(),'2026-10-19T09:30:00.000Z')
  assert.equal(created.description,'Local unsaved notes')
  await page.locator('.timeline-block').filter({hasText:'C23 original mobile event'}).first().click()
  await page.getByRole('button',{name:'Edit event'}).click()
  editor=page.getByRole('dialog',{name:'Edit event'})
  await editor.getByRole('button',{name:'Next day'}).click()
  assert.equal(await editor.locator('input[type="datetime-local"]').first().inputValue(),'2026-10-20T09:30')
  await editor.getByRole('button',{name:'Save changes'}).click()
  await editor.waitFor({state:'hidden'})
  const updated=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')).records
    .find(x=>x.title==='C23 original mobile event'))
  assert.equal(updated.id,created.id,'C23 editing must keep the exact original personal record ID')
  assert.equal(new Date(updated.start).toISOString(),'2026-10-20T07:30:00.000Z')
  assert.equal(updated.description,created.description)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C23_MOBILE_QUICK_DRAFT_STICKY_SAVE_AND_ORIGINAL_EDIT_PASS')
  await context.close()
}
async function exerciseC23MobileDstAndAllDayGuard(){
  const context=await browser.newContext({viewport:{width:360,height:780},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-10-24')
  const baseline=await page.evaluate(()=>localStorage.getItem('thiepn.calendar.local.v1'))
  await page.locator('.top-create').click()
  const editor=page.getByRole('dialog',{name:'New event'})
  const start=editor.locator('input[type="datetime-local"]').first()
  const end=editor.locator('input[type="datetime-local"]').nth(1)
  await start.fill('2026-10-24T02:30')
  await end.fill('2026-10-24T03:30')
  await editor.getByRole('button',{name:'Next day'}).click()
  assert.equal(await start.inputValue(),'2026-10-24T02:30')
  assert.equal(await end.inputValue(),'2026-10-24T03:30')
  assert.match(await editor.getByRole('alert').last().innerText(),/occurs twice/)
  await editor.getByRole('button',{name:'30 min later'}).click()
  assert.equal(await start.inputValue(),'2026-10-24T03:00')
  assert.equal(await end.inputValue(),'2026-10-24T04:00')
  await editor.getByLabel('All-day event').check()
  const dates=editor.locator('input[type="date"]')
  await dates.first().fill('2026-10-30')
  await dates.nth(1).fill('2026-11-02')
  await editor.getByRole('button',{name:'Next day'}).click()
  assert.equal(await dates.first().inputValue(),'2026-10-31')
  assert.equal(await dates.nth(1).inputValue(),'2026-11-03')
  assert.equal(await editor.getByRole('button',{name:'30 min later'}).count(),0)
  assert.equal(await page.evaluate(()=>localStorage.getItem('thiepn.calendar.local.v1')),baseline)
  await editor.getByRole('button',{name:'Cancel'}).click()
  await page.getByRole('alertdialog',{name:'Discard unsaved changes?'}).getByRole('button',{name:'Discard changes'}).click()
  const viewport=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(viewport.scroll<=viewport.width+2,'Mobile outer overflow: '+JSON.stringify(viewport))
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C23_MOBILE_DST_REJECTION_ALL_DAY_DRAFT_AND_CANCEL_NO_WRITES_PASS')
  await context.close()
}
async function exerciseC23DesktopEditorUnchanged(){
  const context=await browser.newContext({viewport:{width:1440,height:900},
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.getByRole('button',{name:'New event'}).click()
  const editor=page.getByRole('dialog',{name:'New event'})
  assert.equal(await editor.locator('.mobile-editor-shortcuts').isVisible(),false)
  assert.equal(await editor.locator('.editor-actions').evaluate(el=>getComputedStyle(el).position),'static')
  assert.equal(await editor.getByRole('button',{name:'Create event'}).isVisible(),true)
  await editor.getByRole('button',{name:'Cancel'}).click()
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C23_DESKTOP_ORIGINAL_EDITOR_BEHAVIOR_PASS')
  await context.close()
}


async function exerciseC24MobileSearchPageNavigationAndCanonicalDetails(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const fixture={schemaVersion:1,records:[
    {id:'c24-original-daily',source:'personal',title:'C24 Recurring review',
      description:'Original, never copied',location:'',
      start:'2026-10-18T07:00:00.000Z',end:'2026-10-18T08:00:00.000Z',
      allDay:false,repeat:{frequency:'daily',interval:1},excludedDates:['2026-10-20'],
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c24-detached',source:'personal',title:'C24 Recurring review — moved instance',
      description:'Original detached identity',location:'',
      start:'2026-10-20T10:00:00.000Z',end:'2026-10-20T11:00:00.000Z',
      allDay:false,recurrenceParentId:'c24-original-daily',recurrenceDate:'2026-10-20',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c24-free-original',source:'ics',sourceCalendar:'C24 Campus',
      sourceKey:'C24 Campus|c24-free-original',title:'C24 Free imported',
      description:'Read-only original',location:'',
      start:'2026-10-28T07:00:00.000Z',end:'2026-10-28T08:00:00.000Z',
      allDay:false,transparent:true,updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(value=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(value)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-10-18')
  const before=await page.evaluate(()=>localStorage.getItem('thiepn.calendar.local.v1'))
  const mobileTrigger=page.getByRole('button',{name:'Focus event search'})
  assert.equal(await mobileTrigger.isVisible(),true,'C24 mobile must expose a real search activation control')
  await mobileTrigger.click()
  const input=page.getByLabel('Search calendar events')
  assert.equal(await input.evaluate(el=>document.activeElement===el),true,'Mobile search must focus input')
  await input.fill('C24 Recurring review')
  const panel=page.getByRole('region',{name:'Calendar search results'})
  await panel.getByRole('button',{name:'Next results'}).waitFor()
  assert.match(await panel.innerText(),/365 occurrences found/)
  assert.match(await panel.innerText(),/showing 1–30/)
  assert.equal(await panel.locator('.search-results-items button').count(),30)
  await panel.getByRole('button',{name:'Next results'}).click()
  assert.match(await panel.innerText(),/showing 31–60/)
  assert.match(await panel.innerText(),/Page 2 of 13/)
  assert.equal(await panel.getByRole('button',{name:'Previous results'}).isEnabled(),true)
  assert.equal(await panel.locator('.search-results-items button').count(),30)
  await panel.getByRole('button',{name:'Previous results'}).click()
  assert.match(await panel.innerText(),/showing 1–30/)
  await panel.getByRole('button',{name:'Next results'}).click()
  const third=panel.locator('.search-results-items button').first()
  assert.match(await third.innerText(),/C24 Recurring review/)
  await third.click()
  const details=page.getByRole('dialog',{name:'Event details'})
  await details.waitFor()
  assert.match(await details.innerText(),/C24 Recurring review/)
  await details.getByRole('button',{name:'Close event'}).click()
  await details.waitFor({state:'hidden'})
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture,
    'Pagination and details must not rewrite personal/recurring originals')
  // Opening a result selects its date; reset the search anchor before looking back.
  await page.getByLabel('Jump to date').fill('2026-10-18')
  await page.waitForFunction(()=>document.querySelector('.date-navigation h2')?.textContent?.includes('18 October 2026'))
  await input.fill('C24 Free imported')
  await panel.getByText('1 occurrence found',{exact:false}).waitFor()
  assert.match(await panel.innerText(),/1 occurrence found/)
  assert.equal(await panel.getByRole('button',{name:'Next results'}).count(),0)
  await panel.locator('.search-results-items button').first().click()
  const imported=page.getByRole('dialog',{name:'Event details'})
  assert.match(await imported.innerText(),/TRANSP:TRANSPARENT/)
  assert.equal(await imported.getByRole('button',{name:'Edit event'}).count(),0)
  await imported.getByRole('button',{name:'Close event'}).click()
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(overflow.scroll<=overflow.width+2,'Search mobile body overflow: '+JSON.stringify(overflow))
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C24_MOBILE_EXPLICIT_SEARCH_PAGED_CANONICAL_RECURRING_ICS_PASS')
  await context.close()
}
async function exerciseC24DesktopReverseSearchPagesAndFilterReset(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const fixture={schemaVersion:1,records:[{id:'c24-year-long',source:'personal',
    title:'C24 Year series',description:'',location:'',
    start:'2026-01-01T11:00:00.000Z',end:'2026-01-01T12:00:00.000Z',
    allDay:false,repeat:{frequency:'daily',interval:1},updatedAt:'2026-01-01T00:00:00.000Z'}]}
  await page.evaluate(state=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-12-31')
  assert.equal(await page.getByRole('button',{name:'Focus event search'}).isVisible(),false)
  await page.getByLabel('Search calendar events').fill('C24 Year series')
  const region=page.getByRole('region',{name:'Calendar search results'})
  await region.getByLabel('Search period').selectOption('backward')
  assert.match(await region.innerText(),/365 occurrences found/)
  assert.match(await region.locator('.search-results-items button').first().innerText(),/31 Dec 2026/)
  await region.getByRole('button',{name:'Next results'}).click()
  assert.match(await region.innerText(),/showing 31–60/)
  assert.match(await region.locator('.search-results-items button').first().innerText(),/1 Dec 2026/)
  await region.getByLabel('Search period').selectOption('forward')
  await region.getByText('365 occurrences found',{exact:false}).waitFor()
  assert.match(await region.innerText(),/showing 1–30/)
  assert.match(await region.innerText(),/Page 1 of 13/)
  assert.match(await region.locator('.search-results-items button').first().innerText(),/31 Dec 2026/)
  assert.equal(await region.getByRole('button',{name:'Previous results'}).isEnabled(),false)
  assert.equal(await region.getByRole('button',{name:'Next results'}).isEnabled(),true)
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C24_DESKTOP_REVERSE_CHRONOLOGY_SEARCH_RESET_SOURCE_INTACT_PASS')
  await context.close()
}


async function exerciseC25MobileReadOnlySourceAndDetachedEventBrowsing(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',err=>errors.push(err.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const fixture={schemaVersion:1,records:[
    {id:'c25-a',title:'C25 Morning appointment',source:'personal',allDay:false,
      description:'Original private note',location:'',
      start:'2026-10-19T07:00:00.000Z',end:'2026-10-19T08:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c25-b',title:'C25 Afternoon appointment',source:'personal',allDay:false,
      description:'',location:'',
      start:'2026-10-19T11:00:00.000Z',end:'2026-10-19T12:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c25-series',title:'C25 Weekly practice',source:'personal',allDay:false,
      description:'',location:'',
      start:'2026-10-19T13:00:00.000Z',end:'2026-10-19T14:00:00.000Z',
      repeat:{frequency:'weekly',interval:1},excludedDates:['2026-10-26'],
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c25-import-free',title:'C25 Free campus',source:'ics',
      sourceCalendar:'C25 Campus',sourceKey:'C25 Campus|original-uid',
      transparent:true,allDay:false,description:'Original imported notes',location:'',
      start:'2026-10-20T08:00:00.000Z',end:'2026-10-20T09:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c25-detached',title:'C25 Detached appointment',source:'personal',allDay:false,
      recurrenceParentId:'c25-series',recurrenceDate:'2026-10-26',
      description:'Original detached ID',location:'',
      start:'2026-10-21T09:00:00.000Z',end:'2026-10-21T10:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(x=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(x)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-10-19')
  await page.getByRole('button',{name:'Focus event search'}).click()
  const input=page.getByLabel('Search calendar events')
  await input.fill('C25')
  const list=page.getByRole('region',{name:'Calendar search results'})
  await list.locator('.search-results-items button').filter({hasText:'C25 Morning appointment'}).first().click()
  const details=page.getByRole('dialog',{name:'Event details'})
  await details.waitFor()
  assert.match(await details.innerText(),/C25 Morning appointment/)
  assert.match(await details.locator('.details-navigation-current').innerText(),/Event 1 of/)
  assert.equal(await details.getByRole('button',{name:'Previous visible event'}).isEnabled(),false)
  const next=details.getByRole('button',{name:'Next visible event'})
  assert.equal(await next.isEnabled(),true)
  const firstNav=await details.locator('.details-navigation').boundingBox()
  assert.ok(firstNav&&firstNav.width>260,'Mobile navigation strip must be readable')
  await next.click()
  await details.getByRole('heading',{name:'C25 Afternoon appointment'}).waitFor()
  await next.click()
  await details.getByRole('heading',{name:'C25 Weekly practice'}).waitFor()
  assert.equal(await details.getByRole('button',{name:'Edit this occurrence'}).count(),1)
  await next.click()
  await details.getByRole('heading',{name:'C25 Free campus'}).waitFor()
  assert.match(await details.innerText(),/TRANSP:TRANSPARENT/)
  assert.equal(await details.getByRole('button',{name:'Edit event'}).count(),0)
  assert.equal(await details.getByRole('button',{name:'Make personal copy'}).count(),1)
  await details.getByRole('button',{name:'Previous visible event'}).click()
  await details.getByRole('heading',{name:'C25 Weekly practice'}).waitFor()
  await next.click()
  await details.getByRole('heading',{name:'C25 Free campus'}).waitFor()
  await next.click()
  await details.getByRole('heading',{name:'C25 Detached appointment'}).waitFor()
  assert.match(await details.innerText(),/Original series date: 2026-10-26/)
  await details.getByRole('button',{name:'Show this day'}).click()
  await details.waitFor({state:'hidden'})
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-10-21')
  assert.equal(await page.locator('.view-switch button.active').innerText(),'Day')
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture,
    'C25 browsing, read-only imported details and day handoff must never alter original IDs/records')
  const size=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth}))
  assert.ok(size.page<=size.viewport+2,'Mobile page overflow: '+JSON.stringify(size))
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C25_MOBILE_DETAIL_PREV_NEXT_ICS_RECURRENCE_AND_DAY_HANDOFF_PASS')
  await context.close()
}
async function exerciseC25DesktopSourceFilteredNavigationAndNoWrites(){
  const context=await browser.newContext({viewport:{width:1440,height:900},
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',err=>errors.push(err.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const fixture={schemaVersion:1,records:[
    {id:'c25-desktop-1',title:'C25 Desktop first',source:'personal',allDay:false,
      description:'',location:'',start:'2026-10-19T07:00:00.000Z',
      end:'2026-10-19T08:00:00.000Z',updatedAt:'2026-10-18T10:00:00.000Z'},
    {id:'c25-desktop-import',title:'C25 Desktop hidden imported',source:'ics',
      sourceCalendar:'C25 Hidden',sourceKey:'C25 Hidden|original',allDay:false,
      description:'',location:'',start:'2026-10-19T08:00:00.000Z',
      end:'2026-10-19T09:00:00.000Z',updatedAt:'2026-10-18T10:00:00.000Z'},
    {id:'c25-desktop-2',title:'C25 Desktop next',source:'personal',allDay:false,
      description:'',location:'',start:'2026-10-19T09:00:00.000Z',
      end:'2026-10-19T10:00:00.000Z',updatedAt:'2026-10-18T10:00:00.000Z'}
  ]}
  await page.evaluate(x=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(x)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-10-19')
  await page.getByRole('button',{name:'Toggle imported calendar C25 Hidden'}).click()
  await page.getByLabel('Search calendar events').fill('C25 Desktop')
  const panel=page.getByRole('region',{name:'Calendar search results'})
  await panel.locator('.search-results-items button').filter({hasText:'C25 Desktop first'}).first().click()
  const details=page.getByRole('dialog',{name:'Event details'})
  await details.waitFor()
  assert.match(await details.locator('.details-navigation-current').innerText(),/Event 1 of 2/)
  const next=details.getByRole('button',{name:'Next visible event'})
  await next.click()
  await details.getByRole('heading',{name:'C25 Desktop next'}).waitFor()
  assert.equal(await next.isEnabled(),false)
  await details.getByRole('button',{name:'Previous visible event'}).click()
  await details.getByRole('heading',{name:'C25 Desktop first'}).waitFor()
  assert.equal(await details.getByRole('button',{name:'Edit event'}).count(),1)
  await details.getByRole('button',{name:'Close event'}).click()
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C25_DESKTOP_VISIBLE_FILTER_BOUNDED_NAV_NO_SOURCE_WRITES_PASS')
  await context.close()
}


async function exerciseC26MobileContextualSingleDayFinderOriginalSources(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',err=>errors.push(err.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const fixture={schemaVersion:1,records:[
    {id:'c26-hidden-day-block',source:'ics',sourceCalendar:'C26 Hidden Busy',
      sourceKey:'c26-hidden-day-original',title:'C26 hidden reserved day',allDay:false,
      description:'Source private',location:'',
      start:'2026-11-27T07:00:00.000Z',end:'2026-11-27T18:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c26-hidden-clock-block',source:'ics',sourceCalendar:'C26 Hidden Busy',
      sourceKey:'c26-clock-original',title:'C26 hidden clock time',allDay:false,
      description:'Source private',location:'',
      start:'2026-11-28T08:00:00.000Z',end:'2026-11-28T09:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c26-transparent-class',source:'ics',sourceCalendar:'C26 Public Free',
      sourceKey:'c26-free-original',title:'C26 transparent class',allDay:false,
      transparent:true,description:'Non blocking',location:'',
      start:'2026-11-28T07:00:00.000Z',end:'2026-11-28T08:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c26-parent-stable',source:'personal',title:'C26 weekly review',allDay:false,
      description:'Keep parent recurrence',location:'',
      repeat:{frequency:'weekly',interval:1},excludedDates:['2026-12-05'],
      start:'2026-11-28T11:00:00.000Z',end:'2026-11-28T12:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(value=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(value)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-11-26')
  const strip=page.getByRole('region',{name:'Seven-day planning overview'})
  const trigger=strip.getByRole('button',{name:'Find free time on 2026-11-27'})
  await trigger.waitFor()
  assert.equal(await trigger.isEnabled(),true)
  assert.equal(await strip.getByRole('button',{name:'Open daily plan 2026-11-27'}).isVisible(),true)
  await page.getByRole('button',{name:'Open navigation'}).click()
  await page.getByRole('button',{name:'Toggle imported calendar C26 Hidden Busy'}).click()
  await page.getByRole('button',{name:'Close navigation'}).click({position:{x:350,y:340}})
  const baseline=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.deepEqual(baseline,fixture)
  await trigger.click()
  const finder=page.getByRole('dialog',{name:'Find an available time'})
  await finder.waitFor()
  assert.equal(await finder.getByLabel('Finder start date').inputValue(),'2026-11-27')
  assert.equal(await finder.getByLabel('Look ahead').inputValue(),'1')
  assert.match(await finder.innerText(),/Single-day search/)
  assert.equal(await finder.locator('.finder-slot').count(),0,
    'Hidden imported original must block every day-only proposal')
  assert.match(await finder.innerText(),/No available slots/)
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-11-26',
    'Finder should not change the week selected date until a slot is chosen')
  await finder.getByRole('button',{name:'Next finder day'}).click()
  assert.equal(await finder.getByLabel('Finder start date').inputValue(),'2026-11-28')
  assert.ok(await finder.locator('.finder-slot').count()>0)
  const first=finder.locator('.finder-slot').first()
  assert.match(await first.innerText(),/08:00/)
  await first.click()
  const editor=page.getByRole('dialog',{name:'New event'})
  await editor.waitFor()
  const proposed=await editor.locator('input[type="datetime-local"]').first().inputValue()
  assert.equal(proposed,'2026-11-28T08:00')
  assert.equal(await editor.locator('.draft-collisions li').count(),0,
    'Transparent imported hour cannot be counted as a busy conflict')
  await editor.getByLabel('Event name').fill('C26 personal scheduled locally')
  await editor.getByRole('button',{name:'Create event'}).click()
  await editor.waitFor({state:'hidden'})
  const final=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.equal(final.records.length,fixture.records.length+1)
  for(const old of fixture.records){
    assert.deepEqual(final.records.find(x=>x.id===old.id),old,
      'C26 must preserve original sources, transparent flag, UID and recurrence exclusions')
  }
  assert.equal(final.records.find(x=>x.title==='C26 personal scheduled locally')?.start,
    '2026-11-28T07:00:00.000Z')
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-11-28')
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(size.scroll<=size.width+2,'C26 mobile page overflow: '+JSON.stringify(size))
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C26_MOBILE_DAY_SCOPED_HIDDEN_SOURCE_TRANSP_GUARDED_SAVE_PASS')
  await context.close()
}
async function exerciseC26DesktopFinderDayWindowAndStaleStorageGuard(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',err=>errors.push(err.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-11-26')
  await page.getByRole('button',{name:'Find time',exact:true}).click()
  const finder=page.getByRole('dialog',{name:'Find an available time'})
  await finder.waitFor()
  assert.equal(await finder.getByLabel('Finder start date').inputValue(),'2026-11-26')
  assert.equal(await finder.getByLabel('Look ahead').inputValue(),'7',
    'Global Find time retains original broad search')
  await finder.getByLabel('Look ahead').selectOption('1')
  assert.match(await finder.innerText(),/Single-day search/)
  await finder.getByLabel('Finder start date').fill('2026-11-28')
  await finder.getByRole('button',{name:'Previous finder day'}).click()
  assert.equal(await finder.getByLabel('Finder start date').inputValue(),'2026-11-27')
  await finder.getByRole('button',{name:'Next finder day'}).click()
  assert.equal(await finder.getByLabel('Finder start date').inputValue(),'2026-11-28')
  assert.ok(await finder.locator('.finder-slot').count()>0)
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))||{schemaVersion:1,records:[]})
  const original=finder.locator('.finder-slot').first()
  const next={...before,records:[...before.records,{
    id:'c26-another-tab-original',source:'personal',title:'C26 another tab appointment',
    description:'',location:'',allDay:false,
    start:'2026-11-28T07:00:00.000Z',end:'2026-11-28T09:00:00.000Z',
    updatedAt:'2026-10-18T10:00:00.000Z'}]}
  await page.evaluate(value=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(value)),next)
  await original.click()
  assert.equal(await page.getByRole('dialog',{name:'New event'}).count(),0,
    'Stale source-complete suggestion must not open an editor')
  assert.match(await page.getByRole('status').last().innerText(),/changed in another tab/)
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),next)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C26_DESKTOP_FINDER_EXPLICIT_DATE_AND_STALE_ORIGINAL_CAS_PASS')
  await context.close()
}


async function exerciseC27MobileMonthOverflowAllCanonicalEventsAndSafeHandoffs(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const dense=Array.from({length:24},(_,i)=>({
    id:'c27-original-'+String(i).padStart(2,'0'),source:'personal',
    title:'C27 Dense original '+String(i).padStart(2,'0'),description:'Preserve original '+i,location:'',
    start:'2026-11-26T09:00:00.000Z',end:'2026-11-26T09:30:00.000Z',
    allDay:false,updatedAt:'2026-10-18T09:00:00.000Z'
  }))
  const fixture={schemaVersion:1,records:[...dense,
    {id:'c27-free-ics-original',source:'ics',sourceCalendar:'C27 Campus',
      sourceKey:'C27 Campus|uid-unchanged',title:'C27 Campus free event',
      description:'Read only',location:'',transparent:true,
      start:'2026-11-26T07:00:00.000Z',end:'2026-11-26T08:00:00.000Z',
      allDay:false,updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c27-weekly-parent',source:'personal',title:'C27 Weekly parent',description:'',
      location:'',start:'2026-11-19T11:00:00.000Z',end:'2026-11-19T12:00:00.000Z',
      repeat:{frequency:'weekly',interval:1},excludedDates:['2026-11-26'],
      allDay:false,updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c27-detached-original',source:'personal',title:'C27 Detached original',
      description:'Original detached ID',location:'',start:'2026-11-26T08:00:00.000Z',
      end:'2026-11-26T09:00:00.000Z',recurrenceParentId:'c27-weekly-parent',
      recurrenceDate:'2026-11-26',allDay:false,updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(value=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(value)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-11-26')
  await page.locator('.view-switch button').filter({hasText:'Month'}).click()
  const dayCell=page.locator('.month-cell').filter({has:page.getByRole('button',{name:'View events 2026-11-26'})})
  const more=dayCell.getByRole('button',{name:'View all 26 events on 2026-11-26'})
  await more.waitFor()
  assert.match(await more.innerText(),/\+23 more/)
  assert.equal(await dayCell.locator('.event-chip').count(),3)
  await more.click()
  const peek=page.getByRole('dialog',{name:'Events on 2026-11-26'})
  await peek.waitFor()
  assert.match(await peek.innerText(),/26 visible events/)
  assert.equal(await peek.locator('.month-peek-event').count(),20)
  assert.match(await peek.getByRole('navigation',{name:'Day event pages'}).innerText(),/Page 1 of 2/)
  const free=peek.locator('.month-peek-event').filter({hasText:'C27 Campus free event'})
  assert.match(await free.innerText(),/Imported · read only · Free/)
  await free.click()
  await peek.waitFor({state:'hidden'})
  const details=page.getByRole('dialog',{name:'Event details'})
  await details.waitFor()
  assert.match(await details.innerText(),/TRANSP:TRANSPARENT/)
  assert.equal(await details.getByRole('button',{name:'Edit event'}).count(),0)
  await details.getByRole('button',{name:'Close event'}).click()
  await details.waitFor({state:'hidden'})
  await dayCell.getByRole('button',{name:'View events 2026-11-26'}).click()
  await peek.waitFor()
  await peek.getByRole('button',{name:'Next events'}).click()
  assert.match(await peek.getByRole('navigation',{name:'Day event pages'}).innerText(),/Showing 21–26 of 26/)
  assert.equal(await peek.locator('.month-peek-event').count(),6)
  const last=peek.locator('.month-peek-event').last()
  assert.match(await last.innerText(),/C27 Dense original/)
  await last.click()
  await details.waitFor()
  assert.match(await details.innerText(),/C27 Dense original/)
  await details.getByRole('button',{name:'Close event'}).click()
  await details.waitFor({state:'hidden'})
  await dayCell.getByRole('button',{name:'View events 2026-11-26'}).click()
  await peek.waitFor()
  await peek.getByRole('button',{name:'Open Day view'}).click()
  await peek.waitFor({state:'hidden'})
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-11-26')
  assert.equal(await page.locator('.view-switch button.active').innerText(),'Day')
  await page.locator('.view-switch button').filter({hasText:'Month'}).click()
  await page.getByRole('button',{name:'View events 2026-11-27'}).click()
  await page.getByRole('dialog',{name:'Events on 2026-11-27'}).waitFor()
  const empty=page.getByRole('dialog',{name:'Events on 2026-11-27'})
  assert.match(await empty.innerText(),/0 visible events/)
  await empty.getByRole('button',{name:'New personal event'}).click()
  const editor=page.getByRole('dialog',{name:'New event'})
  await editor.waitFor()
  await editor.getByRole('button',{name:'Cancel'}).click()
  await editor.waitFor({state:'hidden'})
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture,
    'C27 month peek, overflow paging, transparent ICS, detail and canceled creation must not rewrite original records')
  const overflow=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(overflow.scroll<=overflow.w+2,'C27 month mobile overflow: '+JSON.stringify(overflow))
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C27_MOBILE_MONTH_ALL_EVENTS_ICS_PAGINATION_DAY_AND_CANCEL_PASS')
  await context.close()
}
async function exerciseC27DesktopMonthFilterAndDetachedOriginalIdentity(){
  const context=await browser.newContext({viewport:{width:1440,height:900},
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const fixture={schemaVersion:1,records:[
    {id:'c27-desktop-personal',source:'personal',title:'C27 Desktop personal',description:'',
      location:'',allDay:false,start:'2026-11-26T09:00:00.000Z',
      end:'2026-11-26T10:00:00.000Z',updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c27-desktop-import',source:'ics',sourceCalendar:'Hidden Desk',sourceKey:'original-uid',
      title:'C27 Desktop hidden busy',description:'',location:'',allDay:false,
      start:'2026-11-26T08:00:00.000Z',end:'2026-11-26T09:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c27-desktop-parent',source:'personal',title:'C27 Desktop weekly parent',description:'',
      location:'',allDay:false,repeat:{frequency:'weekly',interval:1},excludedDates:['2026-11-26'],
      start:'2026-11-19T10:00:00.000Z',end:'2026-11-19T11:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c27-desktop-detached',source:'personal',recurrenceParentId:'c27-desktop-parent',
      recurrenceDate:'2026-11-26',title:'C27 Desktop detached original',description:'',
      location:'',allDay:false,start:'2026-11-26T11:00:00.000Z',
      end:'2026-11-26T12:00:00.000Z',updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(state=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-11-26')
  await page.locator('.view-switch button').filter({hasText:'Month'}).click()
  await page.getByRole('button',{name:'Toggle imported calendar Hidden Desk'}).click()
  await page.getByRole('button',{name:'View events 2026-11-26'}).click()
  const peek=page.getByRole('dialog',{name:'Events on 2026-11-26'})
  await peek.waitFor()
  assert.match(await peek.innerText(),/2 visible events/)
  assert.equal(await peek.locator('.month-peek-event').count(),2)
  assert.equal(await peek.locator('.month-peek-event').filter({hasText:'C27 Desktop hidden busy'}).count(),0)
  const detached=peek.locator('.month-peek-event').filter({hasText:'C27 Desktop detached original'})
  await detached.click()
  const details=page.getByRole('dialog',{name:'Event details'})
  await details.waitFor()
  assert.match(await details.innerText(),/Original series date: 2026-11-26/)
  assert.equal(await details.getByRole('button',{name:'Restore original date'}).count(),1)
  await details.getByRole('button',{name:'Close event'}).click()
  await details.waitFor({state:'hidden'})
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C27_DESKTOP_MONTH_HIDDEN_SOURCE_DETACHED_IDENTITY_NO_WRITES_PASS')
  await context.close()
}


async function exerciseC28MobileSkipEmptyAgendaReadOnlyFreeAndHiddenSource(){
  const context=await browser.newContext({viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const fixture={schemaVersion:1,records:[
    {id:'c28-hidden-busy',title:'C28 Hidden busy import',source:'ics',
      sourceCalendar:'C28 Hidden Lab',sourceKey:'source-original-busy',allDay:false,
      description:'Original hidden source',location:'',
      start:'2026-11-03T08:00:00.000Z',end:'2026-11-03T09:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c28-free-visible',title:'C28 Campus free appointment',source:'ics',
      sourceCalendar:'C28 Campus',sourceKey:'source-original-free',
      transparent:true,allDay:false,description:'Original TRANSP',location:'',
      start:'2026-11-18T08:00:00.000Z',end:'2026-11-18T09:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c28-personal-future',title:'C28 Personal later',source:'personal',
      allDay:false,description:'Private original',location:'',
      start:'2027-01-15T10:00:00.000Z',end:'2027-01-15T11:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(x=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(x)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-10-19')
  await page.getByRole('button',{name:'List',exact:true}).click()
  await page.getByLabel('Only days with commitments').check()
  assert.match(await page.getByRole('region',{name:'Upcoming agenda'}).innerText(),/No commitments in this period/)
  await page.getByRole('button',{name:'Open navigation'}).click()
  const hide=page.getByRole('button',{name:'Toggle imported calendar C28 Hidden Lab'})
  await hide.click()
  assert.equal(await hide.getAttribute('aria-pressed'),'false')
  await page.getByRole('button',{name:'Close navigation'}).click({position:{x:350,y:340}})
  const next=page.getByRole('button',{name:'Next visible commitments'})
  await next.click()
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-11-18')
  assert.equal(await page.locator('.view-switch button.active').innerText(),'List')
  assert.equal(await page.getByLabel('Agenda range').inputValue(),'14')
  assert.equal(await page.getByLabel('Only days with commitments').isChecked(),true)
  const agenda=page.getByRole('region',{name:'Upcoming agenda'})
  assert.equal(await agenda.locator('.agenda-row').count(),1)
  assert.match(await agenda.innerText(),/C28 Campus free appointment/)
  assert.match(await agenda.innerText(),/Free \(non-blocking\)/)
  assert.equal(await agenda.getByText('C28 Hidden busy import').count(),0)
  await next.click()
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2027-01-15')
  assert.match(await agenda.innerText(),/C28 Personal later/)
  await page.getByRole('button',{name:'Previous visible commitments'}).click()
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-11-05')
  assert.match(await agenda.innerText(),/C28 Campus free appointment/)
  assert.equal(await agenda.getByText('C28 Hidden busy import').count(),0)
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(size.scroll<=size.width+2,'C28 agenda mobile viewport overflow: '+JSON.stringify(size))
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C28_MOBILE_AGENDA_SKIP_EMPTY_TRANSP_HIDDEN_BACKTRACK_NO_WRITES_PASS')
  await context.close()
}
async function exerciseC28DesktopAgendaAllDayContinuationAndBoundedEmpty(){
  const context=await browser.newContext({viewport:{width:1440,height:900},
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const fixture={schemaVersion:1,records:[
    {id:'c28-all-day-original',title:'C28 Multi-day original',source:'personal',
      allDay:true,description:'Keep original multi-day dates',location:'',
      startDate:'2026-11-01',endDateExclusive:'2026-11-15',
      start:'2026-10-31T23:00:00.000Z',end:'2026-11-14T23:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c28-off-filter',title:'C28 unrelated private source',source:'personal',
      allDay:false,description:'',location:'',
      start:'2026-11-21T09:00:00.000Z',end:'2026-11-21T10:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(value=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(value)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-10-19')
  await page.getByRole('button',{name:'List',exact:true}).click()
  await page.getByLabel('Only days with commitments').check()
  await page.getByRole('button',{name:'Next visible commitments'}).click()
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-11-02',
    'First day of continuation outside displayed window must be visible')
  assert.match(await page.getByRole('region',{name:'Upcoming agenda'}).innerText(),/C28 Multi-day original/)
  await page.getByLabel('Search calendar events').fill('No such C28 event')
  const previous=await page.getByLabel('Jump to date').inputValue()
  await page.getByRole('button',{name:'Next visible commitments'}).click()
  assert.equal(await page.getByLabel('Jump to date').inputValue(),previous)
  assert.match(await page.getByRole('status').last().innerText(),/No later visible agenda commitments found within 365 days/)
  await page.getByLabel('Search calendar events').fill('C28 unrelated')
  await page.getByRole('button',{name:'Next visible commitments'}).click()
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-11-21',
    'Query filtered navigation must not jump to other hidden search results')
  assert.equal(await page.locator('.view-switch button.active').innerText(),'List')
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C28_DESKTOP_AGENDA_MULTIDAY_QUERY_BOUNDED_EMPTY_NO_WRITES_PASS')
  await context.close()
}


async function exerciseC29MobileDayOriginalAppointmentNavigatorAndDensePagination(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const timed=Array.from({length:18},(_,i)=>({
    id:'c29-timed-'+i,title:'C29 personal appointment '+i,description:'Canonical original '+i,location:'',
    source:'personal',allDay:false,
    start:new Date(Date.UTC(2026,10,26,3+i,0)).toISOString(),
    end:new Date(Date.UTC(2026,10,26,3+i,30)).toISOString(),
    updatedAt:'2026-10-18T09:00:00.000Z'
  }))
  const fixture={schemaVersion:1,records:[
    ...timed,
    {id:'c29-imported-free',source:'ics',sourceCalendar:'C29 Campus',sourceKey:'C29 Campus|original-free',
      transparent:true,title:'C29 transparent seminar',description:'Keep read only',location:'',
      allDay:false,start:'2026-11-26T07:30:00.000Z',end:'2026-11-26T08:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c29-hidden-busy',source:'ics',sourceCalendar:'C29 Hidden Lab',sourceKey:'C29 Hidden Lab|busy',
      title:'C29 hidden source',description:'',location:'',allDay:false,
      start:'2026-11-26T08:00:00.000Z',end:'2026-11-26T09:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c29-all-day-original',source:'ics',sourceCalendar:'C29 Campus',sourceKey:'C29 Campus|all-day',
      title:'C29 full-day campus notice',description:'Unmodified ICS',location:'',allDay:true,
      startDate:'2026-11-26',endDateExclusive:'2026-11-27',
      start:'2026-11-25T23:00:00.000Z',end:'2026-11-26T23:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(value=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(value)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-11-26')
  await page.locator('.view-switch button').filter({hasText:'Day'}).click()
  await page.getByRole('button',{name:'Open navigation'}).click()
  const hidden=page.getByRole('button',{name:'Toggle imported calendar C29 Hidden Lab'})
  await hidden.click()
  assert.equal(await hidden.getAttribute('aria-pressed'),'false')
  await page.getByRole('button',{name:'Close navigation'}).click({position:{x:350,y:340}})
  const nav=page.getByRole('navigation',{name:"Navigate today's visible events"})
  await nav.waitFor()
  assert.match(await nav.innerText(),/20 visible · 19 timed · 1 all-day/)
  assert.equal(await nav.locator('.day-jump-entry').count(),8)
  const allDay=nav.locator('.day-jump-entry').filter({hasText:'C29 full-day campus notice'})
  assert.equal(await allDay.getByRole('button',{name:/Locate in timeline/}).count(),0)
  await allDay.getByRole('button',{name:/Open original event/}).click()
  const details=page.getByRole('dialog',{name:'Event details'})
  await details.waitFor()
  assert.match(await details.innerText(),/C29 full-day campus notice/)
  assert.equal(await details.getByRole('button',{name:'Edit event'}).count(),0)
  await details.getByRole('button',{name:'Close event'}).click()
  await nav.getByRole('button',{name:'Next events'}).click()
  assert.match(await nav.getByLabel('Day navigation pages').innerText(),/Page 2 of 3/)
  assert.equal(await nav.locator('.day-jump-entry').count(),8)
  await nav.getByRole('button',{name:'Next events'}).click()
  assert.match(await nav.getByLabel('Day navigation pages').innerText(),/Events 17–20 of 20/)
  assert.equal(await nav.locator('.day-jump-entry').count(),4)
  const target=nav.getByRole('button',{name:'Locate in timeline c29-timed-17@2026-11-26'})
  await target.click()
  assert.match(await nav.getByRole('status').innerText(),/C29 personal appointment 17 located/)
  const scroller=page.locator('.timeline-scroll')
  assert.ok(await scroller.evaluate(node=>node.scrollTop)>300,'Late event should move the original Day timeline')
  const focus=await page.evaluate(()=>document.activeElement?.getAttribute('data-occurrence-key'))
  assert.equal(focus,'c29-timed-17@2026-11-26')
  await nav.getByRole('button',{name:'Open original event c29-timed-17@2026-11-26'}).click()
  await details.waitFor()
  assert.match(await details.innerText(),/C29 personal appointment 17/)
  await details.getByRole('button',{name:'Close event'}).click()
  await page.getByLabel('Jump to date').fill('2026-11-27')
  assert.match(await nav.innerText(),/0 visible/)
  assert.equal(await nav.locator('.day-jump-entry').count(),0)
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture,
    'C29 jump/paging/open/details must preserve all original IDs and imported metadata')
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(size.scroll<=size.width+2,'C29 mobile overflow: '+JSON.stringify(size))
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C29_MOBILE_DAY_PAGED_EXACT_EVENT_LOCATE_AND_SOURCE_NO_WRITES_PASS')
  await context.close()
}
async function exerciseC29DesktopRepeatedDstTimeNavigationAndReadOnlyOriginal(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const fixture={schemaVersion:1,records:[
    {id:'c29-earlier-original',source:'personal',title:'C29 first physical 02:00',
      description:'Earlier DST original',location:'',allDay:false,
      start:'2026-10-25T00:00:00.000Z',end:'2026-10-25T00:30:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c29-later-ics-original',source:'ics',sourceCalendar:'C29 Clock Source',
      sourceKey:'C29 Clock Source|absolute-uid',title:'C29 second physical 02:00',description:'Readonly fold',
      location:'',allDay:false,transparent:true,
      start:'2026-10-25T01:00:00.000Z',end:'2026-10-25T01:30:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(value=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(value)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-10-25')
  await page.locator('.view-switch button').filter({hasText:'Day'}).click()
  const nav=page.getByRole('navigation',{name:"Navigate today's visible events"})
  await nav.waitFor()
  assert.match(await nav.innerText(),/2 visible · 2 timed · 0 all-day/)
  assert.match(await nav.innerText(),/UTC\+02:00/)
  assert.match(await nav.innerText(),/UTC\+01:00/)
  const scroll=page.locator('.timeline-scroll')
  await nav.getByRole('button',{name:'Locate in timeline c29-earlier-original@2026-10-25'}).click()
  const first=await scroll.evaluate(node=>node.scrollTop)
  await nav.getByRole('button',{name:'Locate in timeline c29-later-ics-original@2026-10-25'}).click()
  const second=await scroll.evaluate(node=>node.scrollTop)
  assert.ok(second-first>=60,'DST repeated 02:00 should jump to a different physical hour: '+first+'/'+second)
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-occurrence-key')),
    'c29-later-ics-original@2026-10-25')
  await nav.getByRole('button',{name:'Open original event c29-later-ics-original@2026-10-25'}).click()
  const details=page.getByRole('dialog',{name:'Event details'})
  await details.waitFor()
  assert.match(await details.innerText(),/TRANSP:TRANSPARENT/)
  assert.equal(await details.getByRole('button',{name:'Edit event'}).count(),0)
  await details.getByRole('button',{name:'Close event'}).click()
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C29_DESKTOP_ORIGINAL_DST_BOTH_FOLDS_READONLY_SOURCE_NO_WRITES_PASS')
  await context.close()
}


async function exerciseC30MobileAgendaDenseOriginalEventsAndDayDrilldown(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const personal=Array.from({length:53},(_,i)=>({
    id:'c30-original-'+String(i).padStart(3,'0'),source:'personal',
    title:'C30 Personal '+String(i).padStart(3,'0'),description:'Original '+i,location:'',
    allDay:false,start:'2026-11-26T09:00:00.000Z',end:'2026-11-26T09:30:00.000Z',
    updatedAt:'2026-10-18T09:00:00.000Z'
  }))
  const fixture={schemaVersion:1,records:[...personal,
    {id:'c30-readonly-free',source:'ics',sourceCalendar:'C30 Campus',sourceKey:'C30 Campus|original',
      title:'C30 Campus free seminar',description:'Read only',location:'',transparent:true,allDay:false,
      start:'2026-11-26T07:00:00.000Z',end:'2026-11-26T08:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c30-readonly-all-day',source:'ics',sourceCalendar:'C30 Campus',sourceKey:'C30 Campus|all-day',
      title:'C30 Campus all-day notice',description:'Read only',location:'',allDay:true,
      startDate:'2026-11-26',endDateExclusive:'2026-11-27',
      start:'2026-11-25T23:00:00.000Z',end:'2026-11-26T23:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c30-hidden-busy',source:'ics',sourceCalendar:'C30 Hidden Lab',sourceKey:'C30 Hidden Lab|busy',
      title:'C30 Hidden busy import',description:'Hidden source retained',location:'',allDay:false,
      start:'2026-11-26T08:00:00.000Z',end:'2026-11-26T08:30:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(value=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(value)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-11-26')
  await page.getByRole('button',{name:'List',exact:true}).click()
  await page.getByRole('button',{name:'Open navigation'}).click()
  const hide=page.getByRole('button',{name:'Toggle imported calendar C30 Hidden Lab'})
  await hide.click()
  assert.equal(await hide.getAttribute('aria-pressed'),'false')
  await page.getByRole('button',{name:'Close navigation'}).click({position:{x:350,y:340}})
  const day=page.getByRole('article',{name:'Agenda for 2026-11-26'})
  await day.waitFor()
  assert.match(await day.innerText(),/55 events/)
  assert.equal(await day.locator('.event-chip').count(),12)
  const nav=day.getByRole('navigation',{name:'Event pages for 2026-11-26'})
  assert.match(await nav.innerText(),/Events 1–12 of 55/)
  assert.equal(await day.getByText('C30 Hidden busy import').count(),0)
  const allDay=day.getByRole('button',{name:/C30 Campus all-day notice/})
  await allDay.click()
  const details=page.getByRole('dialog',{name:'Event details'})
  await details.waitFor()
  assert.equal(await details.getByRole('button',{name:'Edit event'}).count(),0)
  await details.getByRole('button',{name:'Close event'}).click()
  const imported=day.getByRole('button',{name:/C30 Campus free seminar/})
  assert.match(await imported.innerText(),/Free \(non-blocking\)/)
  await imported.click()
  await details.waitFor()
  assert.match(await details.innerText(),/TRANSP:TRANSPARENT/)
  assert.equal(await details.getByRole('button',{name:'Edit event'}).count(),0)
  await details.getByRole('button',{name:'Close event'}).click()
  for(let i=0;i<4;i++)await day.getByRole('button',{name:'Next events on 2026-11-26'}).click()
  assert.match(await nav.innerText(),/Events 49–55 of 55 · Page 5 of 5/)
  assert.equal(await day.locator('.event-chip').count(),7)
  const last=day.getByRole('button',{name:/C30 Personal 052/})
  await last.click()
  await details.waitFor()
  assert.match(await details.innerText(),/Original 52/)
  await details.getByRole('button',{name:'Close event'}).click()
  await day.getByRole('button',{name:'Previous events on 2026-11-26'}).click()
  assert.match(await nav.innerText(),/Page 4 of 5/)
  await day.getByRole('button',{name:'Open graphical Day view'}).click()
  assert.equal(await page.locator('.view-switch button.active').innerText(),'Day')
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-11-26')
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture,
    'Agenda paging and Day view handoff must not rewrite canonical events')
  const dimensions=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(dimensions.scroll<=dimensions.w+2,'C30 mobile overflow '+JSON.stringify(dimensions))
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C30_MOBILE_AGENDA_ALL_55_EVENTS_READONLY_SOURCE_PAGES_DAY_HANDOFF_PASS')
  await context.close()
}
async function exerciseC30DesktopAgendaDetachedAndSourceFilteredPageClamping(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const many=Array.from({length:27},(_,i)=>({
    id:'c30-desktop-'+String(i).padStart(2,'0'),source:'personal',
    title:'C30 desktop slot '+i,description:'',location:'',allDay:false,
    start:'2026-11-26T10:00:00.000Z',end:'2026-11-26T10:30:00.000Z',
    updatedAt:'2026-10-18T09:00:00.000Z'
  }))
  const fixture={schemaVersion:1,records:[...many,
    {id:'c30-parent',source:'personal',title:'C30 parent recurrence',description:'',location:'',allDay:false,
      start:'2026-11-19T10:00:00.000Z',end:'2026-11-19T11:00:00.000Z',
      repeat:{frequency:'weekly',interval:1},excludedDates:['2026-11-26'],
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c30-detached',source:'personal',title:'C30 detached original',description:'Detachment preserved',
      location:'',allDay:false,start:'2026-11-26T11:00:00.000Z',end:'2026-11-26T11:30:00.000Z',
      recurrenceParentId:'c30-parent',recurrenceDate:'2026-11-26',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c30-free-ics',source:'ics',sourceCalendar:'C30 Clock',sourceKey:'C30 Clock|free',
      transparent:true,title:'C30 transparent readonly',description:'',location:'',allDay:false,
      start:'2026-11-26T08:00:00.000Z',end:'2026-11-26T08:30:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(value=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(value)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-11-26')
  await page.getByRole('button',{name:'List',exact:true}).click()
  const day=page.getByRole('article',{name:'Agenda for 2026-11-26'})
  assert.match(await day.innerText(),/29 events/)
  const nav=day.getByRole('navigation',{name:'Event pages for 2026-11-26'})
  await day.getByRole('button',{name:'Next events on 2026-11-26'}).click()
  await day.getByRole('button',{name:'Next events on 2026-11-26'}).click()
  assert.match(await nav.innerText(),/Events 25–29 of 29/)
  const detached=day.getByRole('button',{name:/C30 detached original/})
  await detached.click()
  const details=page.getByRole('dialog',{name:'Event details'})
  await details.waitFor()
  assert.match(await details.innerText(),/Original series date: 2026-11-26/)
  await details.getByRole('button',{name:'Close event'}).click()
  await page.locator('.sidebar .source-entry').filter({hasText:'Imported snapshots'}).click()
  assert.match(await day.innerText(),/1 event/)
  assert.equal(await day.locator('.event-chip').count(),1)
  assert.equal(await day.getByRole('navigation',{name:'Event pages for 2026-11-26'}).count(),0)
  assert.match(await day.innerText(),/C30 transparent readonly/)
  const desktopDay=day.getByRole('button',{name:'Open day view 2026-11-26'})
  await desktopDay.click()
  assert.equal(await page.locator('.view-switch button.active').innerText(),'Day')
  assert.equal(await page.getByLabel('Jump to date').inputValue(),'2026-11-26')
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C30_DESKTOP_AGENDA_DETACHED_CAS_SOURCE_FILTER_PAGING_CLAMP_PASS')
  await context.close()
}


async function exerciseC31MobileUnsavedEditorDismissalResetAndNewDraft(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const original={schemaVersion:1,records:[]}
  await page.evaluate(value=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(value)),original)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-11-26')
  await page.locator('.top-create').click()
  const editor=page.getByRole('dialog',{name:'New event'})
  await editor.waitFor()
  assert.equal(await editor.getByRole('button',{name:'Reset edits'}).count(),0)
  await editor.getByLabel('Event name').fill('C31 original mobile draft')
  await editor.getByLabel('Notes').fill('C31 confidential unsaved notes retained in memory')
  await editor.getByRole('button',{name:'Next day'}).click()
  assert.match(await editor.locator('.editor-unsaved-meta').innerText(),/Name/)
  assert.match(await editor.locator('.editor-unsaved-meta').innerText(),/Date or time/)
  assert.match(await editor.locator('.editor-unsaved-meta').innerText(),/Notes/)
  await editor.getByRole('button',{name:'Close editor'}).click()
  const warning=page.getByRole('alertdialog',{name:'Discard unsaved changes?'})
  await warning.waitFor()
  assert.match(await warning.innerText(),/Name, Date or time, Notes/)
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),original)
  await warning.getByRole('button',{name:'Keep editing'}).click()
  await warning.waitFor({state:'hidden'})
  assert.equal(await editor.getByLabel('Event name').inputValue(),'C31 original mobile draft')
  assert.equal(await editor.getByLabel('Notes').inputValue(),'C31 confidential unsaved notes retained in memory')
  await editor.getByLabel('Notes').press('Escape')
  await warning.waitFor()
  await warning.getByRole('button',{name:'Keep editing'}).press('Escape')
  await warning.waitFor({state:'hidden'})
  assert.equal(await editor.getByLabel('Event name').inputValue(),'C31 original mobile draft')
  await page.locator('.modal-backdrop').first().click({position:{x:3,y:3}})
  await warning.waitFor()
  await warning.getByRole('button',{name:'Keep editing'}).click()
  await editor.getByRole('button',{name:'Reset edits'}).click()
  assert.equal(await editor.getByRole('button',{name:'Reset edits'}).count(),0)
  assert.equal(await editor.getByLabel('Event name').inputValue(),'')
  assert.equal(await editor.getByLabel('Notes').inputValue(),'')
  assert.equal(await editor.locator('input[type="datetime-local"]').first().inputValue(),'2026-11-26T09:00')
  await editor.getByRole('button',{name:'Cancel'}).click()
  await editor.waitFor({state:'hidden'})
  assert.equal(await warning.count(),0)
  await page.locator('.top-create').click()
  const second=page.getByRole('dialog',{name:'New event'})
  await second.getByLabel('Event name').fill('C31 explicitly discarded')
  await second.getByRole('button',{name:'Cancel'}).click()
  await warning.waitFor()
  await warning.getByRole('button',{name:'Discard changes'}).click()
  await second.waitFor({state:'hidden'})
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),original)
  const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(dimensions.scroll<=dimensions.width+2,'C31 mobile viewport overflow '+JSON.stringify(dimensions))
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C31_MOBILE_DIRTY_EDITOR_CANCEL_ESCAPE_BACKDROP_RESET_NO_WRITES_PASS')
  await context.close()
}
async function exerciseC31DesktopDetachedOriginalEditAndImportedSourceIntact(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const fixture={schemaVersion:1,records:[
    {id:'c31-parent',source:'personal',title:'C31 original parent',description:'unchanged',
      location:'',allDay:false,start:'2026-11-19T09:00:00.000Z',
      end:'2026-11-19T10:00:00.000Z',repeat:{frequency:'weekly',interval:1},
      excludedDates:['2026-11-26'],updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c31-detached',source:'personal',title:'C31 original detached',description:'original notes',
      location:'Original room',allDay:false,start:'2026-11-26T13:00:00.000Z',
      end:'2026-11-26T14:00:00.000Z',recurrenceParentId:'c31-parent',
      recurrenceDate:'2026-11-26',updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c31-readonly',source:'ics',sourceCalendar:'C31 Campus',sourceKey:'C31 Campus|unchanged',
      title:'C31 transparent readonly',description:'Original imported',
      location:'',allDay:false,transparent:true,start:'2026-11-26T10:00:00.000Z',
      end:'2026-11-26T10:30:00.000Z',updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(x=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(x)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-11-26')
  await page.locator('.view-switch button').filter({hasText:'Day'}).click()
  await page.locator('.timeline-block').filter({hasText:'C31 original detached'}).click()
  await page.getByRole('dialog',{name:'Event details'}).getByRole('button',{name:'Edit event'}).click()
  const editor=page.getByRole('dialog',{name:'Edit event'})
  await editor.waitFor()
  await editor.getByLabel('Location').fill('Changed but not committed room')
  await editor.getByLabel('Notes').fill('Changed but not committed notes')
  assert.match(await editor.locator('.editor-unsaved-meta').innerText(),/Location/)
  assert.match(await editor.locator('.editor-unsaved-meta').innerText(),/Notes/)
  await editor.getByRole('button',{name:'Cancel'}).click()
  const warning=page.getByRole('alertdialog',{name:'Discard unsaved changes?'})
  await warning.waitFor()
  await warning.getByRole('button',{name:'Keep editing'}).click()
  assert.equal(await editor.getByLabel('Notes').inputValue(),'Changed but not committed notes')
  await editor.getByRole('button',{name:'Close editor'}).click()
  await warning.waitFor()
  await warning.getByRole('button',{name:'Discard changes'}).click()
  await editor.waitFor({state:'hidden'})
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  await page.locator('.timeline-block.imported').filter({hasText:'C31 transparent readonly'}).click()
  const details=page.getByRole('dialog',{name:'Event details'})
  assert.match(await details.innerText(),/TRANSP:TRANSPARENT/)
  assert.equal(await details.getByRole('button',{name:'Edit event'}).count(),0)
  await details.getByRole('button',{name:'Close event'}).click()
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C31_DESKTOP_DETACHED_ORIGINAL_UNSAVED_REVIEW_READONLY_SOURCE_PASS')
  await context.close()
}


async function exerciseC32MobileLiveOriginalEventsAndHiddenBusySource(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const {fixture,today}=await page.evaluate(()=>{
    const now=new Date(),ms=now.getTime(),mk=offset=>new Date(ms+offset*60000).toISOString()
    const day=offset=>{const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset);
      return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
    const midnight=offset=>new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset).toISOString()
    const updatedAt=new Date(ms-200000).toISOString()
    return {today:day(0),fixture:{schemaVersion:1,records:[
      {id:'c32-current-original',source:'personal',title:'C32 Current appointment',description:'Keep canonical',
        location:'',allDay:false,start:mk(-10),end:mk(180),updatedAt},
      {id:'c32-next-original',source:'personal',title:'C32 Next upcoming personal',description:'',
        location:'',allDay:false,start:mk(100),end:mk(160),updatedAt},
      {id:'c32-visible-free',source:'ics',sourceCalendar:'C32 Campus',sourceKey:'C32 Campus|free-uid',
        title:'C32 Free imported',description:'Original TRANSP',location:'',allDay:false,transparent:true,
        start:mk(70),end:mk(90),updatedAt},
      {id:'c32-hidden-opaque',source:'ics',sourceCalendar:'C32 Hidden Clinic',
        sourceKey:'C32 Hidden Clinic|busy-uid',title:'C32 Busy hidden original',description:'',
        location:'',allDay:false,start:mk(40),end:mk(110),updatedAt},
      {id:'c32-all-day',source:'ics',sourceCalendar:'C32 Campus',sourceKey:'C32 Campus|all-day',
        title:'C32 Today all-day information',description:'Read-only source',location:'',allDay:true,
        startDate:day(-1),endDateExclusive:day(2),start:midnight(-1),end:midnight(2),updatedAt}
    ]}}
  })
  await page.evaluate(x=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(x)),fixture)
  await page.reload({waitUntil:'networkidle'})
  const panel=page.getByRole('region',{name:'Now and next visible calendar events'})
  await panel.waitFor()
  assert.match(await panel.innerText(),/Happening now/)
  assert.match(await panel.innerText(),/C32 Current appointment/)
  assert.match(await panel.innerText(),/C32 Next upcoming personal/)
  assert.match(await panel.innerText(),/C32 Today all-day information/)
  assert.match(await panel.innerText(),/C32 Busy hidden original/)
  await page.getByRole('button',{name:'Open navigation'}).click()
  const hide=page.getByRole('button',{name:'Toggle imported calendar C32 Hidden Clinic'})
  await hide.click()
  assert.equal(await hide.getAttribute('aria-pressed'),'false')
  await page.getByRole('button',{name:'Close navigation'}).click({position:{x:350,y:340}})
  assert.equal(await panel.getByText('C32 Busy hidden original').count(),0)
  assert.match(await panel.innerText(),/C32 Free imported/)
  const free=panel.getByRole('button',{name:'Open details c32-visible-free@'+today})
  await free.click()
  const details=page.getByRole('dialog',{name:'Event details'})
  await details.waitFor()
  assert.match(await details.innerText(),/TRANSP:TRANSPARENT/)
  assert.equal(await details.getByRole('button',{name:'Edit event'}).count(),0)
  await details.getByRole('button',{name:'Close event'}).click()
  await panel.getByRole('button',{name:'Open day for c32-current-original@'+today}).click()
  assert.equal(await page.locator('.view-switch button.active').innerText(),'Day')
  assert.equal(await page.getByLabel('Jump to date').inputValue(),today)
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  const dimensions=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(dimensions.scroll<=dimensions.w+2,'C32 mobile body overflow '+JSON.stringify(dimensions))
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C32_MOBILE_LIVE_CURRENT_UPCOMING_ALLDAY_TRANSP_HIDDEN_BUSY_NO_WRITES_PASS')
  await context.close()
}
async function exerciseC32DesktopDetachedRecurrenceAndSearchScopedNowNext(){
  const context=await browser.newContext({viewport:{width:1440,height:900},
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const {fixture,detachedDate}=await page.evaluate(()=>{
    const now=new Date(),minutes=now.getTime(),tomorrow=new Date(minutes+75*60000)
    const dateFor=value=>{const d=new Date(value);
      return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
    const startDay=dateFor(tomorrow)
    const excludedDay=new Date(tomorrow.getFullYear(),tomorrow.getMonth(),tomorrow.getDate()+7)
    const childDay=new Date(tomorrow.getFullYear(),tomorrow.getMonth(),tomorrow.getDate()+8)
    const detachedDate=dateFor(childDay)
    const childStart=new Date(childDay.getFullYear(),childDay.getMonth(),childDay.getDate(),14,0)
    return {detachedDate,fixture:{schemaVersion:1,records:[
      {id:'c32-parent-original',source:'personal',title:'C32 Recurring parent',
        description:'Original weekly parent',location:'',allDay:false,
        start:tomorrow.toISOString(),end:new Date(minutes+135*60000).toISOString(),
        repeat:{frequency:'weekly',interval:1},excludedDates:[dateFor(excludedDay)],
        updatedAt:new Date(minutes-60000).toISOString()},
      {id:'c32-detached-original',source:'personal',title:'C32 Detached next week',
        description:'Original detached',location:'',allDay:false,
        start:childStart.toISOString(),end:new Date(childStart.getTime()+3600000).toISOString(),
        recurrenceParentId:'c32-parent-original',recurrenceDate:dateFor(excludedDay),
        updatedAt:new Date(minutes-60000).toISOString()}
    ]}}
  })
  await page.evaluate(x=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(x)),fixture)
  await page.reload({waitUntil:'networkidle'})
  const panel=page.getByRole('region',{name:'Now and next visible calendar events'})
  assert.match(await panel.innerText(),/C32 Recurring parent/)
  assert.match(await panel.innerText(),/C32 Detached next week/)
  await page.getByLabel('Search calendar events').fill('C32 missing exact')
  assert.match(await panel.innerText(),/No visible ongoing or upcoming events/)
  await page.getByLabel('Search calendar events').fill('C32 Detached next week')
  assert.equal(await panel.getByText('C32 Recurring parent').count(),0)
  assert.match(await panel.innerText(),/C32 Detached next week/)
  await panel.getByRole('button',{name:'Open day for c32-detached-original@'+detachedDate}).click()
  assert.equal(await page.locator('.view-switch button.active').innerText(),'Day')
  assert.equal(await page.getByLabel('Jump to date').inputValue(),detachedDate)
  await panel.getByRole('button',{name:'Open details c32-detached-original@'+detachedDate}).click()
  const details=page.getByRole('dialog',{name:'Event details'})
  await details.waitFor()
  assert.match(await details.innerText(),/Original series date:/)
  await details.getByRole('button',{name:'Close event'}).click()
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C32_DESKTOP_LIVE_SEARCH_SCOPE_DETACHED_RECURRING_ORIGINAL_NO_WRITES_PASS')
  await context.close()
}


async function exerciseC33MobileAllImportedSourcesSearchBulkOnlyAndHiddenBusy(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const imported=Array.from({length:13},(_,i)=>({
    id:'c33-import-'+String(i).padStart(2,'0'),source:'ics',
    sourceCalendar:'C33 Campus '+String(i).padStart(2,'0'),
    sourceKey:'C33 Campus UID '+i,title:'C33 Imported lecture '+String(i).padStart(2,'0'),
    description:'Original read-only entry',location:'',allDay:false,
    start:new Date(Date.UTC(2026,10,26,8+i,0)).toISOString(),
    end:new Date(Date.UTC(2026,10,26,8+i,30)).toISOString(),
    updatedAt:'2026-10-18T09:00:00.000Z'
  }))
  const fixture={schemaVersion:1,records:[...imported,
    {id:'c33-clinic-hidden-busy',source:'ics',sourceCalendar:'C33 Clinic',
      sourceKey:'C33 Clinic|opaque-source-uid',title:'C33 Hidden busy clinic',
      description:'Opaque original',location:'',allDay:false,
      start:'2026-11-26T09:00:00.000Z',end:'2026-11-26T10:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c33-personal-original',source:'personal',title:'C33 Personal original',
      description:'Private source remains',location:'',allDay:false,
      start:'2026-11-26T06:00:00.000Z',end:'2026-11-26T07:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(x=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(x)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:'Open navigation'}).click()
  assert.match(await page.locator('.sidebar').innerText(),/9 additional imported calendars/)
  await page.getByRole('button',{name:/Manage sources/}).click()
  const dialog=page.getByRole('dialog',{name:'Calendar data management'})
  await dialog.waitFor()
  const picker=dialog.getByRole('region',{name:'Imported source picker'})
  assert.match(await picker.innerText(),/14 shown · 0 hidden · 14 imported calendars/)
  assert.equal(await picker.locator('.source-picker-list .source-card').count(),8)
  await picker.getByRole('button',{name:'Next sources'}).click()
  assert.match(await picker.getByRole('navigation',{name:'Imported source pages'}).innerText(),/Sources 9–14 of 14/)
  assert.match(await picker.innerText(),/C33 Campus 12/)
  await picker.getByRole('button',{name:'Previous sources'}).click()
  const search=picker.getByLabel('Find imported source')
  await search.fill('C33 Campus 1')
  assert.equal(await picker.locator('.source-picker-list .source-card').count(),3)
  assert.match(await picker.innerText(),/3 matching sources/)
  await picker.getByRole('button',{name:'Only matching imports'}).click()
  assert.match(await picker.innerText(),/3 shown · 11 hidden · 14 imported calendars/)
  const names=await picker.locator('.source-picker-list .source-card .source-card-name').allTextContents()
  assert.deepEqual(names,['C33 Campus 10','C33 Campus 11','C33 Campus 12'])
  await dialog.getByRole('button',{name:'Close sources'}).click()
  await page.getByLabel('Jump to date').fill('2026-11-26')
  await page.getByRole('button',{name:'List',exact:true}).click()
  const agenda=page.getByRole('region',{name:'Upcoming agenda'})
  await agenda.getByRole('article',{name:'Agenda for 2026-11-26'}).waitFor()
  const row=agenda.getByRole('article',{name:'Agenda for 2026-11-26'})
  assert.match(await row.innerText(),/4 events/)
  assert.match(await row.innerText(),/C33 Personal original/)
  assert.match(await row.innerText(),/C33 Imported lecture 10/)
  assert.equal(await row.getByText('C33 Hidden busy clinic').count(),0)
  // Original all-source review still sees hidden ICS opaque blocks.
  await page.locator('.top-create').click()
  const editor=page.getByRole('dialog',{name:'New event'})
  await editor.getByLabel('Event name').fill('C33 proposed conflicting appointment')
  await editor.getByLabel('Starts').fill('2026-11-26T10:00')
  await editor.getByLabel('Ends').fill('2026-11-26T11:00')
  assert.match(await editor.getByLabel('Calendar conflict review').innerText(),/C33 Hidden busy clinic/)
  await editor.getByRole('button',{name:'Cancel'}).click()
  await page.getByRole('alertdialog',{name:'Discard unsaved changes?'}).getByRole('button',{name:'Discard changes'}).click()
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.view-preferences.v1')))
  assert.equal(prefs.hiddenImportedCalendars.length,11)
  const sizes=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth}))
  assert.ok(sizes.scroll<=sizes.w+2,'C33 mobile source manager overflow: '+JSON.stringify(sizes))
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C33_MOBILE_SOURCE_SEARCH_PAGED_BULK_ONLY_HIDDEN_BUSY_CONFLICT_NO_WRITES_PASS')
  await context.close()
}
async function exerciseC33DesktopSourceExactNamesFilteringAndPreferenceContinuity(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const names=['__proto__','constructor',...Array.from({length:16},(_,i)=>'C33 Team '+String(i).padStart(2,'0'))]
  const fixture={schemaVersion:1,records:names.map((name,i)=>({
    id:'c33-exact-'+i,source:'ics',sourceCalendar:name,
    sourceKey:'Original source UID '+i,title:'C33 exact source '+name,description:'',
    location:'',allDay:false,...(i===0?{transparent:true}:{}),
    start:'2026-11-26T08:00:00.000Z',end:'2026-11-26T09:00:00.000Z',
    updatedAt:'2026-10-18T09:00:00.000Z'
  }))}
  await page.evaluate(x=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(x)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:/Manage sources/}).click()
  const dialog=page.getByRole('dialog',{name:'Calendar data management'})
  const picker=dialog.getByRole('region',{name:'Imported source picker'})
  assert.match(await picker.innerText(),/18 shown · 0 hidden · 18 imported calendars/)
  await picker.getByLabel('Find imported source').fill('__proto__')
  assert.equal(await picker.locator('.source-picker-list .source-card').count(),1)
  await picker.getByRole('button',{name:'Hide matching'}).click()
  assert.equal(await picker.getByLabel('Show __proto__ on calendar').isChecked(),false)
  await picker.getByLabel('Find imported source').fill('C33 Team 1')
  assert.match(await picker.innerText(),/6 matching sources/)
  await picker.getByRole('button',{name:'Only matching imports'}).click()
  assert.match(await picker.innerText(),/6 shown · 12 hidden · 18 imported calendars/)
  await picker.getByLabel('Find imported source').fill('no calendar could match')
  assert.match(await picker.innerText(),/No imported calendars match this name/)
  assert.equal(await picker.getByRole('button',{name:'Hide matching'}).isDisabled(),true)
  await picker.getByLabel('Find imported source').fill('C33 Team')
  await picker.getByRole('button',{name:'Show matching'}).click()
  assert.match(await picker.innerText(),/16 shown · 2 hidden · 18 imported calendars/)
  await dialog.getByRole('button',{name:'Close sources'}).click()
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('button',{name:/Manage sources/}).click()
  const again=page.getByRole('dialog',{name:'Calendar data management'})
  assert.match(await again.getByRole('region',{name:'Imported source picker'}).innerText(),/16 shown · 2 hidden · 18 imported calendars/)
  await again.getByRole('button',{name:'Close sources'}).click()
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C33_DESKTOP_LITERAL_SOURCE_NAMES_SEARCH_SHOW_HIDE_PREFERENCE_RELOAD_PASS')
  await context.close()
}


async function exerciseC34MobilePersistedDraftReviewAndCommit(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const original={schemaVersion:1,records:[]}
  await page.evaluate(value=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(value)),original)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-11-26')
  await page.locator('.top-create').click()
  const editor=page.getByRole('dialog',{name:'New event'})
  await editor.getByLabel('Event name').fill('C34 interrupted mobile draft')
  await editor.getByLabel('Notes').fill('Offline work · 한국어 and Français')
  await editor.getByRole('button',{name:'Next day'}).click()
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('thiepn.calendar.event-draft.v1')||'null')?.fields?.title==='C34 interrupted mobile draft')
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),original)
  await page.reload({waitUntil:'networkidle'})
  const resume=page.getByRole('dialog',{name:'Recover unfinished event'})
  await resume.waitFor()
  assert.match(await resume.innerText(),/C34 interrupted mobile draft/)
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),original)
  await resume.getByRole('button',{name:'Review recovered draft'}).click()
  const recovered=page.getByRole('dialog',{name:'New event'})
  await recovered.waitFor()
  assert.equal(await recovered.getByLabel('Event name').inputValue(),'C34 interrupted mobile draft')
  assert.equal(await recovered.getByLabel('Notes').inputValue(),'Offline work · 한국어 and Français')
  assert.equal(await recovered.locator('input[type="datetime-local"]').first().inputValue(),'2026-11-27T09:00')
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),original)
  await recovered.getByRole('button',{name:'Create event'}).click()
  await recovered.waitFor({state:'hidden'})
  const actual=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.equal(actual.records.length,1)
  assert.equal(actual.records[0].title,'C34 interrupted mobile draft')
  assert.equal(actual.records[0].description,'Offline work · 한국어 and Français')
  assert.equal(await page.evaluate(()=>localStorage.getItem('thiepn.calendar.event-draft.v1')),null)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C34_MOBILE_DRAFT_RELOAD_EXPLICIT_REVIEW_COMMIT_PASS')
  await context.close()
}
async function exerciseC34DesktopRecurringResumeAndStaleBlock(){
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const fixture={schemaVersion:1,records:[
    {id:'c34-series',title:'C34 series original',description:'parent',location:'',source:'personal',
      allDay:false,start:'2026-11-23T09:00:00.000Z',end:'2026-11-23T10:00:00.000Z',
      repeat:{frequency:'weekly',interval:1},updatedAt:'2026-10-19T03:00:00.000Z'},
    {id:'c34-imported',title:'C34 untouched ICS',description:'',location:'',source:'ics',
      sourceCalendar:'University',sourceKey:'c34-original-UID',transparent:true,allDay:false,
      start:'2026-11-23T11:00:00.000Z',end:'2026-11-23T12:00:00.000Z',updatedAt:'2026-10-19T03:00:00.000Z'}
  ]}
  await page.evaluate(value=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(value)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-11-23')
  await page.locator('.view-switch button').filter({hasText:'Day'}).click()
  await page.locator('.timeline-block').filter({hasText:'C34 series original'}).click()
  await page.getByRole('dialog',{name:'Event details'}).getByRole('button',{name:'Edit this occurrence'}).click()
  const editor=page.getByRole('dialog',{name:'Edit one occurrence'})
  await editor.getByLabel('Notes').fill('C34 recovered detached notes')
  await page.waitForFunction(()=>Boolean(JSON.parse(localStorage.getItem('thiepn.calendar.event-draft.v1')||'null')?.origin?.instance))
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByRole('dialog',{name:'Recover unfinished event'}).getByRole('button',{name:'Review recovered draft'}).click()
  const continued=page.getByRole('dialog',{name:'Edit one occurrence'})
  assert.equal(await continued.getByLabel('Notes').inputValue(),'C34 recovered detached notes')
  await continued.getByRole('button',{name:'Save this occurrence'}).click()
  await continued.waitFor({state:'hidden'})
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.equal(saved.records.length,3)
  assert.deepEqual(saved.records.find(r=>r.id==='c34-series').excludedDates,['2026-11-23'])
  assert.equal(saved.records.find(r=>r.recurrenceParentId==='c34-series').recurrenceDate,'2026-11-23')
  assert.equal(saved.records.find(r=>r.recurrenceParentId==='c34-series').description,'C34 recovered detached notes')
  assert.deepEqual(saved.records.find(r=>r.id==='c34-imported'),fixture.records[1])
  assert.equal(await page.evaluate(()=>localStorage.getItem('thiepn.calendar.event-draft.v1')),null)
  await page.locator('.timeline-block').filter({hasText:'C34 series original'}).first().click()
  await page.getByRole('dialog',{name:'Event details'}).getByRole('button',{name:'Edit event'}).click()
  const detached=page.getByRole('dialog',{name:'Edit event'})
  await detached.getByLabel('Location').fill('Uncommitted elsewhere')
  await page.waitForFunction(()=>Boolean(localStorage.getItem('thiepn.calendar.event-draft.v1')))
  await page.reload({waitUntil:'networkidle'})
  const changed=await page.evaluate(()=>{
    const state=JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))
    const item=state.records.find(r=>r.recurrenceParentId==='c34-series')
    item.description='Newer tab update';item.updatedAt=new Date().toISOString()
    localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(state))
    return state
  })
  const prompt=page.getByRole('dialog',{name:'Recover unfinished event'})
  await prompt.getByRole('button',{name:'Review recovered draft'}).click()
  assert.match(await prompt.getByRole('alert').innerText(),/original event changed/)
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1'))),changed)
  await prompt.getByRole('button',{name:'Discard unfinished draft'}).click()
  await prompt.waitFor({state:'hidden'})
  assert.equal(await page.evaluate(()=>localStorage.getItem('thiepn.calendar.event-draft.v1')),null)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C34_DESKTOP_RECURRING_ID_RESUME_STALE_EDIT_BLOCK_NO_ICS_WRITES_PASS')
  await context.close()
}


async function exerciseC35MobileIanaClockReloadAndTravel(){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-11-26')
  await page.locator('.top-create').click()
  const editor=page.getByRole('dialog',{name:'New event'})
  await editor.getByLabel('Event name').fill('C35 original Seoul appointment')
  await editor.getByLabel('Notes').fill('Original source travel calendar')
  await editor.getByLabel('Time zone change behavior').selectOption('wall')
  await editor.getByLabel('Event time zone').selectOption('Asia/Seoul')
  assert.equal(await editor.locator('input[type="datetime-local"]').first().inputValue(),'2026-11-26T09:00')
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('thiepn.calendar.event-draft.v1')||'null')?.fields?.timeZone==='Asia/Seoul')
  await page.reload({waitUntil:'networkidle'})
  const prompt=page.getByRole('dialog',{name:'Recover unfinished event'})
  await prompt.getByRole('button',{name:'Review recovered draft'}).click()
  const recovered=page.getByRole('dialog',{name:'New event'})
  assert.equal(await recovered.getByLabel('Event time zone').inputValue(),'Asia/Seoul')
  assert.equal(await recovered.getByLabel('Notes').inputValue(),'Original source travel calendar')
  await recovered.getByRole('button',{name:'Create event'}).click()
  await recovered.waitFor({state:'hidden'})
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  assert.equal(saved.records.length,1)
  assert.equal(saved.records[0].timeZone,'Asia/Seoul')
  assert.equal(saved.records[0].start,'2026-11-26T00:00:00.000Z')
  assert.equal(saved.records[0].end,'2026-11-26T01:00:00.000Z')
  assert.equal(await page.evaluate(()=>localStorage.getItem('thiepn.calendar.event-draft.v1')),null)
  const prior=JSON.stringify(saved)
  const stored=await context.storageState()
  const traveler=await browser.newContext({storageState:stored,viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,timezoneId:'America/Los_Angeles',locale:'en-GB'})
  const traveled=await traveler.newPage()
  traveled.on('pageerror',error=>errors.push(error.message))
  await traveled.goto(url,{waitUntil:'networkidle'})
  assert.equal(await traveled.evaluate(()=>localStorage.getItem('thiepn.calendar.local.v1')),prior,
    'Device timezone change must not rebase canonical saved UTC instants')
  await traveled.getByLabel('Jump to date').fill('2026-11-25')
  await traveled.locator('.view-switch button').filter({hasText:'Day'}).click()
  await traveled.locator('.timeline-block').filter({hasText:'C35 original Seoul appointment'}).first().click()
  const details=traveled.getByRole('dialog',{name:'Event details'})
  assert.match(await details.innerText(),/Asia\/Seoul/)
  assert.match(await details.innerText(),/2026-11-26T09:00/)
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C35_MOBILE_IANA_DRAFT_RECOVERY_CROSS_ZONE_STABLE_UTC_PASS')
  await traveler.close();await context.close()
}
async function exerciseC35DesktopRecurrenceOriginalZoneAndKeepInstant(){
  const context=await browser.newContext({viewport:{width:1440,height:900},
    timezoneId:'Europe/Berlin',locale:'en-GB'})
  const page=await context.newPage(),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(url,{waitUntil:'networkidle'})
  const fixture={schemaVersion:1,records:[
    {id:'c35-original-series',source:'personal',title:'C35 Berlin morning series',
      description:'Authored in Berlin',location:'',allDay:false,timeZone:'Europe/Berlin',
      start:'2026-03-28T08:00:00.000Z',end:'2026-03-28T09:00:00.000Z',
      repeat:{frequency:'daily',interval:1},updatedAt:'2026-10-18T09:00:00.000Z'},
    {id:'c35-ics',source:'ics',sourceCalendar:'University',sourceKey:'unchanged-original-UID',
      title:'C35 read-only ICS',description:'',location:'',allDay:false,
      start:'2026-03-30T09:00:00.000Z',end:'2026-03-30T10:00:00.000Z',
      updatedAt:'2026-10-18T09:00:00.000Z'}
  ]}
  await page.evaluate(data=>localStorage.setItem('thiepn.calendar.local.v1',JSON.stringify(data)),fixture)
  await page.reload({waitUntil:'networkidle'})
  await page.getByLabel('Jump to date').fill('2026-03-30')
  await page.locator('.view-switch button').filter({hasText:'Day'}).click()
  await page.locator('.timeline-block').filter({hasText:'C35 Berlin morning series'}).first().click()
  await page.getByRole('dialog',{name:'Event details'}).getByRole('button',{name:'Edit this occurrence'}).click()
  const editor=page.getByRole('dialog',{name:'Edit one occurrence'})
  assert.equal(await editor.getByLabel('Event time zone').inputValue(),'Europe/Berlin')
  assert.equal(await editor.locator('input[type="datetime-local"]').first().inputValue(),'2026-03-30T09:00')
  await editor.getByLabel('Time zone change behavior').selectOption('instant')
  await editor.getByLabel('Event time zone').selectOption('Asia/Seoul')
  assert.equal(await editor.locator('input[type="datetime-local"]').first().inputValue(),'2026-03-30T16:00')
  assert.equal(await editor.locator('input[type="datetime-local"]').nth(1).inputValue(),'2026-03-30T17:00')
  await editor.getByRole('button',{name:'Save this occurrence'}).click()
  await editor.waitFor({state:'hidden'})
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('thiepn.calendar.local.v1')))
  const master=saved.records.find(x=>x.id==='c35-original-series')
  const detached=saved.records.find(x=>x.recurrenceParentId==='c35-original-series')
  assert.equal(master.timeZone,'Europe/Berlin')
  assert.deepEqual(master.excludedDates,['2026-03-30'])
  assert.equal(detached.recurrenceDate,'2026-03-30')
  assert.equal(detached.timeZone,'Asia/Seoul')
  assert.equal(detached.start,'2026-03-30T07:00:00.000Z')
  assert.deepEqual(saved.records.find(x=>x.id==='c35-ics'),fixture.records[1])
  assert.equal(errors.length,0,errors.join('; '))
  console.log('BROWSER_C35_DESKTOP_IANA_RECURRENCE_KEEP_INSTANT_ORIGINAL_IDS_PASS')
  await context.close()
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
  await exerciseC15OrdinalAnnualAndTwoIndependentSources()
  await exerciseC15MobileSourceVisibilityAndAccountBoundaries()
  await exerciseC16FiniteMonthlySetPosAndSourceClockGuard()
  await exerciseC16MobileMonthlySourceAndNoFalseEventEdits()
  await exerciseC17ImportChangeReviewAndStructureGuardDesktop()
  await exerciseC17MobileSourceReviewWithoutWrites()
  await exerciseC18DesktopReviewedPrivateIcsSharing()
  await exerciseC18MobileFullExportAndStaleGuard()
  await exerciseC19ExactSnoozeDesktopAndOldSource()
  await exerciseC19MobileCustomSnoozeStaleSourceGuard()
  await exerciseC20DesktopSafeAlternativesAndActualSave()
  await exerciseC20MobileRecurringAlternativesAndStaleSourceGuard()
  await exerciseC21DesktopTransparentSourceReview()
  await exerciseC21MobileFreeBusyFinder()
  await exerciseC22MobileFocusedWeekOriginalIdentityAndDST()
  await exerciseC22DesktopUnchangedFullWeek()
  await exerciseC23MobileQuickDraftAndOriginalEdit()
  await exerciseC23MobileDstAndAllDayGuard()
  await exerciseC23DesktopEditorUnchanged()
  await exerciseC24MobileSearchPageNavigationAndCanonicalDetails()
  await exerciseC24DesktopReverseSearchPagesAndFilterReset()
  await exerciseC25MobileReadOnlySourceAndDetachedEventBrowsing()
  await exerciseC25DesktopSourceFilteredNavigationAndNoWrites()
  await exerciseC26MobileContextualSingleDayFinderOriginalSources()
  await exerciseC26DesktopFinderDayWindowAndStaleStorageGuard()
  await exerciseC27MobileMonthOverflowAllCanonicalEventsAndSafeHandoffs()
  await exerciseC27DesktopMonthFilterAndDetachedOriginalIdentity()
  await exerciseC28MobileSkipEmptyAgendaReadOnlyFreeAndHiddenSource()
  await exerciseC28DesktopAgendaAllDayContinuationAndBoundedEmpty()
  await exerciseC29MobileDayOriginalAppointmentNavigatorAndDensePagination()
  await exerciseC29DesktopRepeatedDstTimeNavigationAndReadOnlyOriginal()
  await exerciseC30MobileAgendaDenseOriginalEventsAndDayDrilldown()
  await exerciseC30DesktopAgendaDetachedAndSourceFilteredPageClamping()
  await exerciseC31MobileUnsavedEditorDismissalResetAndNewDraft()
  await exerciseC31DesktopDetachedOriginalEditAndImportedSourceIntact()
  await exerciseC32MobileLiveOriginalEventsAndHiddenBusySource()
  await exerciseC32DesktopDetachedRecurrenceAndSearchScopedNowNext()
  await exerciseC33MobileAllImportedSourcesSearchBulkOnlyAndHiddenBusy()
  await exerciseC33DesktopSourceExactNamesFilteringAndPreferenceContinuity()
  await exerciseC34MobilePersistedDraftReviewAndCommit()
  await exerciseC34DesktopRecurringResumeAndStaleBlock()
  await exerciseC35MobileIanaClockReloadAndTravel()
  await exerciseC35DesktopRecurrenceOriginalZoneAndKeepInstant()
  console.log('CHROMIUM_DESKTOP_MOBILE_PASS')
}catch(error){
  failed=true
  console.error('CHROMIUM_ACCEPTANCE_FAIL',error)
}finally{
  if(browser)await browser.close()
  server.kill('SIGTERM')
}
if(failed)process.exitCode=1
