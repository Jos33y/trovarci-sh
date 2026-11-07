---
title: "How to generate SPF, DKIM and DMARC records"
nav: "DNS Generator"
description: "Generate the SPF, DKIM, DMARC and MX records for your domain and email provider in three steps with the free DNS Generator, ready to paste into your DNS."
short: "Open the DNS Generator, type your domain and pick your email provider, then choose where your DNS is managed and a DMARC policy (start with None), and press Generate Records. Copy each record's host and value into your DNS settings. One SPF record only: if you already have one, replace it."
published: "2026-11-07"
checked: "2026-11-07"
topic: tools
order: 2
action: records
asks:
  - how to use the dns generator
  - spf record generator
  - dkim record generator
  - dmarc record generator
  - generate dns records for email
  - what spf record do i need
needs:
  - Your domain
  - Which email provider you use, such as Google Workspace or Microsoft 365
  - A login to wherever your domain's DNS is managed
related:
  - use-domain-checker
  - add-dmarc-record
  - google-workspace-spf-dkim-dmarc
post: spf-dkim-dmarc-setup
---

## 1. Provider

Open the [DNS Generator](/records). Type your domain under **Your domain** and pick your **Email provider**. If you also send through a service such as Amazon SES or SendGrid, add it under **Also hosting email on**: its SPF include is added to the same record. Press **Continue**.

## 2. Registrar

Choose **Where your domain's DNS is managed**, so the instructions match the screens you'll see. Then pick a **DMARC policy**:

| Policy | Use it when |
|---|---|
| None | You're setting up. Nothing is blocked; you get reports |
| Quarantine | Reports show only your own services sending, after two to four weeks |
| Reject | You're sure. Fake email using your domain is refused |

Add a **DMARC report email** if you want the reports. Press **Generate Records**.

## 3. Records

Each record shows a **Host** and a **Value** with a copy button. In your DNS settings, add a new record of the type shown, paste the host and value, and save. **Copy all records** copies them in one go.

| Record | Note |
|---|---|
| SPF | One per domain. If you already have a v=spf1 record, replace it with this one |
| DKIM | Your provider makes the key. Use the link shown to open its DKIM setup, then paste the key back into step 1 |
| DMARC | Always at the host _dmarc |
| MX | Only change these if you're moving email providers |

**Lookup breakdown** counts the DNS lookups your SPF record uses. Over 10 and SPF breaks: [how to fix it](/blog/spf-permerror-10-dns-lookups-fix).

## 4. Check it worked

Wait an hour, then run the [Domain Checker](/domain). Each record you added should show as found.
