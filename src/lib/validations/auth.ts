import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  organizationSlug: z
    .string()
    .min(1, "Organization is required")
    .regex(/^[a-z0-9-]+$/, "Invalid organization identifier"),
});

export const registerOrganizationSchema = z.object({
  organizationName: z
    .string()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name is too long"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(50, "Slug is too long")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    ),
  ownerFullName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100),
  ownerEmail: z.string().email("Please enter a valid email address"),
  ownerPassword: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128, "Password is too long"),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),
  organizationSlug: z
    .string()
    .min(1, "Workspace is required")
    .regex(/^[a-z0-9-]+$/, "Invalid workspace identifier"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128, "Password is too long"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterOrganizationInput = z.infer<typeof registerOrganizationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
