import {describe,it,expect} from 'vitest'
import {previewIcs,mergeIcs} from './ics'
import {reviewImportedChanges} from './ics-change-review'
import {validateState} from './storage'
import {embeddedTimeZones} from './ics-vtimezone'

const declarations=[
  'BEGIN:VTIMEZONE','TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT','DTSTART:20260329T020000','TZOFFSETFROM:+0100','TZOFFSETTO:+0200',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','END:DAYLIGHT',
  'BEGIN:STANDARD','DTSTART:20261025T030000','TZOFFSETFROM:+0200','TZOFFSETTO:+0100',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','END:STANDARD','END:VTIMEZONE'
].join('\r\n')
const master=[
  'BEGIN:VEVENT','UID:source-vtimezone@example.test','SUMMARY:Campus seminar',
  'DTSTART;TZID=Europe/Berlin:20260328T090000','DTEND;TZID=Europe/Berlin:20260328T100000',
  'RRULE:FREQ=DAILY;COUNT=3','END:VEVENT'
].join('\r\n')
const envelope=(events:string,zone=declarations)=>[
  'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Generated source fixture//Calendar//EN',
  'X-WR-CALNAME:Campus ICS',zone,events,'END:VCALENDAR'
].filter(Boolean).join('\r\n')

describe('C36 guarded IANA VTIMEZONE and imported event provenance',()=>{
  it('reads common standards/daylight observances and keeps original source TZID across DST',()=>{
    const preview=previewIcs(envelope(master))
    expect(preview.skippedEvents).toBe(0)
    expect(preview.records).toHaveLength(3)
    expect(preview.records.map(r=>r.sourceTimeZone)).toEqual(Array(3).fill('Europe/Berlin'))
    expect(preview.records.map(r=>r.start)).toEqual([
      '2026-03-28T08:00:00.000Z','2026-03-29T07:00:00.000Z','2026-03-30T07:00:00.000Z'])
    expect(preview.records.every(r=>r.source==='ics'&&!r.timeZone)).toBe(true)
    expect(preview.warnings.some(w=>w.includes('not independently applied'))).toBe(true)
  })
  it('retains stable original UTC recurrence source keys when a detached occurrence moves',()=>{
    const moved=[
      'BEGIN:VEVENT','UID:source-vtimezone@example.test',
      'RECURRENCE-ID;TZID=Europe/Berlin:20260330T090000',
      'DTSTART;TZID=Europe/Berlin:20260330T113000',
      'DTEND;TZID=Europe/Berlin:20260330T123000','SUMMARY:Revised campus seminar',
      'END:VEVENT'
    ].join('\r\n')
    const first=previewIcs(envelope(master))
    const next=previewIcs(envelope([moved,master].join('\r\n')))
    const original=first.records.find(r=>r.start==='2026-03-30T07:00:00.000Z')!
    const amended=next.records.find(r=>r.title==='Revised campus seminar')!
    expect(amended.start).toBe('2026-03-30T09:30:00.000Z')
    expect(amended.sourceKey).toBe(original.sourceKey)
    expect(amended.id).toBe(original.id)
    expect(amended.sourceTimeZone).toBe('Europe/Berlin')
    const before=mergeIcs({schemaVersion:1,records:[]},first).state
    const changes=reviewImportedChanges(before,next,'update')
    expect(changes.counts).toMatchObject({added:0,updated:1,unchanged:2,removed:0})
    const merged=mergeIcs(before,next).state
    expect(merged.records.find(r=>r.id===original.id)?.start).toBe(amended.start)
    expect(merged.records.every(r=>r.source==='ics')).toBe(true)
  })
  it('rejects disagreeing embedded offsets and blocks source-wide replacement of incomplete data',()=>{
    const prior=previewIcs(envelope(master))
    const state=mergeIcs({schemaVersion:1,records:[]},prior).state
    const incompatible=declarations.replaceAll('TZOFFSETFROM:+0100','TZOFFSETFROM:+1100')
      .replaceAll('TZOFFSETTO:+0200','TZOFFSETTO:+1200')
      .replaceAll('TZOFFSETFROM:+0200','TZOFFSETFROM:+1200')
      .replaceAll('TZOFFSETTO:+0100','TZOFFSETTO:+1100')
    const broken=previewIcs(envelope(master,incompatible))
    expect(broken.skippedEvents).toBe(1)
    expect(broken.records).toHaveLength(0)
    expect(broken.warnings.join(' ')).toMatch(/VTIMEZONE offset disagrees/)
    expect(()=>mergeIcs(state,broken,'replace')).toThrow('Cannot replace an incomplete')
    expect(mergeIcs(state,broken,'update').state).toEqual(state)
  })
  it('preserves all read-only imports with explicit metadata validation',()=>{
    const source=previewIcs(envelope(master))
    const state=mergeIcs({schemaVersion:1,records:[]},source).state
    expect(validateState(JSON.parse(JSON.stringify(state)))).toEqual(state)
    expect(()=>validateState({schemaVersion:1,records:[{
      ...state.records[0],source:'personal',sourceTimeZone:'Europe/Berlin'
    }]})).toThrow('read-only source')
  })
  it('retains valid IANA TZID when a vendor omits VTIMEZONE, never guesses Windows IDs',()=>{
    const explicit=previewIcs(envelope(master,''))
    expect(explicit.records).toHaveLength(3)
    expect(explicit.records[0].sourceTimeZone).toBe('Europe/Berlin')
    const windows=master.replaceAll('Europe/Berlin','W. Europe Standard Time')
    const unknown=previewIcs(envelope(windows,''))
    expect(unknown.skippedEvents).toBe(1)
    expect(unknown.records).toHaveLength(0)
    expect(unknown.warnings.join(' ')).toMatch(/unsupported|Unsupported|Invalid/)
  })
  it('rejects malformed or duplicate embedded zone components before source replacement',()=>{
    expect(()=>embeddedTimeZones(['BEGIN:VTIMEZONE','TZID:Europe/Berlin']))
      .toThrow('Incomplete VTIMEZONE')
    expect(()=>previewIcs(envelope(master,declarations+'\r\n'+declarations)))
      .toThrow('Duplicate VTIMEZONE')
    const broken=previewIcs(envelope(master,declarations.replace('TZOFFSETTO:+0200','TZOFFSETTO:+0199')))
    expect(broken.skippedEvents).toBe(1)
    expect(broken.warnings.join(' ')).toMatch(/Unsupported referenced VTIMEZONE/)
  })
})
