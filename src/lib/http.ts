import { NextRequest, NextResponse } from 'next/server';
import { assertConfigured } from './config';
export class HttpError extends Error { constructor(public status: number, message: string, public retryAfter?: number) { super(message); } }
export function guard(req: NextRequest) {
  assertConfigured();
  const expected = process.env.APP_ORIGIN || req.nextUrl.origin;
  if (req.headers.get('origin') !== expected) throw new HttpError(403, 'Origine della richiesta non valida.');
}
export async function boundedForm(req: NextRequest) {
  const max = 11 * 1024 * 1024;
  if(Number(req.headers.get('content-length') || 0)>max)throw new HttpError(413,'La richiesta supera il limite di 10 MB per immagine.');
  const reader=req.body?.getReader(); if(!reader)throw new HttpError(400,'Invio vuoto.');
  const chunks: Uint8Array[]=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>max){await reader.cancel();throw new HttpError(413,'La foto supera 10 MB.');}chunks.push(value);}
  const buffer=Buffer.concat(chunks);
  try { return await new Response(buffer,{headers:{'content-type':req.headers.get('content-type') || ''}}).formData(); }
  catch { throw new HttpError(400,'Invio non valido.'); }
}
export function failure(e: unknown) {
  if(e instanceof HttpError)return NextResponse.json({error:e.message},{status:e.status,headers:e.retryAfter?{'Retry-After':String(e.retryAfter)}:undefined});
  console.error('ITISpot request failed:', e instanceof Error ? e.name : 'UnknownError');
  return NextResponse.json({error:'Servizio non disponibile. Riprova tra poco o verifica la configurazione.'},{status:503});
}
export const privateHeaders = { 'Cache-Control':'private, no-store' };
