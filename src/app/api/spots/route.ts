import { NextRequest, NextResponse } from 'next/server';
import { submissionSchema } from '@/lib/validation';
import { createSpot } from '@/lib/repository';
import { sanitizeImage } from '@/lib/images';
import { guard, boundedForm, failure, HttpError } from '@/lib/http';
import { rateLimit, verifyTurnstile } from '@/lib/security';
export const runtime='nodejs';
export async function POST(req: NextRequest) {
  try {
    guard(req); await rateLimit(req);
    const form=await boundedForm(req);
    const result=submissionSchema.safeParse({text:form.get('text'),consent:form.get('consent'),website:form.get('website') || ''});
    if(!result.success)throw new HttpError(400,result.error.issues[0].message);
    await verifyTurnstile(String(form.get('turnstile') || ''));
    const file=form.get('image');let image: Buffer | undefined;
    if(file instanceof File && file.size){try{image=await sanitizeImage(file);}catch(e){throw new HttpError(400,e instanceof Error && /10 MB|formato|foto|file/i.test(e.message)?e.message:'Impossibile leggere la foto. Prova un JPG o PNG valido.');}}
    const spot=await createSpot(result.data.text,image);
    return NextResponse.json({id:spot.id,status:spot.status},{status:201});
  }catch(e){return failure(e);}
}
