import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security';
import { listSpots } from '@/lib/repository';
import { failure, privateHeaders } from '@/lib/http';
export async function GET(req:NextRequest){try{await requireAdmin(req);const spots=await listSpots();return NextResponse.json({spots},{headers:privateHeaders});}catch(e){return failure(e);}}
