import {readdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {join} from 'node:path'

const root='dist'
const bundle=await readdir(join(root,'assets'))
const files=['/','/index.html','/manifest.webmanifest','/calendar-icon.svg',
  ...bundle.filter(p=>/\.(js|css)$/.test(p)).map(p=>'/assets/'+p)]
const id=createHash('sha256').update(files.join('|')).digest('hex').slice(0,16)
const script=[
  "'use strict';",
  "const CACHE="+JSON.stringify('thiepn-calendar-shell-'+id)+";",
  "const PREFIX='thiepn-calendar-shell-';",
  "const FILES="+JSON.stringify(files.filter(p=>p!=='/'))+";",
  "self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));",
  "self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));",
  "self.addEventListener('fetch',event=>{",
  "  const request=event.request;",
  "  if(request.method!=='GET')return;",
  "  const url=new URL(request.url);",
  "  if(url.origin!==self.location.origin)return;",
  "  if(request.mode==='navigate'){",
  "    event.respondWith(fetch(request).then(response=>response.ok?response:Promise.reject(new Error('Navigation failed'))).catch(()=>caches.match('/index.html')));",
  "    return;",
  "  }",
  "  if(!FILES.includes(url.pathname))return;",
  "  event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));",
  "});"
].join('\n')+'\n'
await writeFile(join(root,'sw.js'),script,'utf8')
const html=await readFile(join(root,'index.html'),'utf8')
if(!html.includes('/manifest.webmanifest'))throw new Error('PWA manifest link missing in output')
console.log('OFFLINE_SHELL_BUILT',id,files.length,'static routes')
