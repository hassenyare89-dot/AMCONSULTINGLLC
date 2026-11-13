# U.S. Compliance Matrix

**Not legal advice.** Applicability depends on AM Consulting LLC's actual operations, revenue, data volumes,
customer locations and regulatory status — all of which must be confirmed by the company and qualified
counsel. All legal pages are **drafts** pending that review.

Legend — Applicability: *Likely* / *Possible* / *Unlikely* / *Unknown*.

| # | Requirement | Applicability | Evidence needed | Implemented control | Testing | Open decision / legal review |
|---|---|---|---|---|---|---|
| A1 | **ADA Title III / WCAG 2.2 AA** website accessibility | Likely (public-facing business site; DOJ treats websites as covered) | Accessibility audit records | Semantic HTML, skip links, labelled forms with announced errors, focus styles, AA contrast tokens, keyboard-operable menus/dialogs, reduced-motion support, pause control for motion, text alternative for 3D scene, accessibility statement + contact | axe-core automated scans on 16 pages (desktop + mobile) in CI | Manual screen-reader test (NVDA/VoiceOver) and keyboard walkthrough recommended; confirm response SLA in statement |
| P1 | **Privacy notice** (CalOPPA-style disclosures; FTC Act §5 — no deceptive practices) | Likely | Final policy text, data inventory | Draft Privacy Policy describing actual collection, processors (DigitalOcean hosting, Resend, Nominatim, Google Maps; Cloudflare only if Turnstile is enabled), retention, rights | Content review | Counsel to finalise; confirm processors list and retention periods |
| P2 | **State comprehensive privacy laws** (e.g. CCPA/CPRA, VCDPA, TDPSA…) | Unknown — most have revenue/volume thresholds a small B2B consultancy may not meet; Georgia has no comprehensive privacy statute as of drafting | Revenue, number of consumers' data processed, states served | Privacy request workflow (access/delete/correct/opt-out), 45-day due dates and reminders, identity-verification step, data-subject lookup, consent records with notice version | Unit + E2E (form validation); DB tests | Counsel to determine which laws apply; adjust request types/timelines |
| P3 | **Data minimisation & retention** | Likely (best practice; required by several state laws) | Retention schedule | No SSN/licence/payment data collected; IP hashed; VIN optional; retention targets in settings; runbook | — | Approve retention periods |
| P4 | **Cookies / tracking** | Likely | Cookie inventory | No analytics/ads cookies; Google map loads only after click; cookie policy draft | E2E: map iframe absent until click | If analytics are added, add consent banner |
| P5 | **GLBA / FCRA** | Unlikely (no consumer financial products or background reports) | — | Not collecting credit/background data | — | Confirm no driver background checks are ordered through the site |
| C1 | **CAN-SPAM** | Possible (only if commercial email is sent) | Email program description | Only transactional emails; physical address in every email footer; no marketing sends implemented | — | If marketing email is added: unsubscribe link + suppression list + honoring within 10 business days |
| C2 | **TCPA** (calls/texts) | Possible (driver outreach) | Calling/texting practices | Separate optional "contact by phone/email" consent on driver registration, recorded with timestamp and notice version; **no SMS implemented**; no marketing texts | Consent stored (DB) | Before any SMS/autodialer use: prior express written consent language, opt-out handling, DNC checks |
| T1 | **FMCSA operating authority** (motor carrier / broker) | Unknown — depends on whether AM Consulting arranges transportation for compensation | Business model description; any USDOT/MC registrations held | Site copy avoids describing the company as a carrier or broker; terms state status is pending verification; "dispatch coordination" framed as administrative support | Content review | **Counsel to determine** whether activities require broker authority (49 U.S.C. §13904; FMCSA's 2023 guidance on bona fide dispatch agents) |
| T2 | **Bona fide dispatch agent** arrangement | Possible | Dispatch agreements with carriers | Dispatch records, communications log, documents module for agreements | — | Use written agreements; ensure dispatcher does not accept compensation from shippers without authority |
| T3 | Carrier vetting (insurance, authority) | Likely as business practice | COI/W-9 copies | Driver review workflow, documents (insurance category), expiry reminders, link to FMCSA SAFER lookup | — | Define vetting checklist |
| T4 | Georgia / state transportation rules (e.g. intrastate authority, GA DPS) | Unknown | Service area, intrastate operations | — | — | Counsel / GA DPS confirmation |
| B1 | **Business disclosures** — legal name, address, licences, insurance, certifications, statistics | Likely (FTC truth-in-advertising) | Articles of organisation, business licence, COI | Unverified stats removed; highlights shown only when marked verified; legal-name field in CMS; no certifications/insurance claims displayed | E2E asserts old unverified stats absent | Company to verify: registered name (three variants appear), address, service area, hours, any claims |
| S1 | Security safeguards (FTC Safeguards-style expectations) | Possible | Security program | See docs/06 | Unit/DB/E2E security tests | Incident response contact, breach-notification procedure under applicable state laws |
| S2 | Breach notification (all 50 states) | Likely if personal data breached | IR plan | Audit logs, login history, structured logs | — | Write incident response plan; counsel to map notification duties |

## Records the company should keep

Legal-review sign-off of each legal page (store in Documents → Business policy), dispatch agreements, carrier
COIs and W-9s, retention approvals, privacy request handling notes (in AMCMS), and any licences/authority.

## Update — November 13, 2026: legal pages published

The owner supplied a "Privacy & Website Policy" and asked for it to be published. The Privacy Policy,
Terms of Use (from its "Website Use Policy" part), Cookie Policy and Accessibility Statement are now
published without draft notices, effective **November 13, 2026** (`PRIVACY_POLICY_VERSION`
`2026-11-13`). At the owner's request the "Children" section was removed.

The text was checked against what the site actually does and corrected where the supplied draft was
out of date: the driver form now collects CDL, W-9, insurance and registration documents (stored
privately, restricted access); IPs are stored only as one-way hashes; retention periods match the
admin settings (24 / 12 / 24 months); Cloudflare Turnstile is listed where enabled.

A first-visit cookie notice (essential storage only, "Accept" stored with the policy version)
links to the Privacy and Cookie policies.

This is a factual-accuracy check, not legal advice. Retention deletion remains the manual quarterly
process in docs/07. If the published CMS content in a running database still holds older legal text,
update it under Website CMS → Legal.
