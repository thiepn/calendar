import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {setTimeout as sleep} from 'node:timers/promises'
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
  console.log('CHROMIUM_DESKTOP_MOBILE_PASS')
}catch(error){
  failed=true
  console.error('CHROMIUM_ACCEPTANCE_FAIL',error)
}finally{
  if(browser)await browser.close()
  server.kill('SIGTERM')
}
if(failed)process.exitCode=1
