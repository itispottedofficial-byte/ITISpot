import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security';
import { updateSpot } from '@/lib/repository';
import { guard, failure, HttpError } from '@/lib/http';
import { actionSchema, idSchema } from '@/lib/validation';
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{guard(req);await requireAdmin(req);const {id}=await params;
    if(!idSchema.safeParse(id).success)throw new HttpError(400,'ID non valido.');
    const result=actionSchema.safeParse(await req.json());if(!result.success)throw new HttpError(400,'Azione non valida.');
    if(!await updateSpot(id,result.data.action))throw new HttpError(404,'Spot non trovato.');
    return NextResponse.json({ok:true});
  }catch(e){return failure(e);}
}
