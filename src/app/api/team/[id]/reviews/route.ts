import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { successResponse, ApiErrors } from "@/lib/api-response";
import { z } from "zod";

const reviewSchema = z.object({
  reviewPeriod:  z.string().min(1),
  reviewDate:    z.string(),
  technicalScore:    z.number().int().min(1).max(5).optional(),
  qualityScore:      z.number().int().min(1).max(5).optional(),
  efficiencyScore:   z.number().int().min(1).max(5).optional(),
  customerScore:     z.number().int().min(1).max(5).optional(),
  teamworkScore:     z.number().int().min(1).max(5).optional(),
  strengths:    z.string().optional(),
  improvements: z.string().optional(),
  goals:        z.string().optional(),
  comments:     z.string().optional(),
  status:       z.enum(["draft","shared"]).optional().default("draft"),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    const { id } = await params;
    if (user.role === "TECHNICIAN" && id !== user.id) return ApiErrors.forbidden();

    const reviews = await prisma.performanceReview.findMany({
      where: { userId: id, organizationId: user.organizationId },
      include: { reviewedBy: { select: { fullName: true } } },
      orderBy: { reviewDate: "desc" },
    });
    return successResponse({ reviews });
  } catch (err) {
    console.error("GET reviews:", err);
    return ApiErrors.internal();
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSession();
    if (!user) return ApiErrors.unauthorized();
    if (!["OWNER","MANAGER"].includes(user.role)) return ApiErrors.forbidden();
    const { id } = await params;

    const body   = await request.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      const details: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "general");
        if (!details[key]) details[key] = [];
        details[key].push(issue.message);
      }
      return ApiErrors.validation(details);
    }

    const data = parsed.data;
    const scores = [data.technicalScore, data.qualityScore, data.efficiencyScore,
                    data.customerScore, data.teamworkScore].filter(Boolean) as number[];
    const overallScore = scores.length > 0
      ? Math.round((scores.reduce((s,v)=>s+v,0) / scores.length) * 10) / 10
      : null;

    const review = await prisma.performanceReview.create({
      data: {
        organizationId: user.organizationId,
        userId:         id,
        reviewedById:   user.id,
        reviewPeriod:   data.reviewPeriod,
        reviewDate:     new Date(data.reviewDate),
        technicalScore:  data.technicalScore,
        qualityScore:    data.qualityScore,
        efficiencyScore: data.efficiencyScore,
        customerScore:   data.customerScore,
        teamworkScore:   data.teamworkScore,
        overallScore:    overallScore ?? undefined,
        strengths:       data.strengths,
        improvements:    data.improvements,
        goals:           data.goals,
        comments:        data.comments,
        status:          data.status ?? "draft",
      },
      include: { reviewedBy: { select: { fullName: true } } },
    });

    return successResponse({ review }, 201);
  } catch (err) {
    console.error("POST review:", err);
    return ApiErrors.internal();
  }
}
