/**
 * DRAFT legal content. These drafts describe what this codebase actually does, but they are
 * NOT legal advice and must be reviewed by AM Consulting LLC and qualified counsel before
 * publication. Items in [brackets] require company input.
 */
const DRAFT_BANNER =
  "<p><strong>Draft notice:</strong> This document is a draft pending review by AM Consulting LLC and qualified legal counsel.</p>";

const privacy = `${DRAFT_BANNER}
<h2>Who we are</h2>
<p>This website (amconsultingllc.net) is operated by [registered legal name — to be verified], doing business as AM Consulting LLC, 5300 Memorial Dr. Unit 103C, Stone Mountain, GA 30083 ("we", "us"). Contact: <a href="mailto:info@amconsultingllc.net">info@amconsultingllc.net</a>, 404-862-0305.</p>
<h2>Information we collect</h2>
<ul>
<li><strong>Contact and quote requests:</strong> name, email, phone, company, job/pickup and destination locations, service details and anything you include in your message.</li>
<li><strong>Driver / owner-operator registration:</strong> name, company, email, phone, service area, truck type and count, availability, USDOT and MC numbers where applicable, and notes.</li>
<li><strong>Consultation bookings:</strong> name, contact details, company, topic, chosen time and notes.</li>
<li><strong>Privacy requests:</strong> the details you provide so we can respond.</li>
<li><strong>Technical data:</strong> to prevent spam and abuse we process your IP address and store only a one-way (hashed) version alongside your submission, together with the time of submission.</li>
<li><strong>Consent records:</strong> when you acknowledge this notice or agree to be contacted, we record what you agreed to, the notice version and when.</li>
</ul>
<p>We do not ask for Social Security numbers, driver's licence numbers, or payment card information on this website.</p>
<h2>How we use information</h2>
<ul>
<li>To respond to inquiries, prepare estimates, schedule consultations and coordinate dispatch services.</li>
<li>To review driver and owner-operator registrations and communicate about their status.</li>
<li>To send transactional emails you request or expect (confirmations, status updates, estimates).</li>
<li>To keep the website secure, prevent fraud and abuse, and maintain business records.</li>
</ul>
<p>We do not sell personal information and do not use it for targeted advertising. We do not send marketing text messages.</p>
<h2>Service providers we share information with</h2>
<ul>
<li><strong>DigitalOcean</strong> — cloud server hosting for this website, its database and stored files (United States).</li>
<li><strong>Resend</strong> — transactional email delivery (when enabled).</li>
<li><strong>Address search (OpenStreetMap Nominatim, or Google Maps Platform where enabled)</strong> — if you use the address search on our forms (for example the quote form or the truck location on the driver registration), the text you type — and your device location if you choose "Use my location" — is sent from your browser to this service to suggest addresses.</li>
<li><strong>Google Maps</strong> — the contact page map loads from Google only after you choose to show it; Google may then set its own cookies.</li>
</ul>
<p>We may also disclose information if required by law or to protect our rights, and to a successor in a business transfer. [Company to confirm any other recipients.]</p>
<h2>Retention</h2>
<p>We keep information only as long as needed for the purposes above and our legal obligations. Our current targets are: contact submissions — 24 months; registrations that are not approved — 12 months after decision; approved driver and customer records — for the business relationship plus [period to be confirmed]; privacy request records — 24 months. [Company and counsel to confirm.]</p>
<h2>Your choices and rights</h2>
<p>You can ask us to access, correct, or delete your personal information, or to stop contacting you, by using our <a href="/privacy/request">privacy request form</a> or emailing us. Depending on the state where you live, you may have additional rights under state privacy law; we will respond as required by applicable law. We will verify requests before acting on them and will not discriminate against you for exercising your rights.</p>
<h2>Security</h2>
<p>We use encryption in transit, access controls limited to authorised staff, multi-factor authentication for staff accounts, and audit logging. No method of transmission or storage is completely secure.</p>
<h2>Children</h2>
<p>This website is intended for businesses and adults. We do not knowingly collect information from children under 13.</p>
<h2>Changes</h2>
<p>We will post any changes to this notice on this page and update the date above.</p>`;

const terms = `${DRAFT_BANNER}
<h2>Acceptance</h2>
<p>By using amconsultingllc.net you agree to these Terms of Use. If you do not agree, please do not use the site.</p>
<h2>Nature of our services</h2>
<p>AM Consulting LLC provides administrative dispatch coordination, hauling consulting and logistics support. Information on this website is general and is not a binding offer. Any services are subject to a separate written agreement. [Company and counsel to confirm the company's regulatory status. Nothing on this site states or implies that AM Consulting LLC holds motor carrier or freight broker operating authority unless that has been verified.]</p>
<h2>Estimates and quotes</h2>
<p>Estimates provided through this website are for planning purposes only and are not binding commitments until confirmed in a written agreement signed by an authorised representative.</p>
<h2>Your submissions</h2>
<p>You agree that information you submit is accurate and that you are authorised to submit it. Do not submit information about other people without their permission.</p>
<h2>Acceptable use</h2>
<p>You may not attempt to gain unauthorised access to the website or its systems, interfere with its operation, submit spam or malicious content, or scrape it in a way that burdens our systems.</p>
<h2>Intellectual property</h2>
<p>The website content, logo and design belong to AM Consulting LLC or its licensors and may not be reused without permission.</p>
<h2>Disclaimers and limitation of liability</h2>
<p>The website is provided "as is". To the extent permitted by law, we disclaim implied warranties and are not liable for indirect or consequential damages arising from use of the website. [Counsel to finalise.]</p>
<h2>Governing law</h2>
<p>These terms are governed by the laws of the State of Georgia, without regard to conflict-of-law rules. [Counsel to confirm.]</p>
<h2>Contact</h2>
<p><a href="mailto:info@amconsultingllc.net">info@amconsultingllc.net</a> · 404-862-0305</p>`;

const accessibility = `${DRAFT_BANNER}
<h2>Our commitment</h2>
<p>AM Consulting LLC wants everyone to be able to use this website. We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.2 Level AA.</p>
<h2>What we have done</h2>
<ul>
<li>Semantic page structure with headings, landmarks and a "skip to main content" link.</li>
<li>Keyboard-operable navigation, forms and dialogs with visible focus indicators.</li>
<li>Labelled form fields with error messages announced to assistive technology.</li>
<li>Colour contrast checked against WCAG AA for text and controls.</li>
<li>Animations and the 3D/video background respect your device's "reduce motion" setting, and the background can be paused.</li>
<li>All key information is available without interacting with the 3D scene.</li>
</ul>
<h2>Known limitations</h2>
<p>The interactive 3D truck scene is decorative; an equivalent text description and a static image are provided. Third-party content such as the optional Google map may not fully conform. We are working to address any issues reported to us.</p>
<h2>Feedback and assistance</h2>
<p>If you have difficulty using any part of this site, contact us at <a href="mailto:info@amconsultingllc.net">info@amconsultingllc.net</a> or 404-862-0305. Please tell us the page and the problem; we aim to respond within 2 business days and can provide information in an alternative format.</p>`;

const cookies = `${DRAFT_BANNER}
<h2>Summary</h2>
<p>This website does not use advertising or analytics cookies.</p>
<h2>What is stored on your device</h2>
<ul>
<li><strong>Visitors:</strong> we store a short-lived item in your browser's session storage to show your driver-registration confirmation page. It is removed when you close the tab. Your reduced-motion and hero-playback preferences may be saved in local storage.</li>
<li><strong>Staff sign-in:</strong> authorised staff who sign in to the management system receive a strictly necessary session cookie (<code>amcms_session</code>) that keeps them signed in for up to 12 hours.</li>
<li><strong>Google Maps (optional):</strong> the contact page map is not loaded until you click "Show map". If you do, Google may set cookies under its own policies.</li>
</ul>
<h2>Managing storage</h2>
<p>You can clear cookies and site data in your browser settings. Strictly necessary items cannot be disabled without affecting how the site works.</p>
<p>If we add analytics or other non-essential cookies in future, we will update this policy and ask for your choice where required.</p>`;

export const LEGAL_DEFAULTS = {
  "legal.privacy": {
    title: "Privacy Policy",
    lastUpdated: "November 2, 2026 (draft)",
    body: privacy,
  },
  "legal.terms": { title: "Terms of Use", lastUpdated: "November 2, 2026 (draft)", body: terms },
  "legal.accessibility": {
    title: "Accessibility Statement",
    lastUpdated: "November 2, 2026 (draft)",
    body: accessibility,
  },
  "legal.cookies": {
    title: "Cookie Policy",
    lastUpdated: "November 2, 2026 (draft)",
    body: cookies,
  },
};
