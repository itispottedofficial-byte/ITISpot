import { NextRequest, NextResponse } from 'next/server';
import { guard, failure, HttpError, privateHeaders } from '@/lib/http';
import { mode } from '@/lib/config';
import { demoSession, setSession, requireAdmin, rateLimit } from '@/lib/security';
import { supabase } from '@/lib/supabase';
export async function GET(req:NextRequest){try{await requireAdmin(req);return NextResponse.json({authenticated:true,mode:mode()},{headers:privateHeaders});}catch(e){return failure(e);}}
export async function POST(req:NextRequest){
  try{
    guard(req);await rateLimit(req,'login',10);
    let token:string;
    if(mode()==='demo')token=demoSession();
    else{
      if(Number(req.headers.get('content-length') || 0)>4096)throw new HttpError(413,'Richiesta troppo grande.');
      const {email,password}=await req.json();
      if(typeof email!=='string' || typeof password!=='string' || email.length>254 || password.length>256)throw new HttpError(400,'Credenziali non valide.');
      const {data,error}=await supabase().auth.signInWithPassword({email,password});
      if(error || !data.user || !(process.env.ADMIN_USER_IDS || '').split(',').map(s=>s.trim()).includes(data.user.id))throw new HttpError(401,'Credenziali non valide o accesso non autorizzato.');
      token=data.session!.access_token;
    }
    const response=NextResponse.json({ok:true},{headers:privateHeaders});setSession(response,token);return response;
  }catch(e){return failure(e);}
}
export async function DELETE(req:NextRequest){try{guard(req);const r=NextResponse.json({ok:true});setSession(r,'',0);return r;}catch(e){return failure(e);}}
