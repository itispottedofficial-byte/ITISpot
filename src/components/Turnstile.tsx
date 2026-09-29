'use client';
import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
declare global { interface Window { turnstile?: {render:(el:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void} } }
export function Turnstile({onToken}:{onToken:(token:string)=>void}){
  const ref=useRef<HTMLDivElement>(null), widget=useRef<string>(undefined);
  const [error,setError]=useState('');
  const render=useCallback(()=>{
    if(!ref.current || !window.turnstile || widget.current)return;
    widget.current=window.turnstile.render(ref.current,{sitekey:process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,theme:'light',callback:(token:string)=>{onToken(token);setError('');},'expired-callback':()=>onToken(''),'error-callback':()=>{onToken('');setError('Controllo anti-spam non disponibile. Ricarica la pagina.');}});
  },[onToken]);
  useEffect(()=>{render();return()=>{if(widget.current)window.turnstile?.remove(widget.current);widget.current=undefined;};},[render]);
  return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={render} onError={()=>setError('Impossibile caricare il controllo anti-spam. Ricarica la pagina.')}/><div ref={ref}/>{error&&<p role="alert" className="form-error">{error}</p>}</>;
}
