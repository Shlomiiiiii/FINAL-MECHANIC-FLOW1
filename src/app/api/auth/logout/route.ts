import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { createHash } from "crypto";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "mf_session";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(_request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await prisma.session.deleteMany({ where: { tokenHash } }).catch(() => {});
    }

    cookieStore.delete(SESSION_COOKIE_NAME);
  } catch {}

  // 303 forces the follow-up request to be a GET (a default redirect after POST
  // is 307 and would re-POST to /login, which doesn't accept POST).
  return NextResponse.redirect(new URL("/login", APP_URL), 303);
}
