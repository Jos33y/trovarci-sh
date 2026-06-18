---
title: "How to Set Up SPF, DKIM, and DMARC - Step by Step"
slug: "spf-dkim-dmarc-setup"
description: "A practical, step-by-step guide to setting up SPF, DKIM, and DMARC records for your domain. No jargon. Just the records you need and where to put them."
date: "2026-03-08"
author: "Trovarcis Team"
category: "SMTP Guides"
tags: ["spf", "dkim", "dmarc", "dns", "email authentication"]
readingTime: 10
---

Every email you send is judged before it's read. Gmail, Yahoo, and Outlook check three things: is this sender who they claim to be? Did the email arrive unmodified? What should we do if the checks fail?

SPF, DKIM, and DMARC answer these three questions. They're DNS records you add to your domain. The setup takes 15 minutes. The impact is permanent.

## Before you start

You need access to two things: your **DNS management panel** (wherever you registered your domain - Cloudflare, Namecheap, GoDaddy, etc.) and your **email sending service dashboard** (wherever you get your SMTP credentials or API keys).

Have both open. You'll be copying values from one to the other.

## Step 1: Set up SPF

SPF tells mailbox providers which servers are authorized to send email from your domain. It's a single TXT record.

**The format:**

```
v=spf1 include:_spf.google.com include:amazonses.com -all
```

Breaking this down:

- `v=spf1` - this is an SPF record (required prefix)
- `include:_spf.google.com` - authorize Google Workspace to send as your domain
- `include:amazonses.com` - authorize Amazon SES to send as your domain
- `-all` - reject everything else (strict). Use `~all` for soft fail during testing.

**To add it:**

1. Go to your DNS panel
2. Add a new TXT record
3. Set the **Host/Name** to `@` (or leave blank - this means your root domain)
4. Set the **Value** to your SPF string
5. Save

**Common include values:**

| Provider | Include value |
|----------|--------------|
| Google Workspace | `include:_spf.google.com` |
| Amazon SES | `include:amazonses.com` |
| Resend | `include:amazonses.com` (Resend uses SES) |
| Mailgun | `include:mailgun.org` |
| SendGrid | `include:sendgrid.net` |
| Zoho Mail | `include:zoho.com` |

**Important:** You can only have ONE SPF record per domain. If you use multiple providers, combine them into a single record with multiple `include:` statements. Two separate SPF TXT records will break authentication.

**Verify it works:**

Wait 5 minutes for DNS propagation, then check with a DNS lookup tool or run:

```
dig TXT yourdomain.com
```

You should see your SPF record in the response.

## Step 2: Set up DKIM

DKIM adds a cryptographic signature to every email. The receiving server checks the signature against a public key stored in your DNS.

Unlike SPF, you don't write DKIM records yourself. Your email provider generates them for you.

**To set it up:**

1. Go to your email provider's dashboard
2. Find the DKIM or Authentication section
3. They'll give you one or more DNS records to add (usually CNAME or TXT)
4. The record name is typically something like `selector._domainkey.yourdomain.com`
5. Add each record to your DNS panel exactly as provided
6. Go back to your email provider and click "Verify" or wait for automatic verification

**Provider-specific locations:**

- **Google Workspace:** Admin Console → Apps → Google Workspace → Gmail → Authenticate email
- **Amazon SES:** Verified Identities → Your Domain → Authentication → DKIM
- **Resend:** Domains → Your Domain → DNS Records
- **Mailgun:** Sending → Domains → Your Domain → DNS Records

The selector name varies by provider. Google uses `google`, Amazon SES uses three separate selectors, Resend uses its own. Always copy exactly what your provider gives you.

**Verify it works:**

Send a test email to a Gmail address. Open the email, click the three dots menu, select "Show Original." Look for `dkim=pass` in the authentication results.

## Step 3: Set up DMARC

DMARC tells mailbox providers what to do when SPF or DKIM checks fail. It also sends you reports about who's sending email as your domain.

**Start with monitoring mode:**

```
v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com; pct=100
```

- `v=DMARC1` - this is a DMARC record
- `p=none` - don't take action on failures yet (just monitor)
- `rua=mailto:dmarc@yourdomain.com` - send aggregate reports to this address
- `pct=100` - apply this policy to 100% of emails

**To add it:**

1. Go to your DNS panel
2. Add a new TXT record
3. Set the **Host/Name** to `_dmarc`
4. Set the **Value** to your DMARC string
5. Save

**The progression:**

Don't jump straight to a strict policy. Follow this path:

1. **Week 1-2:** `p=none` - monitor only. Read the reports. See if legitimate emails are failing.
2. **Week 3-4:** `p=quarantine; pct=10` - quarantine 10% of failures. Watch for problems.
3. **Month 2:** `p=quarantine; pct=100` - quarantine all failures.
4. **Month 3+:** `p=reject; pct=100` - reject all failures. Full protection.

Moving too fast risks blocking your own legitimate emails. The reports at each stage tell you if something is misconfigured.

## Common mistakes

**Multiple SPF records.** Only one SPF TXT record per domain. Combine providers with `include:` statements in a single record.

**Too many DNS lookups in SPF.** SPF allows a maximum of 10 DNS lookups. Each `include:` counts as one. If you exceed 10, SPF fails silently. Use an SPF flattening tool if you hit this limit.

**Wrong DKIM selector.** Copy the selector name exactly from your provider. A single character difference breaks verification.

**DMARC set to reject immediately.** Start with `p=none`. Jumping to `p=reject` without monitoring will block legitimate emails you forgot to authenticate.

**Forgetting to update SPF when adding a new sending service.** Every time you add a new email provider, add their `include:` to your SPF record.

## Testing the complete setup

After configuring all three records, verify the chain:

1. Send a test email to a Gmail address
2. Open it → three dots → Show Original
3. Check for three green passes:
  - `spf=pass`
  - `dkim=pass`
  - `dmarc=pass`

If any one fails, go back to that specific record and double-check the configuration. DNS changes can take up to 48 hours to propagate globally, though most take effect within 15 minutes.

## What's next

With SPF, DKIM, and DMARC configured, your domain is authenticated. Mailbox providers now trust that emails from your domain are legitimate. This is the foundation - everything else in email deliverability builds on top of these three records.

If you want to generate these records automatically for your domain and email provider, try our free [DNS Record Generator](/records). It creates copy-paste-ready records with instructions for your specific DNS registrar.
