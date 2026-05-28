# Database migrations (Prisma / PostgreSQL)

## Policy (environments with real user data)

- **Do not use `npx prisma db push`** as the primary way to evolve production or shared staging databases. `db push` can apply destructive diffs and does not produce the same reviewable migration history as `migrate`.
- **Use `npx prisma migrate dev`** in development to generate SQL under `prisma/migrations/`, **review** the SQL, apply on a **database clone** first, then **`npx prisma migrate deploy`** in staging/production.
- Before changing **unique constraints** on `users.email` / `users.phone` (or adding expression-based uniques): take a **logical backup** (e.g. `pg_dump`), run duplicate-detection queries on staging, and plan **expand–contract** migrations when possible.

## Local disposable databases

`db push` is acceptable only when the database may be reset and no production data is present.

## Troubleshooting: admin `/api/admin/users` or `/api/admin/kyc` returns 500

1. **Raw SQL vs schema** — Related-contact helpers in `lib/server/admin-related-users.ts` use columns that must exist on `users` (e.g. `"managedById"` for MODERATOR book scope). If your DB was created only from early migrations, it may be missing fields present in [`prisma/schema.prisma`](../prisma/schema.prisma). After a backup, align the database with **`npx prisma db push`** on a **clone** first, or add a reviewed migration that adds the missing columns and FKs.
2. **Prefer migrate deploy in production** — `db push` is still a last-resort sync tool; production should track **`prisma migrate deploy`** when the team maintains `prisma/migrations`.

## References

- Admin console module notes: [`components/admin-console/MODULE_DOC.md`](../components/admin-console/MODULE_DOC.md).
