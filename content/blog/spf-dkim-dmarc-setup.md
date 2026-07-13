---
title: "How to set up SPF, DKIM, and DMARC: a step-by-step guide"
slug: "spf-dkim-dmarc-setup"
description: "A step-by-step guide to setting up SPF, DKIM, and DMARC for your domain in 2026. Record formats for the major sending services, the alignment traps that cause silent failures, and how to verify the setup."
date: "2026-07-12"
author: "Trovarcis Team"
category: "SMTP Guides"
tags: ["spf", "dkim", "dmarc", "dns", "email-authentication", "alignment", "sender-requirements"]
readingTime: 11
---

Every email you send is judged before it's read. Gmail, Yahoo, and Outlook check three things: is this sender who they claim to be? Did the email arrive unmodified? What should we do if the checks fail?

SPF, DKIM, and DMARC answer these three questions. They're DNS records you add to your domain. The setup takes 15 minutes. The impact is permanent.

Two things changed the stakes in 2024. Google and Yahoo's February 2024 sender requirements made these three protocols mandatory for any domain sending more than 5,000 messages per day to Gmail addresses. Missing any one of them, or having them pass without aligning to the From: header domain, means your bulk mail rate-limits or bounces. By mid-2025, Microsoft aligned with the same requirements. In 2026 there is no such thing as "authentication is optional" for any sender at any real volume.

This guide gets you from zero to correctly configured in about 15 minutes of DNS work, with the specific record formats for the major sending services and the alignment traps that cause silent failures even when the three records technically "pass."

## Before you start

You need access to two things: your **DNS management panel** (wherever you registered your domain - Cloudflare, Namecheap, GoDaddy, and so on) and your **email sending service dashboard** (wherever you get your SMTP credentials or API keys).

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

**Important:** you can only have ONE SPF record per domain. If you use multiple providers, combine them into a single record with multiple `include:` statements. Two separate SPF TXT records will break authentication with `permerror`.

**Verify it works:**

Wait 5 minutes for DNS propagation, then check with `dig`:

```
dig TXT yourdomain.com
```

You should see your SPF record in the response. Or paste your domain into the [DNS Record Generator](/records), which resolves the record and counts every DNS lookup in real time so you can see the total against the RFC 7208 10-lookup cap covered in the next callout.

### The 10 DNS lookup limit

SPF evaluation is capped at 10 DNS lookups by RFC 7208 section 4.6.4. Every `include:` counts as one, and each included record recursively adds its own lookups against your budget. A domain sending through 5+ services often crosses the cap without realizing it, because each provider claims "just one include" but their included record expands into 2 to 5 more lookups internally.

If `dig TXT` reports success but real email fails with `spf=permerror` in Gmail's Show Original, you've hit the cap. Full diagnostic and three ranked fixes (prune, subdomain delegation, flattening): [SPF PermError: the 10 DNS lookup limit and how to fix it](/blog/spf-permerror-10-dns-lookups-fix).

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

### Two common gotchas after setup

- **Key rotation.** Some providers rotate DKIM keys automatically and expect you to re-publish the DNS record. If you configured DKIM 18 months ago and haven't touched it since, verify the currently published record matches what the provider expects today. Silent DKIM failure from a stale key is one of the most common causes of reputation degradation over time. Nobody notices until DMARC reports arrive showing a rising failure rate.
- **Body modification in transit.** Any middleware that modifies the email body after DKIM signing breaks the signature. Common culprits: mailing list servers that append "Sent from" footers, corporate security gateways that append disclaimers, marketing platforms that inject tracking pixels after signing. Test with the actual production sending path, not just a direct send from the ESP.

## Step 3: Set up DMARC

DMARC tells mailbox providers what to do when SPF or DKIM checks fail. It also sends you reports about who's sending email as your domain.

Before configuring the record itself: read the alignment section below. The most common silent failure with DMARC is not that a record is wrong. It's that SPF or DKIM pass for the wrong domain, so DMARC still fails even though both underlying protocols look green.

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

### The alignment trap

A message "passes SPF" and "passes DKIM" but still fails DMARC. This is the most common silent failure and it happens because DMARC has a separate requirement on top of the underlying protocols: the domain that authenticated via SPF or DKIM must **align** with the domain in the visible `From:` header.

Alignment has two modes:

- **Relaxed** (default): the authenticated domain must match the organizational domain of the From: header. `mail.yourdomain.com` authenticating for a `From: you@yourdomain.com` message aligns because both share `yourdomain.com`.
- **Strict** (`aspf=s` for SPF, `adkim=s` for DKIM): exact domain match required. `mail.yourdomain.com` no longer aligns with `yourdomain.com` under strict mode.

Where alignment fails silently:

- **Marketing automation platforms** that use their own return-path domain for bounce handling. SPF passes for the platform's domain, not yours. Alignment fails even though SPF technically passes.
- **Third-party ESPs** that DKIM-sign with their own domain rather than one authorized under yours. DKIM passes for the ESP, but not for you.
- **Rewrite-based forwarders** (some corporate MTAs, some mailing lists) that change the From: header after signing.

Fix: use your ESP's "verified sending domain" or "sender authentication" flow, which sets up DKIM signing under your domain and authorizes their servers under your SPF. Both SPF and DKIM then align to your From: address, DMARC passes, and you get the actual protection the policy is supposed to provide.

Verify alignment by sending a test message and checking Gmail's Show Original for `dmarc=pass` - not just `spf=pass` and `dkim=pass` individually.

## Common mistakes

**Multiple SPF records.** Only one SPF TXT record per domain. Combine providers with `include:` statements in a single record.

**Too many DNS lookups in SPF.** SPF allows a maximum of 10 DNS lookups. Each `include:` counts as one, and each include recursively adds its own lookups against your budget. Cross the cap and SPF fails with `permerror`. Three ranked fixes (prune, subdomain delegation, flattening): [SPF PermError: the 10 DNS lookup limit and how to fix it](/blog/spf-permerror-10-dns-lookups-fix).

**Wrong DKIM selector.** Copy the selector name exactly from your provider. A single character difference breaks verification.

**DMARC set to reject immediately.** Start with `p=none`. Jumping to `p=reject` without monitoring will block legitimate emails you forgot to authenticate.

**Forgetting to update SPF when adding a new sending service.** Every time you add a new email provider, add their `include:` to your SPF record. Also check the total lookup count doesn't push you over 10.

**Assuming SPF pass + DKIM pass means DMARC pass.** They don't automatically. Alignment is a separate requirement. See "The alignment trap" above.

## Testing the complete setup

After configuring all three records, verify the chain:

1. Send a test email to a Gmail address
2. Open it → three dots → Show Original
3. Check for three green passes:
  - `spf=pass`
  - `dkim=pass`
  - `dmarc=pass`

If any one fails, go back to that specific record and double-check the configuration. DNS changes can take up to 48 hours to propagate globally, though most take effect within 15 minutes.

Or run the [Domain Checker](/domain) against your domain. It verifies SPF syntax and alignment, DKIM selector presence, DMARC policy and reporting configuration, mail server configuration, SSL/TLS on the mail server, and blacklist listings across 15+ RBLs in one pass. Green across the board means your authentication baseline is correctly configured.

## Beyond DMARC: BIMI, MTA-STS, TLS-RPT

SPF, DKIM, and DMARC are the baseline. Three additional protocols matter for professional senders in 2026:

- **BIMI** displays your brand logo next to your emails in supported clients (Gmail, Yahoo, Apple Mail, Fastmail). Requires DMARC at `p=quarantine` or `p=reject`, a Verified Mark Certificate ($1,500 to $2,500 annually), and a specific SVG logo format. Improves open rates 10 to 15% in supported clients.
- **MTA-STS** forces TLS encryption on inbound mail delivery, preventing STARTTLS downgrade attacks. Required for professional domains handling sensitive email.
- **TLS-RPT** reports TLS negotiation failures so you can debug MTA-STS problems without going blind.

Full breakdown of when each matters and how to configure them, in [the complete guide to email deliverability in 2026](/blog/email-deliverability-guide-2026).

The [DNS Record Generator](/records) outputs BIMI and MTA-STS records alongside SPF, DKIM, and DMARC, so all five ship together with correct syntax and cross-referenced values.

## What's next

With SPF, DKIM, and DMARC configured and aligning to your From: domain, your authentication baseline is done. Mailbox providers can now verify emails from your domain are legitimate. Everything else in deliverability builds on this foundation.

Three follow-ups worth doing this week:

1. **Verify with a live test from every production sender.** Send a message from each sending source (transactional ESP, marketing platform, direct SMTP, and so on) to a personal Gmail address. View "Show Original." Confirm SPF, DKIM, and DMARC all say `pass` for each. If any fail, that specific sender is the problem, not your DNS. Fix that sender's authentication before you assume the baseline is complete.
2. **Connect Google Postmaster Tools.** Verify your domain at postmaster.google.com and start reading the reputation dashboards. This is the primary monitoring surface for Gmail-specific reputation, and it will tell you when a silent DKIM key rotation or SPF drift breaks something.
3. **Read the pillar for context.** [The complete guide to email deliverability in 2026](/blog/email-deliverability-guide-2026) covers reputation, inbox placement classifiers, the 2026 protocol layer, and infrastructure. Authentication is the floor. The pillar tells you what's on top of it.

To generate copy-paste-ready DNS records for your specific stack: the [DNS Record Generator](/records) outputs SPF, DKIM, DMARC, MTA-STS, and BIMI records with instructions for your DNS registrar. Free, no signup.
