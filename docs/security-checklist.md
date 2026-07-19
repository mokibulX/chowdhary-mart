# Chowdhary Mart Security Checklist

- Keep secrets out of source code and APKs.
- Use HTTPS-only public endpoints.
- Configure `CORS_ORIGINS` per environment.
- Require strong `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `DATA_ENCRYPTION_KEY`.
- Keep `ERROR_DETAILS_PUBLIC=false` in production.
- Run dependency and secret scans before deployment.
- Require `Idempotency-Key` on order/payment/refund/wallet/accept endpoints.
- Verify payment webhooks using provider signatures.
- Store customer/seller/rider private documents in private buckets only.
- Use signed URLs for private files.
- Never expose stack traces, SQL, internal IPs, database names, or secrets to public users.
- Admin operations endpoints must stay behind admin auth and MFA in production.
