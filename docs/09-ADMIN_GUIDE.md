# AMCMS Administrator Guide

## First-time setup (once)

1. Deploy the stack (docs/12-DEPLOY_DIGITALOCEAN.md). Migrations apply automatically.
2. There is **no public sign-up**: accounts exist only when an administrator (or the server console)
   creates them.
3. Create the first administrator on the server:
   `docker compose exec app node scripts/create-admin.mjs owner@amconsultingllc.net "Owner Name"`
   * It prints a one-time link (24 h). The owner opens it, chooses a password (12+ characters), then
     scans the QR code with an authenticator app. They are now **Super Admin**.
   * Run it again any time to re-issue a link (e.g. the first one expired).
   * Existing users holding the legacy `admin` role keep full Admin access.
4. AMCMS → **System Settings**: consultation hours, internal email recipients, estimate defaults, session timeout.
5. AMCMS → **Website CMS**: verify **Brand & contact details** (legal name!), review legal drafts after counsel
   review, publish. Add **FAQs**. Upload the original hero video if recovered (docs/05).
6. AMCMS → **Quotes → Pricing rules**: enter your approved rates (none are pre-filled).

## Inviting staff

User Management → **Invite staff member** → choose roles → they receive an email, set a password (≥12
characters) and must enrol two-step verification at first sign-in.

| Role | Typical person |
|---|---|
| Super Admin | Owner — can manage administrators |
| Admin | Office manager |
| Operations Manager | Runs drivers, fleet, projects, dispatch |
| Dispatcher | Schedules jobs; edits jobs assigned to them or unassigned |
| Sales / CRM | Leads, customers, quotes, consultations |
| Content Editor | Website text, FAQs, media |
| Viewer | Read-only |

Deactivate departing staff immediately (User Management → Manage → Deactivate). Their sessions stop working.

## Daily workflows

* **New website inquiry** → appears in CRM (lead + submission) and in Notifications. Work it through the
  pipeline: New → Contacted → Qualified → Proposal Sent → Negotiation → Won/Lost. Log calls/emails as
  interactions; add follow-up tasks with due dates.
* **Quote request** → Quotes → Quote requests → *Create estimate from request* → add lines from pricing rules
  → Save draft → *Send to customer* (secure link; if email isn't configured AMCMS shows the link to share) →
  customer accepts/declines online → *Approve* → *Convert to project*.
* **Driver registration** → Driver Management → open application → assign reviewer → *Request info* (emails
  the applicant) / *Approve* (creates a driver record) / *Reject*. Verify USDOT/MC on FMCSA SAFER and collect
  COI/W-9 in the application's Documents panel.
* **Fleet** → add trucks, assign drivers (assignment history is automatic), keep registration/insurance/
  maintenance dates current — reminders appear 30 days ahead.
* **Dispatch** → New dispatch job → choose project/customer, pickup/destination, times, driver, truck. AMCMS
  blocks overlapping bookings for the same driver or truck and refuses trucks in maintenance. Move the job
  through the workflow; log communications and load tickets. Use Calendar (day/week/month with filters) and
  Workload views.
* **Consultations** → Appointments → confirm / reschedule / cancel (customer is emailed).
* **Website** → Website CMS → edit → *Save draft* → check the live preview → *Publish now* or *Schedule*.
  Every save is a revision you can restore. Only items marked **Verified** in *Highlights/statistics* are shown.

## Where to look when something goes wrong

* Security & Audit Logs → **Email delivery**: "skipped" means `RESEND_API_KEY` isn't set (submissions are still
  saved); "failed" shows the provider error.
* Security & Audit Logs → **Sign-ins**: failed/blocked attempts.
* Errors in AMCMS show a short reference (request id) — give it to your developer to find the server log line.
* Lost authenticator: a Super Admin opens **Users → (person) → Reset two-step verification**; the person
  re-enrols at next sign-in. If the only Super Admin is locked out, run on the server:
  `docker compose exec app node scripts/create-admin.mjs --reset-mfa their@email`.
* Forgotten password: **/auth/reset** emails a one-time link (needs `RESEND_API_KEY`). Without email, re-run
  `create-admin.mjs` for that address (Super Admins) or re-invite from **Users**.
* Inviting staff without email configured: the invite sheet shows a one-time link to pass on securely.
