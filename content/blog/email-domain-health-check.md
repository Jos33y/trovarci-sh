---
title: "Email domain health check: what each result means and how to fix it"
slug: "email-domain-health-check"
description: "Ran an email domain health check and got red marks? What each result means in plain words, which ones to fix first, and the exact fix for each."
date: "2026-08-24"
updated: "2026-11-06"
author: "trovarcis-team"
category: "Email Deliverability"
tags: ["domain-health", "spf", "dkim", "dmarc", "blacklist", "mx-records"]
readingTime: 5
---

**In short:** an email domain health check tells you whether your domain is set up so mail providers trust email from it. Fix problems in this order: a blocklist listing, then missing or broken SPF, then missing DKIM, then a missing or weak DMARC. Everything else can wait. Run the free [Domain Checker](/domain), then find your result below.

<nav class="picker" aria-labelledby="picker-title">
<p class="picker-title" id="picker-title">What did your check show?</p>
<ul>
<li><a href="#blacklisted"><strong>Listed on a blocklist</strong><span>Fix this first.</span></a></li>
<li><a href="#no-spf"><strong>No SPF, or an SPF error</strong><span>Including "too many DNS lookups".</span></a></li>
<li><a href="#no-dkim"><strong>No DKIM found</strong><span>Your emails aren't signed.</span></a></li>
<li><a href="#dmarc"><strong>No DMARC, or "p=none"</strong><span>Anyone can pretend to be you.</span></a></li>
<li><a href="#mail-server"><strong>Mail server problems</strong><span>No MX, no encryption, reverse DNS.</span></a></li>
<li><a href="#no-mail"><strong>My domain doesn't send email</strong><span>Still needs three records.</span></a></li>
</ul>
</nav>

## Listed on a blocklist {#blacklisted}

Mail providers check these lists before accepting email. A listing on Spamhaus can stop most of your mail from arriving.

1. Stop sending from that domain or server.
2. Find the cause: a bought or old list, a hacked email account or website, or a sudden jump in volume.
3. Fix it, then request removal on the list's own site. Spamhaus removal is always free.

Full walkthrough: [Is my domain blacklisted?](/blog/domain-blacklisted-check-fix)

## No SPF, or an SPF error {#no-spf}

SPF is a DNS record listing which services may send email for your domain.

- **No SPF:** add one. The [DNS Generator](/records) builds it for your email provider. You need **one** SPF record only; two break both.
- **"Too many DNS lookups" or "PermError":** your SPF record names too many services, and SPF stops working after 10 lookups. It still looks fine in your DNS panel. Remove services you no longer use. Full fix: [SPF PermError: the 10 DNS lookup limit](/blog/spf-permerror-10-dns-lookups-fix).
- **Ends in `+all`:** that lets anyone send as you. Change it to `~all`.

## No DKIM found {#no-dkim}

DKIM signs every email so providers can check it came from you and wasn't changed. Your email provider creates the key: turn on DKIM in its settings, then add the record it gives you to your DNS.

- Google Workspace: Admin console, Apps, Gmail, Authenticate email.
- Microsoft 365: Defender portal, Email authentication settings, DKIM.
- Other providers: search their help for "DKIM".

If the check says DKIM is missing but you set it up, your provider may use a selector name the checker didn't try. Send yourself an email in Gmail, choose **Show original**, and look for `DKIM: PASS`.

## No DMARC, or "p=none" {#dmarc}

DMARC tells providers what to do with email that fails SPF and DKIM, and sends you reports.

- **No DMARC:** add a TXT record at `_dmarc.yourdomain.com`. Start with `v=DMARC1; p=none; rua=mailto:you@yourdomain.com`. The [DNS Generator](/records) writes it for you.
- **"p=none":** fine while you set up, because nothing is blocked yet. That also means someone can still send email pretending to be you. Once your own email passes for a couple of weeks, change it to `p=quarantine`, then `p=reject`.

Gmail, Yahoo and Outlook require DMARC from anyone sending in bulk.

## Mail server problems {#mail-server}

- **No MX record:** email sent to your domain can't be delivered. Add the MX records your email provider gives you.
- **No STARTTLS:** email to your server travels without encryption, and some providers refuse it. Ask your host to turn on TLS.
- **Reverse DNS missing:** the server sending your email should have a name that matches its address. If you send through Gmail, Microsoft or an email service, they handle this. If you run your own server, ask your host to set the PTR record.

## My domain doesn't send email {#no-mail}

A domain that never sends email is the easiest one to fake, because nothing says it doesn't send. Add these three records and anyone pretending to be it gets blocked:

```
yourdomain.com          TXT   v=spf1 -all
yourdomain.com          MX    .   (priority 0)
_dmarc.yourdomain.com   TXT   v=DMARC1; p=reject;
```

The first says no one may send as this domain, the second says it receives no email, and the third tells providers to reject anything claiming to come from it.

## The rest

Results like DNSSEC, CAA, HSTS, BIMI or a single nameserver won't stop your email today. Fix them when the important ones are clear.

## A clean result isn't the whole story

A clean domain gets your email trusted. Whether it lands in the inbox also depends on your list and your message:

- **Your list:** remove dead addresses with the [Email Verifier](/verify).
- **Your message:** score it with the [Email Scorer](/score).

Run the check again whenever you add or remove an email service, move your DNS, or see more bounces than usual.

Sending to a big list from your own accounts? [Trovarcis Sender](/sender) checks the list before sending and keeps every account inside its limits.
