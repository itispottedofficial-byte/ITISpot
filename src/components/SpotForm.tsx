'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ImagePlus, X, ShieldCheck, Check, LoaderCircle, Send } from 'lucide-react';
import { RetroWindow } from './Window';
import { Turnstile } from './Turnstile';
import { fileError } from '@/lib/validation';
export function SpotForm({demo}:{demo:boolean}){
  const [text,setText]=useState(''),[consent,setConsent]=useState(false),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[receipt,setReceipt]=useState(''),[dragging,setDragging]=useState(false),[token,setToken]=useState(''),[challenge,setChallenge]=useState(0);
  const fileInput=useRef<HTMLInputElement>(null),success=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!file || /heic|heif/i.test(file.type+file.name)){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
  useEffect(()=>{if(receipt)success.current?.focus();},[receipt]);
  function choose(selected:File|undefined){if(!selected)return;const issue=fileError(selected);if(issue){setError(issue);return;}setFile(selected);setError('');}
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');
    if(!text.trim()){setError('Scrivi qualcosa prima di inviare.');return;}
    if(!consent){setError('Leggi e accetta le regole.');return;}
    const data=new FormData(e.currentTarget);data.set('text',text);data.set('consent',String(consent));data.set('turnstile',token);data.delete('image');if(file)data.set('image',file);
    setBusy(true);
    try{const response=await fetch('/api/spots',{method:'POST',body:data});const result=await response.json();if(!response.ok)throw new Error(result.error);setReceipt(result.id);setText('');setFile(null);setConsent(false);}
    catch(e){setError(e instanceof Error?e.message:'Connessione interrotta. Riprova.');}
    finally{setBusy(false);setToken('');setChallenge(v=>v+1);}
  }
  return <RetroWindow title={receipt?'Messaggio ricevuto!':'Invia il tuo Spot'} className="spot-window">
    {receipt?<div ref={success} tabIndex={-1} className="success-panel"><div className="success-icon"><Check size={40}/></div><span className="receipt">SPOT #{receipt.slice(0,8).toUpperCase()}</span><h2>Detto. Fatto. Anonimo.</h2><p>Il tuo Spot è arrivato.<br/>Ora passa al team di moderazione.</p><div className="success-note"><ShieldCheck size={20}/><span>È in attesa di revisione.<br/>Non è stato pubblicato.</span></div><button className="primary-button" onClick={()=>{setReceipt('');setError('');}}>SCRIVI UN ALTRO SPOT <ArrowRight size={22}/></button><a href="#info">Cosa succede adesso?</a></div>:
    <form onSubmit={submit} className="spot-form" aria-label="Invia uno Spot" aria-busy={busy}>
      <div className="field-heading"><label htmlFor="message">Il tuo messaggio</label><span>Fatti sentire.</span></div>
      <div className="textarea-wrap"><textarea id="message" name="text" placeholder="Quello che non dici ad alta voce..." value={text} onChange={e=>setText(e.target.value)} maxLength={500} required disabled={busy} aria-describedby="counter"/><span id="counter" className={text.length>470?'counter near-limit':'counter'}>{text.length}/500</span></div>
      <div className={`upload-zone ${dragging?'dragging':''} ${file?'has-file':''}`} onDragOver={e=>{e.preventDefault();if(!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(!busy)choose(e.dataTransfer.files[0]);}}>
        {file?<><div className="file-thumb">{preview?<img src={preview} alt="Anteprima della foto selezionata"/>:<ImagePlus size={28}/>}</div><div className="upload-copy"><strong>{file.name}</strong><span>{(file.size/1024/1024).toFixed(1)} MB · {preview?'Foto pronta':'Anteprima dopo l’invio'}</span></div><button type="button" className="icon-button" disabled={busy} aria-label="Rimuovi foto" onClick={()=>{setFile(null);if(fileInput.current)fileInput.current.value='';}}><X size={20}/></button></>:<><ImagePlus className="upload-icon" size={34}/><div className="upload-copy"><strong>Aggiungi una foto</strong><span>JPG, PNG, HEIC · max 10 MB</span></div><button type="button" className="retro-button choose-file" onClick={()=>fileInput.current?.click()} disabled={busy}>Scegli file</button></>}
        <input ref={fileInput} type="file" name="image" accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" className="sr-only" aria-label="Carica una foto" tabIndex={-1} onChange={e=>choose(e.target.files?.[0])} disabled={busy}/>
      </div>
      <div className="honeypot" aria-hidden="true"><label htmlFor="website">Lascia vuoto</label><input id="website" name="website" type="text" tabIndex={-1} autoComplete="off"/></div>
      <div className="consent-row"><input id="consent" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy} required/><label htmlFor="consent">Ho letto le <a href="#regole">regole</a>. Rispetto le persone.</label></div>
      {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY&&<Turnstile key={challenge} onToken={setToken}/>}
      {error&&<p role="alert" className="form-error">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY&&!token)}>{busy?<><LoaderCircle className="spin" size={22}/> INVIO IN CORSO...</>:<>INVIA LO SPOT <ArrowRight size={26}/></>}</button>
      <p className="form-footnote"><ShieldCheck size={13}/> Nessun nome richiesto. Ogni Spot viene moderato.</p>
      {demo&&<p className="demo-note"><Send size={11}/> Demo locale: gli Spot restano su questo computer.</p>}
    </form>}
  </RetroWindow>;
}
