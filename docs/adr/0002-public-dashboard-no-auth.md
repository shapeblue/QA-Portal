# Public read-only dashboard, no user authentication

The QA Portal is intentionally a **public** dashboard: anyone on the internet may view
CloudStack PR health, upgrade tests, and test-failure data without logging in. We therefore
deliberately run the read API with **no user authentication**. This is a feature, not an
oversight — community visibility of CloudStack QA status is a goal.

Security is provided by hygiene rather than auth: `helmet`, per-IP rate limiting, and CORS
scoped to the portal's own origin.

The one sensitive resource is `/api/download-artifact/:artifactId`, which spends the
server's `GITHUB_TOKEN`. Because the artifacts are public `apache/cloudstack` CI logs, the
risk is **token/rate-limit abuse, not data leakage**. We guard it by validating that
`artifactId` is numeric and applying an aggressive per-IP rate limit — *not* by requiring
auth, which would break the public download UX.

## Consequences

- Do **not** add login/auth to the read endpoints to "secure" them — that would break the
  intended public-dashboard behaviour. If access ever needs restricting, that is a new,
  deliberate decision (supersede this ADR).
- No endpoint may expose data or spend credentials in a way that assumes a trusted caller.
- New token-spending or write-shaped endpoints must be rate-limited and input-validated as a
  baseline.
