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
  await page.getByRole('button',{name:'Create event'}).click()
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
  assert.equal(new Date(moved.start).getHours(),10)
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

let failed=false
try{
  await ready()
  browser=await chromium.launch({headless:true,args:['--no-sandbox']})
  await exerciseDesktop()
  await exerciseMobile()
  await exerciseGesturesDesktop()
  await exerciseTouchDragMobile()
  console.log('CHROMIUM_DESKTOP_MOBILE_PASS')
}catch(error){
  failed=true
  console.error('CHROMIUM_ACCEPTANCE_FAIL',error)
}finally{
  if(browser)await browser.close()
  server.kill('SIGTERM')
}
if(failed)process.exitCode=1
