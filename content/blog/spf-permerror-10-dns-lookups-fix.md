---
title: "SPF PermError: the 10 DNS lookup limit and how to fix it"
slug: "spf-permerror-10-dns-lookups-fix"
description: "Your SPF just broke. Every email from your domain is failing authentication. Here's why the 10-lookup cap exists, how to count yours, and three ways to fix it."
date: "2026-07-11"
author: "Trovarcis Team"
category: "SMTP Guides"
tags: ["spf", "dns", "email-authentication", "dmarc", "permerror"]
readingTime: 10
---

If SPF is suddenly failing with `permerror`, the root cause is almost never syntax. It's lookup budget. RFC 7208 caps SPF evaluation at 10 DNS-querying terms. Cross that cap and every email from your domain fails authentication, silently, until someone reads the DMARC reports.

You're probably here because of one of these:

- MXToolbox SPF check reporting "Too many DNS lookups"
- DMARC aggregate report showing `spf=permerror` on a rising share of your volume
- `Authentication-Results: spf=permerror` in a message header you copied out of Gmail's "Show original"
- Google Postmaster Tools showing a drop in SPF pass rate over the last week

The business impact: every message from your domain fails SPF. If DMARC alignment relied on SPF, that message now also fails DMARC. If your DMARC policy is `p=quarantine` or `p=reject`, you are losing mail right now. If your policy is `p=none`, you are not losing mail yet, but you are one policy tightening away from a full outage, and Gmail already treats permerror as a heavy negative signal.

Fix path below. Read all three sections before touching DNS.

## What the 10 DNS lookup limit actually is

RFC 7208 section 4.6.4 defines a hard cap: SPF evaluation must not require more than 10 DNS mechanisms or modifiers that trigger a DNS lookup. Cross the limit and the receiver returns permerror rather than continuing evaluation. The specification is prescriptive, not advisory. Every compliant mail server enforces it.

**Mechanisms that count toward the 10:**

- `include:` (1 lookup, plus the mechanisms inside the included record recurse into the parent budget)
- `a` (1 lookup for the A/AAAA record of the domain)
- `mx` (1 lookup for the MX record, plus 1 A/AAAA lookup per MX target)
- `redirect=` (1 lookup for the target's SPF record)
- `exists:` (1 lookup for the specified name)
- `ptr` (1 lookup, and deprecated by the RFC)

**Mechanisms that do NOT count:**

- `ip4:` (literal IPv4 address or CIDR range)
- `ip6:` (literal IPv6 address or CIDR range)
- `all` (matches any sender)
- Qualifiers on `all`: `-all`, `~all`, `+all`, `?all`

There is also a second, separate cap most articles miss. RFC 7208 section 4.6.4 also limits **void lookups** to 2. A void lookup is any DNS query that returns NXDOMAIN or an empty response. If your SPF record includes a mechanism pointing to a domain that no longer exists (a shut-down sending service, a mistyped hostname), that's a void lookup. Cross 2 void lookups and evaluation returns permerror even if you are comfortably under the 10-mechanism cap.

**Why the limit exists.** SPF is evaluated at message receipt. A receiving mail server processing tens of thousands of messages per second cannot afford to chase an unbounded chain of DNS lookups per message. The 10-lookup cap bounds the worst case. Without it, a maliciously crafted SPF record with a chain of nested includes could force a receiving server into hundreds of DNS queries per inbound message. The cap is a DoS prevention measure that all compliant receivers enforce.

## How to count the lookups in YOUR record

Look at a typical multi-sender record:

```
v=spf1 include:_spf.google.com include:sendgrid.net include:_spf.mailchimp.com ~all
```

Naive count: 3 includes, 3 lookups. Under the limit. Ship it.

Actual count: 6+ lookups. Here's why.

Each `include` triggers a DNS query for the SPF record at that target domain. Evaluation then recurses into whatever the target record contains. Every DNS-triggering mechanism inside the included record also counts against the parent's 10-lookup budget.

`_spf.google.com` currently expands to:

```
v=spf1 include:_netblocks.google.com include:_netblocks2.google.com include:_netblocks3.google.com ~all
```

That's 1 lookup for `_spf.google.com`, plus 3 more for its nested includes. 4 lookups for Google Workspace alone.

`sendgrid.net` expands to something along the lines of:

```
v=spf1 ip4:167.89.0.0/17 ip4:168.245.0.0/17 ip4:198.21.0.0/21 ~all
```

That's 1 lookup for `sendgrid.net`. The `ip4:` literals inside are free. Total: 1.

`_spf.mailchimp.com` similarly resolves to a flat list of `ip4:` ranges. Total: 1.

Running total: 4 (Google) + 1 (SendGrid) + 1 (Mailchimp) = 6 lookups. Under the cap.

Now add HubSpot's `_spf.hubspotemail.net`. Add Klaviyo's `_spf.klaviyo.com`. Add a custom transactional sender. You'll cross 10 without realizing it, because every service claims "just one include" but each one expands into 1 to 5 lookups internally, and provider records change without notice. A provider you added years ago at "1 include, 1 lookup" may today resolve to 4 lookups because they restructured their DNS zone.

The [DNS Record Generator](/records) counts every lookup in real time as you build or paste an SPF record. It recursively resolves each include, tallies the total, flags when you're over the RFC cap, and shows which mechanism is expensive. It also runs the void-lookup check most tools skip.

Free, no signup, no rate limit for individual checks. Paste your current TXT record, get the count in under 5 seconds, see exactly which include is eating your budget.

## The three fixes, in order of preference

Three viable approaches. Try them in this order.

### Fix 1: Prune (fastest, free, do this first)

Audit your senders. Remove includes for services you no longer use.

Most domains that hit the 10-lookup limit accumulated includes over years: a marketing platform trialed and abandoned, a transactional service migrated away from, a CRM whose SPF include never got removed after the account closed. Every one of those adds 1 to 5 lookups you no longer need.

Concrete steps:

1. List every current sender. Read your DMARC aggregate reports (or generate them by publishing a `rua=mailto:...` reporting address). The reports show every sending source that claimed authority for your domain in the last 24 hours. Anything sending real volume is a keeper. Anything that hasn't sent for 30+ days is a candidate for removal.
2. For every `include:` in your SPF record, check whether it corresponds to a live sender in step 1. If not, remove it.
3. Re-run the lookup count. Every removed include drops the total by 1 to 5.

Pruning often solves the problem on its own. A domain that grew from 6 to 12 includes over 3 years typically has 3 to 4 stale ones. Removing them returns you to 8 or 9. Under the cap.

### Fix 2: Subdomain delegation (structural, no ongoing maintenance)

Split senders across subdomains. Each subdomain has its own SPF record and its own independent 10-lookup budget.

Example DNS zone:

```
yourdomain.com          IN TXT "v=spf1 include:_spf.google.com ~all"
mail.yourdomain.com     IN TXT "v=spf1 include:sendgrid.net include:_spf.mailchimp.com ~all"
notify.yourdomain.com   IN TXT "v=spf1 include:_spf.hubspotemail.net ~all"
```

Employee mail sends from `@yourdomain.com`. Marketing sends `From: newsletter@mail.yourdomain.com`. Transactional notifications send `From: notifications@notify.yourdomain.com`. Each subdomain resolves to a different SPF record with its own 10-lookup budget.

DMARC alignment continues to work because DMARC allows relaxed alignment by default, which accepts any subdomain of the organizational domain. Your `_dmarc.yourdomain.com` policy applies to messages from any subdomain unless you publish subdomain-specific policies. If your DMARC is set to strict alignment (`aspf=s`), publish per-subdomain DMARC records or reconfigure to relaxed.

This is the fix you want if pruning got you close but not under the cap, or if your business genuinely uses that many sending services. It's structural. No ongoing maintenance beyond routing new senders to the correct subdomain.

### Fix 3: SPF flattening (last resort, requires monitoring)

Replace `include:` mechanisms with the resolved `ip4:` and `ip6:` ranges. IP literals don't count against the lookup cap.

Before:
```
v=spf1 include:_spf.google.com include:sendgrid.net ~all
```

After (flattened):
```
v=spf1 ip4:35.190.247.0/24 ip4:64.233.160.0/19 ip4:66.102.0.0/20 ip4:66.249.80.0/20 ip4:72.14.192.0/18 ip4:74.125.0.0/16 ip4:108.177.8.0/21 ip4:167.89.0.0/17 ip4:168.245.0.0/17 ~all
```

Under the lookup cap. But now you own the maintenance.

Provider IP ranges change. Google adds a new netblock. SendGrid rotates an IP range. If your flattened record goes stale, mail from the new IP fails SPF, silently, until someone reads a DMARC report or a recipient complains.

Only flatten when Fix 1 and Fix 2 cannot solve the problem. If you flatten manually, set a calendar reminder every 30 days to re-flatten. If you use an automated flattening service (dmarcian, EasyDMARC, ValiMail, and similar), configure a monitoring alert that fires the moment resolved IPs drift from your published record. Silent staleness is the single most common cause of "SPF was passing yesterday and is failing today with no changes on our end" incidents.

## Common mistakes to avoid

Four traps that produce the same symptom (permerror) with different root causes:

- **Multiple SPF TXT records at the same host.** RFC 7208 mandates exactly one `v=spf1` record per domain. Publishing two returns permerror regardless of lookup count. This happens most often when a new sending service says "add this TXT record" and the admin creates a second record instead of merging into the existing one. Consolidate to a single `v=spf1 ...` TXT record and delete the others.
- **Using the `ptr` mechanism.** Deprecated by RFC 7208 in 2014. Modern receivers may ignore it, log a warning, or return permerror. It also triggers a reverse DNS lookup per receiving server, which is slow and unreliable. Replace with `ip4:`, `ip6:`, or `include:` mechanisms.
- **Ignoring void lookups.** Every mechanism pointing to a domain that returns NXDOMAIN counts against the 2-void-lookup cap. This bites when a sending service shuts down and their include target stops resolving. The tool passes on lookup count but fails on void count. Check both.
- **Flattening without a monitoring plan.** Covered in Fix 3. If you flatten, you must monitor for drift. Otherwise it's a delayed outage.

## Verify the fix

After any change to your SPF record, verify in three places:

**1. Lookup count.** Re-run the [DNS Record Generator](/records) against your published record. Confirm the total is under 10 and void lookups are under 2. Both must be true. A record at 10/10 is technically compliant but has zero headroom for a provider adding one more nested include.

**2. Live send test.** Send a message from every sending source to a personal Gmail or Yahoo address. Open "Show Original." Look for the Authentication-Results header:

```
Authentication-Results: mx.google.com;
       spf=pass (google.com: domain of you@yourdomain.com designates
       203.0.113.42 as permitted sender)
       dkim=pass header.i=@yourdomain.com
       dmarc=pass
```

All three must say pass. If you added flattening, verify the sending IP falls inside your published `ip4:` ranges.

**3. DMARC aggregate reports.** Check the next 24 to 48 hour report cycle. The `spf=permerror` rate should drop to 0. If it doesn't, a receiving server may still be caching the old record. TTL determines how long that takes. Wait one full TTL cycle before assuming the fix didn't work.

Run the [Domain Checker](/domain) after step 1 to verify SPF, DKIM, and DMARC all pass alongside each other, plus mail server config, SSL, and blacklist status. SPF passing in isolation isn't enough for Gmail's 2024+ sender requirements. All three authentication protocols must pass and align.

## Where to start

Fix path in three moves:

1. Count the lookups on your current record with the [DNS Record Generator](/records). Note whether you're over on lookups, void lookups, or both.
2. Prune first. Delegate to subdomains second. Flatten only if the first two can't get you there.
3. Verify with a live send test and a fresh DMARC report cycle before assuming the fix stuck.

If SPF is now passing but your emails are still landing in Gmail Promotions instead of Primary, authentication alone won't move them. Content, structural, and engagement signals decide Primary vs Promotions after authentication passes. Read the [Gmail Promotions tab fix guide](/blog/gmail-promotions-tab-fix) for the diagnostic and the five fixes that actually move messages back to Primary.
