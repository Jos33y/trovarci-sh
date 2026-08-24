---
title: "Email domain health check: the 25 tests that matter and what each failure means"
slug: "email-domain-health-check"
description: "What an email domain health check actually tests, what each failure costs you in inbox placement, and how to run the full audit on your own domain in under a minute."
date: "2026-08-24"
author: "Trovarcis Team"
category: "Email Deliverability"
tags: ["domain-health", "deliverability", "spf", "dkim", "dmarc", "blacklists", "dns"]
readingTime: 10
---

An email domain health check tests whether your domain is configured to send and receive mail that mailbox providers will accept. It covers five areas: authentication records, mail server configuration, reputation and blacklist status, transport security, and DNS setup.

It answers a question most senders cannot answer about their own domain: if Gmail looked at this domain right now, would anything about it give a reason to route mail to spam.

Most people run one for a specific reason. Open rates dropped. A campaign bounced at a rate that made no sense. Someone forwarded a message that landed in the recipient's junk folder. Something changed and there is no obvious cause.

This is the full list of what to test, what each failure actually costs, and which failures to fix first.

## The five categories, and the 25 tests inside them

### Email authentication, 9 tests

This is the layer that proves the mail came from you.

1. **SPF record present.** A valid `v=spf1` TXT record on the root domain.
2. **SPF lookup count.** The record and everything it includes must resolve in 10 DNS lookups or fewer, per RFC 7208 section 4.6.4.
3. **SPF policy.** The final mechanism: `-all`, `~all`, or `?all`. Each behaves differently and only one is right for your situation.
4. **DKIM selectors.** Public keys published at common selector paths.
5. **DKIM key size.** 1024 bits or larger.
6. **DMARC record present.** A valid `_dmarc` TXT record.
7. **DMARC policy.** `p=none`, `p=quarantine`, or `p=reject`.
8. **DMARC reporting.** A `rua` address so aggregate reports have somewhere to land.
9. **BIMI.** Optional. A `_bimi` TXT record with a valid logo URL.

### Mail server, 5 tests

10. **MX records present.** The domain publishes at least one mail exchanger.
11. **MX not a CNAME.** An MX target pointing at a CNAME is a protocol violation that some receivers reject outright.
12. **SMTP reachable.** The primary MX answers on port 25 inside a normal timeout.
13. **STARTTLS supported.** The server advertises STARTTLS and completes the TLS handshake.
14. **Reverse DNS.** The PTR record resolves forward again, confirming the hostname.

### Reputation, 3 tests

15. **IP blacklists.** The sending IP checked against public DNSBL zones.
16. **Domain blacklists.** The domain checked against Spamhaus DBL and SURBL.
17. **Safe Browsing.** Whether Google flags the domain as deceptive.

### Security, 4 tests

18. **SSL certificate.** Present, valid, and not expired.
19. **HTTPS redirect.** HTTP requests redirect to HTTPS.
20. **HSTS header.** Strict-Transport-Security present.
21. **CAA records.** Restricting which certificate authorities can issue for the domain.

### DNS configuration, 4 tests

22. **Nameserver redundancy.** At least two authoritative nameservers.
23. **Nameserver diversity.** Nameservers spanning more than one network prefix.
24. **SOA record.** Present, with sensible refresh, retry, and expire values.
25. **DNSSEC.** DS record present and the chain of trust validates.

Run all 25 against your own domain with the [Domain Checker](/domain). It takes about ten seconds, needs no account, and returns each result with a plain-language explanation rather than a status code. If you want to see what a real report looks like before reading further, run it now and read the rest with your own results in front of you.

## What each failure actually costs

Most checkers hand you a list of red items with no sense of which one is on fire. These are the failures ranked by what they actually do to your mail.

### Critical, fix today

**No SPF record.** Receiving servers cannot verify which hosts are authorized to send for your domain. Anyone can send mail claiming to be from your domain and it will not fail authentication. Gmail, Yahoo, and Microsoft all deprioritize or reject unauthenticated mail.

**SPF PermError from too many DNS lookups.** Worse than having no SPF at all, because the record looks correct in a DNS panel and fails in production. It appears the moment your fifth or sixth sending service pushes the recursive count past 10. Diagnosis and three ranked fixes: [SPF PermError: the 10 DNS lookup limit and how to fix it](/blog/spf-permerror-10-dns-lookups-fix).

**No MX records on a domain that receives mail.** Every message sent to your domain fails. Depending on the sender's configuration it either bounces immediately or sits in a queue for days before failing. If you publish a support address on your website and the domain has no MX, every reply to it disappears.

**Domain or sending IP on a blacklist.** Spamhaus ZEN and DBL are the two that matter most, because a large share of receivers query them directly. A ZEN listing can drop delivery to near zero within hours. Full diagnosis and the delisting workflow: [Is your domain blacklisted? How to check and fix it](/blog/domain-blacklisted-check-fix).

### Serious, fix this week

**No DKIM signing.** Messages carry no cryptographic proof they arrived unmodified. Without DKIM, DMARC can only pass through SPF, and SPF breaks on forwarding. Any mail that passes through a mailing list or a forwarding rule fails authentication end to end.

**DMARC missing or set to `p=none`.** A monitoring-only policy means spoofed mail claiming to be from your domain still gets delivered. You receive reports about it. Nothing stops it. Moving to `p=quarantine` and then `p=reject` is what converts DMARC from a dashboard into a defense.

**DMARC with no `rua` address.** No reports are generated, so you have no visibility into who is sending as your domain or which of your own senders are failing alignment.

**STARTTLS not supported.** Mail arrives unencrypted in transit. Modern receivers increasingly require TLS, and some refuse plaintext delivery entirely.

**Missing or mismatched reverse DNS.** One of the fastest paths to rate limiting. Receivers check that the sending IP's PTR record resolves forward to the same hostname the server announced in HELO.

### Worth fixing, not urgent

DKIM keys under 1024 bits. Missing CAA records. No HSTS header. Single nameserver. No DNSSEC. Missing BIMI. None of these will stop mail today. All of them are signals that a domain is casually maintained, and several of them matter more in a security review than in a mailbox.

## The case nobody covers: domains that send no mail

Most domain health advice assumes you are trying to send. A large share of domains are not. Marketing sites, redirect domains, landing page domains, and product domains where mail is handled somewhere else entirely.

These domains are the most commonly spoofed and the least often protected, because their owners reasonably assume that a domain with no mailbox has nothing to attack.

The opposite is true. A domain with no SPF record and no DMARC policy is an open invitation. An attacker sends invoices as `billing@yourdomain.com`, and because nothing in DNS says that is unauthorized, the mail is delivered. Your customers receive it. Your domain takes the reputation damage. You find out when someone calls to ask why they were asked to pay to a new bank account.

The fix for a domain that sends and receives no mail is three records:

```
yourdomain.com          TXT   v=spf1 -all
yourdomain.com          MX    .           priority 0
_dmarc.yourdomain.com   TXT   v=DMARC1; p=reject; rua=mailto:dmarc@yourdomain.com;
```

`v=spf1 -all` says no host is authorized to send for this domain. Hard fail is correct here, not the softer `~all`, because there are no legitimate senders to accidentally block. Nothing is being hedged.

The single `.` MX at priority 0 is a null MX record, defined in RFC 7505. It tells sending servers that this domain accepts no mail, so a message addressed to it fails immediately and clearly rather than retrying for days.

`p=reject` instructs receivers to drop anything claiming to be from the domain, which is every message, since nothing legitimate exists.

**One trap worth knowing.** If the `rua` address sits on a different domain than the one being reported on, DMARC treats it as cross-domain reporting and the receiving domain has to authorize it. Without this record, conformant reporters silently send nothing:

```
yourdomain.com._report._dmarc.reportdomain.com   TXT   v=DMARC1
```

Miss it and you have a domain that looks fully configured and collects no reports. It is invisible in most checkers.

To generate any of these for your own stack, the [DNS Record Generator](/records) outputs SPF, DKIM, DMARC, MTA-STS, and BIMI records with the syntax already correct, and counts SPF lookups in real time against the 10-lookup cap. Free, no account.

## What a clean domain does not tell you

This is the part that catches people out, and it is worth being direct about.

A domain health check verifies your infrastructure. It says the envelope is addressed correctly and the sender is who they claim to be. It says nothing about whether the message inside will land in the inbox.

Three things stay invisible to any domain-level audit:

**The content of the message.** Gmail's Primary-versus-Promotions classifier reads the subject line, the HTML-to-text ratio, the image density, the link count, and the header stack. A perfectly authenticated message with a 60KB HTML template, four tracked links, and a subject line carrying a percent sign lands in Promotions with every DNS record green. Full breakdown of the signals: [Why your emails hit Gmail Promotions and how to move them to Primary](/blog/gmail-promotions-tab-fix).

**The quality of the list.** Bounce rate above 2% damages reputation regardless of how clean your DNS is. A list that was accurate eighteen months ago is not accurate now. Addresses churn at roughly 2% a month.

**Per-recipient engagement history.** The single strongest signal in inbox placement, and entirely outside your DNS. A recipient who has never opened you gets sorted on volume alone.

So the sequence that actually works is: fix the domain, then fix the message, then fix the list. Skipping the first makes the other two pointless. Stopping at the first is the most common mistake, because a green report feels like completion.

Once your domain reports clean, run the specific message you are about to send through the [Email Scorer](/score). It grades content, structure, and authentication signals together and returns the two or three factors dragging placement, rather than a generic score. New accounts get 10 free credits, one score costs one credit, and no card is required to sign up. Ten free runs is enough to test a subject line variant, compare a plain-text version against your HTML, and confirm the fix before the campaign goes out.

## How often to run the check

Monthly for any domain you send from. Quarterly for domains you do not.

More importantly, run it after any of these:

- Adding a new sending service, which almost always changes SPF and often pushes the lookup count over the cap
- Removing a sending service, which usually leaves a dead `include:` behind
- Migrating DNS providers, where records get transcribed by hand and one selector loses a character
- Any unexplained drop in open rates or spike in bounces
- Any DKIM key rotation, since some providers rotate and expect you to republish

Silent DKIM failure from a stale key is one of the most common causes of slow reputation decay. Nobody notices until DMARC reports show a rising failure rate, and by then the damage has been accumulating for weeks.

## Where to start

Three steps, in order:

1. **Run the [Domain Checker](/domain) against your domain.** Ten seconds, no account. Write down anything marked critical.
2. **Fix the critical items first.** If SPF, MX, or a blacklist listing is flagged, nothing else matters until those are clear. If you need the records generated, the [DNS Record Generator](/records) outputs them correctly for your specific stack.
3. **Score the next message you plan to send** with the [Email Scorer](/score). A clean domain is the floor, not the finish. The message still has to survive the classifier.

If your authentication setup is missing entirely rather than misconfigured, start with the setup guide instead: [How to set up SPF, DKIM, and DMARC](/blog/spf-dkim-dmarc-setup). For the full picture of what sits on top of authentication, [the complete guide to email deliverability in 2026](/blog/email-deliverability-guide-2026) covers reputation, inbox placement, and the 2026 protocol layer.
