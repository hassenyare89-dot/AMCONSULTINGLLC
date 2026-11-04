# Implementation Checklist

Status key: ✅ implemented & tested · 🟡 implemented, needs a live backend/credentials to verify end-to-end · ⛔ blocked (reason given) · 📝 requires company/legal input.

"Tested" means automated tests that actually ran in this environment (see docs/10). Since the move to
self-hosted PostgreSQL, sign-in, MFA, uploads and a form write are exercised end-to-end against the real
built server and a real database (`scripts/test-integration.sh`); most individual AMCMS screens are still
covered by unit/authorization tests rather than clicked through.

## Phases

| Phase | Status |
|---|---|
| 1 Repository inspection | ✅ docs/01-AUDIT_REPORT.md |
| 2 Planning | ✅ docs/02-ARCHITECTURE.md, this checklist |
| 3 Design system | ✅ brand tokens (#072A6C/#041A3D/#0DAA77/#F4F7FB/#1F2937) with AA-contrast ink variant; admin UI kit |
| 4 Cinematic landing page | ✅ 3D/video/image hero with fallbacks and pause control; 🟡 original video only on Lovable hosting (docs/05) |
| 5 Public website | ✅ all pages in §6 of the brief |
| 6 Database | ✅ migrations + RLS, tested on Postgres 16 |
| 7 Authentication | ✅ staff sign-in, invite-only, MFA gate, reset, idle timeout, session revocation — integration-tested (API + browser) |
| 8 Management system | 🟡 all modules built; server authorization tested |
| 9 CMS | 🟡 editor, media, drafts/publish/schedule/revisions |
| 10 Security & compliance | ✅ controls (docs/06); 📝 legal review (docs/08) |
| 11 Testing | ✅ see docs/10 |
| 12 Deployment | ✅ docs/07, CI workflow, `.env.example` |
| 13 Handover | ✅ docs/11 |

## Acceptance criteria (brief §28)

| Criterion | Status |
|---|---|
| Public website fully responsive | ✅ mobile + desktop E2E; no horizontal overflow |
| Working optimized video or approved fallback | ✅ fallback verified; 🟡 original video unverified (not in ZIP) |
| Optional 3D with fallbacks | ✅ canvas renders on desktop; reduced motion → image (E2E) |
| Existing pages preserved | ✅ home, about, services, process, contact, drivers, confirmation, status, auth, admin drivers |
| Contact forms persist valid submissions | 🟡 persisted before email (code + schema); live DB write not run here |
| Driver registrations saved securely | 🟡 hashed IP, consent, history; secure token status |
| Secure applicant status process | ✅ token format/expiry logic; status-only legacy lookup; E2E for malformed tokens |
| Administrative authentication works | ✅ integration test: invite → password → sign-in → TOTP → dashboard |
| Permissions enforced on the server | ✅ every operation tested to reject unauthorised roles before DB access |
| Drivers reviewed/managed | 🟡 |
| Truck records managed | 🟡 |
| Dispatch assigned/tracked | 🟡; conflict rules ✅ (unit + DB exclusion constraints) |
| Projects created/updated | 🟡 |
| Leads managed | 🟡 |
| Quotes generated/reviewed | 🟡; money math ✅ |
| Content editable via CMS | 🟡; schema/sanitizer ✅ |
| Documents with authorization controls | 🟡; upload sniffing ✅, private bucket ✅ |
| Notifications via configured integrations | 🟡 needs `RESEND_API_KEY`; delivery logged either way |
| Security logs record actions | ✅ append-only audit table (DB test) + audit calls in services |
| Migrations & backups documented | ✅ docs/04, docs/07 |
| Critical automated tests pass | ✅ see docs/10 |
| Accessibility documented & remediated | ✅ axe: 0 violations on 16 pages × 2 viewports; manual AT testing still recommended |
| U.S. compliance & legal reviews documented | ✅ docs/08; 📝 counsel sign-off |
| Production build & deploy instructions validated | ✅ build + Docker Compose stack run locally; 🟡 deployment to a real Droplet not performed |

## Blocked / needs input

| Item | Blocker | Next action |
|---|---|---|
| Original hero video, logo, about image | Not in ZIP; asset CDN unreachable from this environment | Download from Lovable Assets → upload in CMS Media (docs/05) |
| Real-server deployment | Not performed from here | Deploy to a Droplet (docs/12) and run the smoke test (docs/07) |
| Email delivery | Needs `RESEND_API_KEY` + verified domain | docs/07 DNS checklist |
| Malware scanning | No scanning service in stack | Choose provider; set `scan_status` |
| Error monitoring | Needs Sentry DSN | docs/07 |
| Legal name, licences, insurance, FMCSA status | Business facts | docs/08 |
| Lighthouse scores | Not measured (dev server only; no production URL) | Run Lighthouse on the deployed site |
