import React from 'react'
import {createRoot} from 'react-dom/client'
import App from './App'
import './styles.css'
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)

/** Offline shell only. Never cache calendar data, external providers, or responses.
 * Registration happens on production secure origins and localhost, not Vite dev. */
if(import.meta.env.PROD&&'serviceWorker' in navigator){
  window.addEventListener('load',()=>{void navigator.serviceWorker.register('/sw.js',{scope:'/'})
    .catch(error=>{console.info('Calendar offline shell unavailable:',error)})})
}
