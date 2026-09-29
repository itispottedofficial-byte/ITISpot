import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/security';
import { getSpot, readImage } from '@/lib/repository';
import { failure, HttpError, privateHeaders } from '@/lib/http';
import { idSchema } from '@/lib/validation';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{await requireAdmin(req);const {id}=await params;if(!idSchema.safeParse(id).success)throw new HttpError(400,'ID non valido.');
    const spot=await getSpot(id);if(!spot?.image_path)throw new HttpError(404,'Immagine non trovata.');
    const image=await readImage(spot.image_path);return new Response(new Uint8Array(image),{headers:{...privateHeaders,'Content-Type':'image/webp','X-Content-Type-Options':'nosniff'}});
  }catch(e){return failure(e);}
}
