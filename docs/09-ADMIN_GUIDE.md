# AMCMS Administrator Guide

## First-time setup (once)

1. Apply database migrations (docs/07 → Release procedure).
2. In Supabase → Authentication: **disable sign-ups**, enable **TOTP MFA**, set the Site URL and redirect
   URL (`https://amconsultingllc.net/auth/update-password`).
3. Create the first administrator:
   * Supabase → Authentication → Users → **Invite user** (or Add user) with the owner's email.
   * Set the secret `BOOTSTRAP_SUPER_ADMIN_EMAIL=<that email>` and deploy.
   * The owner signs in at **/auth**, enrols an authenticator app, and is granted **Super Admin** automatically
     (only if no super admin exists yet).
   * Remove `BOOTSTRAP_SUPER_ADMIN_EMAIL` and redeploy.
   * *Alternative (SQL editor):* `insert into user_roles (user_id, role) select id, 'super_admin' from auth.users where email = 'owner@…';`
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
* Lost authenticator: a Super Admin removes the user's MFA factor in Supabase → Authentication → Users; the user
  re-enrols at next sign-in.
