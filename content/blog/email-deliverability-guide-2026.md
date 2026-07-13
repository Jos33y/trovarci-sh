---
title: "The complete guide to email deliverability in 2026"
slug: "email-deliverability-guide-2026"
description: "What it takes to reach the inbox in 2026: authentication, reputation, the modern protocol layer, and inbox placement, with the fixes that actually work."
date: "2026-07-12"
author: "Trovarcis Team"
category: "Email Deliverability"
tags: ["deliverability", "spf", "dkim", "dmarc", "bimi", "mta-sts", "sender-reputation"]
readingTime: 13
---

You wrote the email. You hit send. It never arrived.

Not in spam. Not in Promotions. Just gone. The recipient never knew it existed. This is the deliverability problem, and in 2026 it affects more senders than ever, because the rules for what counts as legitimate email tightened significantly across 2024 and 2025 and are still tightening.

Email deliverability is the percentage of your emails that reach the inbox in a state the recipient will actually see. "Sent successfully" is not the same thing. That only means your SMTP server accepted the handoff. Deliverability means the recipient's mail server accepted the message, didn't route it to spam or Promotions, and displayed it where the person will notice it.

Three failure modes cost you inbox placement:

1. **Rejection at receipt.** The message never reaches the recipient's server. SMTP refuses it, or the receiving IP blocks the connection outright.
2. **Spam filtering.** The message arrives but gets routed to the Spam folder. Recipient may or may not check it.
3. **Silent deprioritization.** The message arrives, doesn't get filtered as spam, but Gmail routes it to Promotions or Yahoo/Outlook silently deprioritizes it into an "Other" folder. Recipient never sees it.

Each failure mode has different causes and different fixes. This guide covers all three, plus the 2026 protocol layer most articles still skip.

## What Gmail, Yahoo, and Outlook changed in 2024 and 2025

February 2024 was the inflection point. Google and Yahoo jointly published sender requirements that reset the industry baseline. Microsoft aligned by mid-2025. What used to be "best practice" is now enforced policy.

The requirements that apply to any sender with more than 5,000 messages per day to Gmail addresses:

**Full authentication.** SPF, DKIM, and DMARC must all be published, must pass, and must align. Missing any one of the three: your bulk mail rate-limits or bounces. This is enforced, not scored.

**One-click unsubscribe via RFC 8058.** The `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header alongside a proper `List-Unsubscribe` header with a POST-capable endpoint. Gmail then shows the native Unsubscribe button next to your sender name. Recipients who would have hit spam use that button instead, protecting your reputation. Missing this on bulk mail is a hard fail.

**Spam complaint rate under 0.3%.** Enforced monthly by Google Postmaster Tools. That's 3 complaints per 1,000 messages. Above 0.3% and your mail gets throttled. Above 0.5% and it starts landing in Spam automatically. Sustained above 0.5% and you get delisted from the Gmail sender pool.

**Valid Reverse DNS (PTR record)** on the sending IP. Missing PTR is one of the fastest ways to hit rate limits.

**Aligned From: address.** The `From:` header domain must match (or be a subdomain of) the domain used for DKIM signing. Address rewriting via marketing automation platforms that break alignment causes silent DMARC failures.

Below 5,000 daily, the rules technically don't apply as bright lines. But Gmail's classifier increasingly uses the same signals to sort messages for smaller senders too. In practice: build to the 5,000+ standard from day one. Retrofitting authentication and reporting infrastructure after you scale is significantly harder than starting there.

Yahoo mirrors Google's requirements almost exactly. Microsoft (Outlook, Hotmail, Live) tightened enforcement across late 2024 and 2025. They now require SPF and DKIM aligned to `From:`, and reject messages from domains without valid DMARC records at DNS query time. AOL, iCloud, and smaller providers generally follow Google's lead within 6 to 12 months. Assume any 2024 Gmail requirement is universal by mid-2026.

## Authentication: the three protocols that stopped being optional

Three DNS records tell mailbox providers your sending is legitimate. Zero authentication, or authentication that doesn't align, means every one of your messages arrives with a "who are you actually" question mark next to it.

### SPF (Sender Policy Framework)

An SPF record is a TXT record on your domain listing which servers are authorized to send email as that domain. When Gmail receives a message claiming to be from `you@yourdomain.com`, it queries `yourdomain.com` for the SPF TXT record and checks whether the connecting server's IP is authorized.

Common SPF failures in 2026:

- **Exceeds the 10 DNS lookup cap** (RFC 7208 section 4.6.4). Every `include:` in your record counts, and each include recursively expands into more lookups. A domain sending through 5+ services almost always crosses the cap. The fix requires pruning, subdomain delegation, or SPF flattening. Full walkthrough: [SPF PermError: the 10 DNS lookup limit and how to fix it](/blog/spf-permerror-10-dns-lookups-fix).
- **Alignment failure.** SPF passing does not mean DMARC passing. DMARC requires the SPF-authenticated domain to match (or align with) the `From:` header domain. Marketing automation platforms that use their own return-path domain break SPF alignment silently.
- **Multiple SPF records.** RFC 7208 mandates exactly one `v=spf1` record per domain. Publishing two returns `permerror`. Happens when a new service says "add this TXT record" and the admin creates a second record instead of merging.

### DKIM (DomainKeys Identified Mail)

DKIM adds a cryptographic signature to every message you send. The receiving server verifies the signature against a public key published in your DNS. It proves the message wasn't tampered with in transit and genuinely came from your domain.

Common DKIM failures:

- **Missing or unpublished selector.** Each sending service uses a named selector (for example `s1._domainkey.yourdomain.com`). If you rotate keys or add a new provider and forget to publish the selector, all messages from that provider fail DKIM.
- **Expired or rotated keys.** Some providers rotate keys automatically and require you to re-publish. If your published record goes stale, you get silent DKIM failures until someone reads a DMARC report.
- **Body modification in transit.** Aggressive email gateways or list managers that inject "Sent from XYZ" footers break the DKIM signature by modifying the body after signing.

### DMARC (Domain-based Message Authentication, Reporting, and Conformance)

DMARC ties SPF and DKIM together. It tells receiving servers what to do when SPF or DKIM fails, and asks them to send you reports so you can see who's sending as your domain.

The policy progression:

1. `p=none` monitor only. Read the reports for a few weeks to see all your legitimate senders.
2. `p=quarantine` send failing messages to spam. Use once you're confident your legitimate mail passes.
3. `p=reject` reject failing messages outright. Target policy for any domain that cares about impersonation protection.

Also configure `rua=mailto:your-reports@yourdomain.com` to receive daily aggregate reports. Without them you're flying blind on who's actually sending as your domain.

Full setup walkthrough with DNS record examples: [How to set up SPF, DKIM, and DMARC](/blog/spf-dkim-dmarc-setup).

## The 2026 protocol layer: BIMI, MTA-STS, TLS-RPT

Beyond SPF/DKIM/DMARC, three protocols shifted from "nice to have" to "expected" across 2025 and 2026.

### BIMI (Brand Indicators for Message Identification)

BIMI displays your brand logo next to your emails in supported clients (Gmail, Yahoo, Apple Mail, Fastmail). It requires:

1. `p=quarantine` or `p=reject` DMARC policy already in place. BIMI does not work at `p=none`.
2. A Verified Mark Certificate (VMC) from an authorized issuer (DigiCert, Entrust). Expect $1,500 to $2,500 annually.
3. A trademark-registered SVG logo in the SVG Tiny 1.2 profile format (no scripts, no external references).
4. A BIMI DNS record pointing to the SVG file and VMC certificate.

Impact on inbox performance: recipients see your logo next to your sender name, which typically improves open rates 10 to 15% in supported clients and provides visual authentication against spoofing.

Not for everyone. If you don't send high-volume marketing or transactional mail, BIMI is more overhead than benefit. For consumer-facing brands doing meaningful email volume, BIMI is expected in 2026.

### MTA-STS (SMTP MTA Strict Transport Security)

MTA-STS forces TLS encryption on inbound mail delivery. Without it, an attacker who can intercept SMTP traffic can strip the STARTTLS command and downgrade the connection to plaintext. With it, sending servers refuse to deliver over unencrypted connections.

Setup:

1. Publish a policy file at `https://mta-sts.yourdomain.com/.well-known/mta-sts.txt` declaring which MX hosts you accept and what minimum TLS version.
2. Publish a DNS TXT record at `_mta-sts.yourdomain.com` with a policy version identifier.
3. Ship with `mode: testing` first. Move to `mode: enforce` once you've verified no legitimate mail is being blocked.

Impact: prevents TLS downgrade attacks and passive interception. Required for any domain handling sensitive email (financial, healthcare, legal). Recommended for any professional domain.

### TLS-RPT (SMTP TLS Reporting)

TLS-RPT is the reporting counterpart to MTA-STS. It tells sending servers where to send daily reports on TLS negotiation failures. Publish a TXT record at `_smtp._tls.yourdomain.com` pointing to a mailbox that ingests the reports.

Without TLS-RPT, if your MTA-STS policy is causing legitimate mail to fail (bad TLS cert, MX misconfiguration), you have no visibility into the failures. Configure both together, always.

Generate all four record types (SPF, DKIM, DMARC, MTA-STS) from the [DNS Record Generator](/records). It also outputs the mta-sts.txt policy file content ready to serve from your `.well-known/` path.

## Sender reputation: the score you can't see

Your domain and your sending IPs both have reputations. Mailbox providers track how recipients interact with your mail. Opens, replies, and clicks improve reputation. Deletes without opening, spam complaints, and bounces hurt it.

New domains start with no reputation, which is almost as bad as bad reputation. This is why warming up matters. Start with small volumes to your most engaged recipients (existing customers, replied-to conversations, opted-in newsletter subscribers). Increase gradually over 4 to 8 weeks. A domain that jumps from 50 to 5,000 daily overnight looks exactly like a compromised account and gets treated like one.

Concrete thresholds enforced in 2026:

- **Bounce rate under 2%.** Ideally under 0.5%. A bounce means an address rejected your mail. High bounce rates signal you're not maintaining your list or you bought it. Clean before sending: the [Email Verifier](/verify) removes invalid addresses via live SMTP probe before they burn your reputation.
- **Spam complaint rate under 0.3%.** Enforced hard by Google as covered above. Complaints are almost entirely a permission problem, not a content problem. If people are complaining, they didn't opt in clearly or the sending frequency exceeded expectations.
- **Engagement rate above 20% opens.** Below that, Gmail assumes recipients don't want your mail regardless of content.
- **Volume consistency.** Send 1,000 daily every day for a month, then jump to 20,000, and your reputation drops for two weeks even if all 20,000 were legitimate. Ramp gradually.

The tool that shows you what Gmail sees: [Google Postmaster Tools](https://postmaster.google.com). Free. Requires verifying domain ownership. Shows your Gmail-specific reputation across four scores (IP reputation, domain reputation, feedback loop, spam rate) plus authentication pass rates and TLS negotiation stats. If you send any real volume to Gmail addresses and don't monitor this dashboard, you're operating blind.

Domain and IP reputation degrade over time from small issues that compound: an old sending service whose SPF include never got removed and now points at a shut-down IP, a DKIM key that expired six months ago, a list segment that hasn't been cleaned in two years. Run your domain through the [Domain Checker](/domain) monthly. 25+ checks across SPF, DKIM, DMARC, mail server config, SSL/TLS, and 15+ blacklists.

If your domain is already on a blacklist, the full diagnosis and delisting workflow: [Is your domain blacklisted? How to check and fix it](/blog/domain-blacklisted-check-fix).

## Inbox placement after authentication passes

Passing authentication and having good reputation gets your mail delivered. It does not guarantee it lands in Primary.

Gmail's Promotions tab is the silent killer. Not spam, so it doesn't count against your deliverability metrics. But recipients rarely check Promotions, and even when they do, they scan for shopping deals, not your product update or cold outreach.

The Primary-vs-Promotions decision is separate from the accept-or-reject decision. It runs on a different classifier trained on:

- **Content signals.** Subject-line patterns (percent signs, emoji, all-caps runs), HTML-to-text ratio, image density, link count, promotional vocabulary combinations. One or two are fine. Stacked, they push the score.
- **Structural signals.** Missing `List-Unsubscribe` header on bulk sends, `Precedence: bulk` header, `X-Mailer` values that identify marketing platforms.
- **Sender signals.** Shared IPs on transactional providers carry the reputation of every sender using them. Cold outreach through shared-IP transactional providers frequently lands in Promotions on IP reputation alone.
- **Engagement signals.** Per-recipient history is the strongest signal. A recipient who once replied to you gets your future messages in Primary regardless of content. A recipient who never opens you gets sorted into Promotions on volume alone.

Yahoo and Outlook have similar tab-based sorting (Focused vs Other in Outlook). Same signal groups, similar classifier logic.

The right diagnostic before making any content change: score the specific message that's failing. Analyzing by hand takes 20 minutes per message. The [Email Scorer](/score) runs the checks against a model trained on Gmail's public signals plus common failure patterns and returns the specific factors dragging placement, with concrete recommendations tied to each.

Common but ineffective fixes: telling recipients to whitelist you, asking them to drag messages to Primary, avoiding "spam words," moving to a different ESP. None of these address the underlying signals.

Effective fixes: reduce HTML weight, remove promotional subject-line patterns, add proper `List-Unsubscribe-Post` header, fix authentication alignment, warm up engagement gradually. Full breakdown: [Why your emails hit Gmail Promotions and how to move them to Primary](/blog/gmail-promotions-tab-fix).

## Infrastructure: shared vs dedicated, failover, throttling

Where you send from affects everything above.

**Shared vs dedicated IPs.** Shared IPs on transactional providers mean your reputation is entangled with every other sender on the same IP block. If someone else on your shared server sends spam, your deliverability drops with theirs. Dedicated IPs give you full control but require sustained volume to build and maintain reputation. Below 50,000 messages per month, a reputable shared IP usually outperforms a cold dedicated IP.

**Multi-provider failover.** If you're routing through multiple SMTP providers for redundancy, failover configuration matters. When one provider rate-limits you, your infrastructure should automatically shift to the next without dropping messages or sending duplicates. Naive round-robin failover often triggers duplicate sends when rate-limit responses are misinterpreted as transient failures.

**Throttling and pacing.** Gmail rate-limits sending IPs based on reputation. A cold IP might get 100 messages per hour to Gmail addresses. A warmed IP might get 10,000 per hour. Sending faster than your allowed rate triggers `421 Too many messages` responses and temporarily flags your IP. Configure your MTA to pace based on the receiving domain, not blindly.

**Reverse DNS (PTR).** Every sending IP must have a valid PTR record that matches the HELO/EHLO hostname. Missing or mismatched PTR is one of the fastest paths to rate limiting. Verify via the [SMTP Tester](/smtp-test), which runs a full handshake probe with plain-language output at every step.

**TLS everywhere.** Modern receivers require STARTTLS for delivery. Configure your MTA to require TLS 1.2 minimum, ideally 1.3. Enforce via MTA-STS as covered above.

## The diagnostic loop before every send

Deliverability is not a one-time setup. Every send is a data point. Every provider change, every new sending service added, every list clean, every campaign that under-performs, all of it moves your reputation and your inbox placement rate.

Build a repeatable diagnostic loop and run it before every campaign or major send:

1. **Domain health check.** [Domain Checker](/domain) verifies SPF, DKIM, DMARC, mail server config, SSL/TLS, and blacklist status in one pass. Free, no signup.
2. **Content score.** [Email Scorer](/score) grades the specific message you're about to send against Gmail Promotions and spam-filter signals. Returns concrete issues to fix.
3. **List clean.** [Email Verifier](/verify) removes invalid addresses via live SMTP probe before they bounce and damage your reputation.
4. **Authentication record audit.** [DNS Record Generator](/records) counts SPF lookups in real time and flags records approaching the RFC 7208 10-lookup cap. Also generates DKIM, DMARC, MTA-STS, and BIMI records.
5. **Send test.** [SMTP Tester](/smtp-test) probes your sending server and shows exactly where a connection succeeds or fails.

New Trovarcis accounts get 10 free credits at signup. One Email Scorer run or one single Email Verifier check costs one credit. No card required.

## What to do this week

Three actions ranked by impact:

1. **Verify authentication passes AND aligns.** Send a test message from your production sender to a personal Gmail address. View "Show Original." Confirm SPF, DKIM, and DMARC all say `pass`. If SPF is failing with `permerror`, the root cause is almost certainly the 10 DNS lookup limit: [SPF PermError fix guide](/blog/spf-permerror-10-dns-lookups-fix).
2. **Connect Google Postmaster Tools.** Verify your domain and start reading the reputation dashboards. If any score is red, that's your first fix regardless of what else you were planning.
3. **Score your next campaign before sending it.** Run the specific message through the [Email Scorer](/score) and fix the top three issues it flags. Don't send a 10,000-recipient campaign without knowing what the classifier will do with it.

Everything else (BIMI, MTA-STS, IP dedication, sophisticated warm-up sequences) comes after these three.
