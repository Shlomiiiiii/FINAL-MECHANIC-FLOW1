# MechanicFlow — Migration Strategy

## Commands

### Development
```bash
npm run db:migrate          # create + apply migration
npm run db:migrate:deploy   # production: apply pending only
npm run db:push             # dev only: push without history
npm run db:seed             # seed demo data
npm run db:studio           # open Prisma Studio GUI
```

## Deployment Pipeline
```
1. prisma migrate deploy    ← BEFORE app deploys
2. Deploy new app version
```

## Safe Migration Rules

| Change | Safe? | Method |
|--------|-------|--------|
| Add column with default | ✅ | Single deploy |
| Add new table | ✅ | Single deploy |
| Rename column | ⚠️ | Two-phase: add new → migrate data → drop old |
| Drop column | ⚠️ | Two-phase: remove from code → then drop |
| Add NOT NULL column | ⚠️ | Include DEFAULT in same migration |

## Multi-Tenant Isolation

Every query enforces: `where: { organizationId: user.organizationId }`

Optional PostgreSQL RLS for belt-and-suspenders:
```sql
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON jobs
  USING (organization_id = current_setting('app.organization_id')::text);
```

## Key Index Rationale

| Index | Query it serves |
|-------|-----------------|
| `(org_id, status)` | List views filtered by status |
| `(org_id, customer_id)` | Customer detail: all their jobs/invoices |
| `(org_id, created_at DESC)` | Default sort on all lists |
| `(token_hash)` sessions | Session auth on every request |
| `(expires_at)` sessions | Cleanup of expired sessions |
| `(stripe_payment_intent_id)` | Stripe webhook lookup |
| `(payment_link_token)` | Customer payment portal |
| `(org_id, technician_id, starts_at)` | Calendar view per tech |

## Audit Log Policy
audit_logs is APPEND-ONLY. Never UPDATE or DELETE rows.
Application DB role should have INSERT + SELECT only on this table.
