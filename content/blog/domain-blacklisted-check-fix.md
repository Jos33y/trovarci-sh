---
title: "Is your domain blacklisted? How to check and fix it"
slug: "domain-blacklisted-check-fix"
description: "Your emails might be landing in Spam because your domain or sending IP is on a blacklist. Here's how to find out, what caused it, and how to get removed."
date: "2026-07-12"
author: "Trovarcis Team"
category: "Email Deliverability"
tags: ["blacklist", "domain-reputation", "spam", "deliverability", "postmaster-tools", "dnsbl"]
readingTime: 8
---

You're sending emails. Your SMTP is configured. SPF, DKIM, DMARC all pass. But your emails still land in Spam or never appear at all. The most common hidden cause: your domain or your sending IP is on a blacklist.

First, a distinction. This post is about actual blacklists (also called DNSBLs or blocklists) that reject or spam-fold your mail at receipt. That is a different failure mode from Gmail's Promotions tab, where your mail is technically delivered but silently routed away from the recipient's Primary inbox. If your mail is arriving in Promotions rather than Spam, delisting won't help - the fix is [content signal cleanup for Gmail's inbox placement classifier](/blog/gmail-promotions-tab-fix).

If your mail is genuinely landing in Spam or getting rejected at receipt, keep reading.

## What is a domain blacklist

A blacklist (also called a DNSBL or blocklist) is a database of IP addresses and domains that have been flagged for sending spam or malicious email. Mailbox providers like Gmail, Yahoo, and Outlook check these lists when deciding whether to accept your email.

If your domain or sending IP appears on a major blacklist, your emails get rejected outright or sent to Spam automatically. It doesn't matter how good your content is. Authentication passing doesn't override a blacklist listing.

## How domains end up on blacklists

Most blacklistings happen for one of these reasons:

- **Sending to bad addresses.** High bounce rates signal that you're not maintaining your list. A bounce rate above 2% is a red flag. Above 5% and you're actively hurting your reputation on every send.
- **Spam complaints.** Recipients marking your emails as spam feeds back to your reputation. Google's February 2024 sender requirements set the hard cap at 0.3% - that's 3 complaints per 1,000 messages. Above that, Gmail throttles you. Sustained above 0.5% and you get delisted from Gmail's accepted sender pool. Yahoo enforces similar limits. Blacklists like Spamhaus watch aggregated complaint feeds and use them to trigger listings.
- **Compromised sending infrastructure.** If someone gains access to your SMTP credentials and sends spam through your server, your IP gets blacklisted fast. Rotating credentials monthly and monitoring for unusual send volume catches this early.
- **Shared IP reputation.** If you're on a shared SMTP server (SendGrid, Mailgun, Postmark on shared tier), someone else's bad behavior can affect your deliverability. You inherit the reputation of everyone on the block.
- **Purchased email lists.** Buying lists almost guarantees blacklisting. Purchased addresses frequently include spam traps: addresses seeded specifically by anti-spam operators to catch senders using non-consented lists. Hit one trap and you're on Spamhaus within hours.
- **Authentication failures.** Domains publishing SPF, DKIM, or DMARC that fail evaluation get flagged more aggressively than domains with no authentication at all - "trying but broken" reads as compromise or misconfiguration to blacklist operators. If your SPF is failing with `permerror` because you crossed the 10 DNS lookup cap, that alone can put your domain on watchlists. Full diagnostic: [SPF PermError: the 10 DNS lookup limit and how to fix it](/blog/spf-permerror-10-dns-lookups-fix).

## The major blacklists that matter

Not all blacklists carry the same weight. These are the ones that mailbox providers actually check:

| Blacklist | Impact | Used By |
|-----------|--------|---------|
| Spamhaus (SBL, XBL, PBL) | Critical | Gmail, Outlook, Yahoo, most providers |
| Barracuda (BRBL) | High | Corporate mail servers, Barracuda appliances |
| SORBS | Medium | Some corporate filters |
| SpamCop | Medium | Various providers |
| CBL (Composite Blocking List) | High | Part of Spamhaus XBL |
| UCEPROTECT (Levels 1, 2, 3) | Low to Medium | Small corporate filters |

Spamhaus is by far the most impactful. If you're on Spamhaus SBL or XBL, almost nothing gets through to Gmail, Outlook, or Yahoo. Listings on smaller lists (UCEPROTECT L2/L3, some SORBS categories) cause less real-world damage because major providers don't consult them. Prioritize Spamhaus first.

## How to check if you're blacklisted

You can check manually by visiting each blacklist's lookup tool. Spamhaus has check.spamhaus.org, Barracuda has barracudacentral.org/lookups, and so on. Each takes 30 seconds, so covering the 6 major lists is 3 to 5 minutes of work.

The faster approach: run one aggregate check that queries multiple blacklists in a single pass. The [Domain Checker](/domain) covers 15+ blacklists (Spamhaus SBL/XBL/PBL, Barracuda, SORBS multi-category, SpamCop, CBL, UCEPROTECT, and more) plus SPF, DKIM, DMARC, mail server configuration, SSL/TLS, and DNS setup. Paste a domain, wait 10 seconds, get the full report. Free, no signup.

## Monitor Gmail-specific reputation with Postmaster Tools

Before you go hunting through generic blacklists, check whether Gmail itself has flagged you. [Google Postmaster Tools](https://postmaster.google.com) is the single most important reputation monitoring surface if any real percentage of your recipients are on Gmail (which in 2026 is roughly 30% of global email addresses).

Postmaster Tools shows you:

- **Domain reputation** across four buckets (Bad, Low, Medium, High). Anything below High affects your inbox placement.
- **IP reputation** for each sending IP you've used with your domain.
- **Spam rate** measured over rolling 7-day windows. Gmail's 0.3% hard cap enforcement uses this number.
- **Authentication pass rates** for SPF, DKIM, and DMARC broken down separately, so you can see which one is silently failing on which sender.
- **Delivery errors** aggregated by rejection reason.
- **Feedback loop data** on complaints - which recipients complained and which messages triggered it.

Setup takes 10 minutes:

1. Go to postmaster.google.com and add your domain.
2. Verify ownership via a DNS TXT record (Google gives you the exact value to publish).
3. Wait 24 to 48 hours for the first data point to appear.
4. Check the dashboard weekly.

If any score is red or trending down, that's your first fix regardless of what any generic blacklist says. Gmail is the largest single mailbox provider - fixing your Gmail reputation typically resolves the underlying issues that got you blacklisted elsewhere too, because the causes overlap.

## How to get removed from a blacklist

Each blacklist has its own removal process:

**Spamhaus (SBL, XBL, PBL).** Visit their removal center at check.spamhaus.org. Enter your IP or domain. The lookup returns the specific listing category and a reason. Fix the underlying issue first (see prevention section below), then submit a delisting request through their web form. Spamhaus typically processes requests within 24 to 48 hours if the underlying issue is verifiably resolved. Repeated re-listings extend the required cooldown period.

**Barracuda (BRBL).** Submit a removal request at barracudacentral.org/rbl/removal-request. Provide the sending IP, describe what caused the listing, and explain what you fixed. Barracuda reviews manually and typically responds within 12 hours.

**SORBS.** Some SORBS categories (spam-source, spam-relay) auto-expire 48 hours after the source of the listing stops. For persistent categories, submit a delisting request via their website. SORBS is known for being slow and sometimes unresponsive - if you're only listed on SORBS and no major providers are affecting your deliverability, it may not be worth pursuing.

**SpamCop.** Listings expire automatically within 24 hours after spam reports stop. No manual removal process. Fix the source, wait a day, re-check.

**CBL (via Spamhaus XBL).** CBL is part of Spamhaus XBL and shares the same removal flow. Fix the underlying issue (usually a compromised device or open relay) and request delisting through check.spamhaus.org.

**The key rule:** fix the problem before you request removal. If you request delisting without addressing the cause, most blacklists will re-list you within days and increase the cooldown period. Some (Spamhaus in particular) permanently blackmark repeat offenders.

## Preventing future blacklistings

Prevention is far easier than removal. These practices keep you off blacklists:

**Clean your list regularly.** Remove bounced addresses immediately. Run your list through the [Email Verifier](/verify) before campaigns to catch invalid addresses via live SMTP probe. Cleaning before sending prevents most bounce-driven blacklistings.

**Monitor Google Postmaster Tools weekly.** Covered above. React to any score dropping from High to Medium before it drops further. This is your early warning system.

**Warm up new IPs gradually.** Don't send 50,000 emails on day one from a new IP. Start with 100 per day and ramp up 20% weekly over 4 to 6 weeks. Sudden volume spikes look identical to compromised accounts to blacklist operators, and the algorithmic response is delisting first, questions later.

**Authenticate everything and align it.** SPF, DKIM, and DMARC should all be configured, passing, AND aligning to your From: header domain. Alignment is where most silent failures happen. Full walkthrough: [how to set up SPF, DKIM, and DMARC](/blog/spf-dkim-dmarc-setup).

**Use double opt-in.** Require email confirmation before adding contacts to your list. Double opt-in eliminates spam traps almost entirely (nobody accidentally confirms a trap address) and reduces complaints dramatically because the recipient explicitly asked for your mail.

**Watch your domain health monthly.** Reputation degrades from small issues that compound over time: expired DKIM keys, stale SPF includes for services you no longer use, misconfigured MTA settings, MX records pointing at hosts that stopped responding. Run your domain through the [Domain Checker](/domain) monthly to catch these before a blacklist does. Reputation loss to compounding neglect is entirely preventable and entirely common.

**Segment sending by intent.** Cold outreach, transactional, and marketing should ideally send from different subdomains (`mail.yourdomain.com`, `notify.yourdomain.com`) so a reputation hit on one doesn't take down the others. This is the same subdomain-delegation pattern that solves the SPF 10-lookup problem, and it protects reputation the same way.

## What to do right now

Three actions ranked by impact:

1. **Check your current domain health.** Run your sending domain through the [Domain Checker](/domain). It checks SPF, DKIM, DMARC, mail server config, SSL/TLS, and blacklist status across 15+ RBLs in one pass. Free, no signup.
2. **Verify Google Postmaster Tools.** If Gmail is a meaningful percentage of your recipients (in 2026, it usually is), this is the first monitoring surface to configure. Reading the dashboards weekly catches issues before they escalate into blacklistings.
3. **Clean your next send before it goes out.** Run the recipient list through the [Email Verifier](/verify) to remove invalid addresses that would bounce and hurt your reputation on every send.

If you're already blacklisted, work through the removal process for the specific list you're on (see above). If your domain checks clean today, keep it that way with monthly monitoring and disciplined list hygiene.

For the broader context on why domains land on blacklists in the first place - reputation mechanics, the 2024 sender requirements, and how modern authentication interacts with blocklist scoring - see [the complete guide to email deliverability in 2026](/blog/email-deliverability-guide-2026).
