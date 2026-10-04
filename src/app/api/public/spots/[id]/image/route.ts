import { NextResponse } from "next/server";
import { publicImage } from "@/lib/public-spots";
import { failure } from "@/lib/http";

export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const image = await publicImage(id);
    if (!image)
      return new NextResponse(null, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
