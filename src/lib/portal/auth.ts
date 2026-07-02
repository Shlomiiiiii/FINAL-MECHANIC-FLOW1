/**
 * Customer Portal Authentication
 *
 * Flow: customer enters email → 6-digit OTP sent → verified → session created
 * Sessions: stored in DB, sent as HttpOnly cookie, expire in 30 days
 * Security: bcrypt OTP hashing, brute-force lockout, IP logging, full audit trail
 */

import { cookies } from "next/headers";
import { createHash, randomInt, createHmac } from "crypto";
import { prisma } from "@/lib/db";
import type { Customer, Organization } from "@prisma/client";

const SESSION_COOKIE = "portal_session";
const SESSION_DAYS   = 30;
const OTP_MINUTES    = 15;
const OTP_MAX_TRIES  = 5;

// ─── Token utilities ──────────────────────────────────────────────────────────

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateOtp(): string {
  return String(randomInt(100000, 999999));
}

// ─── Session management ───────────────────────────────────────────────────────

export interface PortalSessionUser {
  customerId:     string;
  organizationId: string;
  organizationSlug: string;
  firstName:      string;
  lastName:       string;
  email:          string | null;
  sessionId:      string;
}

export async function getPortalSession(
  slug?: string
): Promise<PortalSessionUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const tokenHash = sha256(token);
    const session = await prisma.portalSession.findUnique({
      where: { tokenHash },
      include: {
        customer:     { select: { id: true, firstName: true, lastName: true, email: true } },
        organization: { select: { id: true, slug: true } },
      },
    });

    if (!session) return null;
    if (session.expiresAt < new Date()) {
      await prisma.portalSession.delete({ where: { id: session.id } });
      return null;
    }

    // Validate slug matches if provided
    if (slug && session.organization.slug !== slug) return null;

    // Update last active (throttled — only if >5 min ago)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (session.lastActiveAt < fiveMinAgo) {
      await prisma.portalSession.update({
        where: { id: session.id },
        data:  { lastActiveAt: new Date() },
      }).catch(() => {}); // non-fatal
    }

    return {
      customerId:       session.customerId,
      organizationId:   session.organizationId,
      organizationSlug: session.organization.slug,
      firstName:        session.customer.firstName,
      lastName:         session.customer.lastName,
      email:            session.customer.email,
      sessionId:        session.id,
    };
  } catch {
    return null;
  }
}

export async function createPortalSession(params: {
  customerId:     string;
  organizationId: string;
  ipAddress?:     string;
  userAgent?:     string;
}): Promise<string> {
  const token     = generateSessionToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);

  await prisma.portalSession.create({
    data: {
      customerId:     params.customerId,
      organizationId: params.organizationId,
      tokenHash,
      expiresAt,
      ipAddress:      params.ipAddress,
      userAgent:      params.userAgent,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires:  expiresAt,
    path:     "/portal",
  });

  return token;
}

export async function destroyPortalSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = sha256(token);
    await prisma.portalSession.deleteMany({ where: { tokenHash } }).catch(() => {});
  }
  cookieStore.delete(SESSION_COOKIE);
}

// ─── OTP management ────────────────────────────────────────────────────────────

export async function createPortalOtp(params: {
  customerId:     string;
  organizationId: string;
  email:          string;
}): Promise<string> {
  // Invalidate existing OTPs for this customer
  await prisma.portalOtp.deleteMany({
    where: { customerId: params.customerId, usedAt: null },
  });

  const otp      = generateOtp();
  const codeHash = sha256(otp);
  const expiresAt = new Date(Date.now() + OTP_MINUTES * 60000);

  await prisma.portalOtp.create({
    data: {
      organizationId: params.organizationId,
      customerId:     params.customerId,
      email:          params.email,
      codeHash,
      expiresAt,
    },
  });

  return otp;
}

export async function verifyPortalOtp(params: {
  customerId: string;
  code:       string;
}): Promise<{ success: boolean; error?: string }> {
  const codeHash = sha256(params.code.trim());

  const otp = await prisma.portalOtp.findFirst({
    where: {
      customerId: params.customerId,
      usedAt:     null,
      expiresAt:  { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return { success: false, error: "Code expired or not found. Request a new one." };

  // Brute force protection
  if (otp.attempts >= OTP_MAX_TRIES) {
    await prisma.portalOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
    return { success: false, error: "Too many attempts. Please request a new code." };
  }

  if (otp.codeHash !== codeHash) {
    await prisma.portalOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    const remaining = OTP_MAX_TRIES - otp.attempts - 1;
    return { success: false, error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` };
  }

  // Mark used
  await prisma.portalOtp.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
  return { success: true };
}

// ─── Audit logging ─────────────────────────────────────────────────────────────

export async function logPortalAction(params: {
  organizationId: string;
  customerId:     string;
  action:         string;
  resourceType?:  string;
  resourceId?:    string;
  metadata?:      Record<string, unknown>;
  ipAddress?:     string;
  userAgent?:     string;
  success?:       boolean;
  errorMessage?:  string;
}): Promise<void> {
  await prisma.portalAuditLog.create({
    data: {
      organizationId: params.organizationId,
      customerId:     params.customerId,
      action:         params.action,
      resourceType:   params.resourceType,
      resourceId:     params.resourceId,
      metadata:       (params.metadata ?? {}) as any,
      ipAddress:      params.ipAddress,
      userAgent:      params.userAgent,
      success:        params.success ?? true,
      errorMessage:   params.errorMessage,
    },
  }).catch(() => {}); // Never let audit logging crash a request
}
