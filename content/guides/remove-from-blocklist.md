---
title: "How to get your domain or server off a blocklist"
nav: "Get off a blocklist"
description: "Find which blocklist you're on, fix the cause, and request removal from Spamhaus, SpamCop, Barracuda and the rest, free."
short: "Check which list you're on with the free Domain Checker, fix what caused it, then use that list's own removal page. Spamhaus removal is free at check.spamhaus.org. SpamCop listings expire on their own 24 hours after the last report. Barracuda has a removal form, usually handled within 12 hours."
published: "2026-11-07"
checked: "2026-11-07"
topic: dns
order: 3
action: domain
asks:
  - how to get off a blacklist
  - remove ip from spamhaus
  - delist domain from blacklist
  - spamcop removal
  - barracuda blacklist removal
  - my domain is blacklisted what do i do
sources:
  - "Spamhaus: Check and remove a listing | https://check.spamhaus.org"
  - "SpamCop: How do I get my IP off the list | https://www.spamcop.net/fom-serve/cache/298.html"
  - "Barracuda: Removal request | https://www.barracudacentral.org/rbl/removal-request"
related:
  - find-why-emails-go-to-spam
  - email-bounce-meaning
  - verify-email-list-before-sending
post: domain-blacklisted-check-fix
slow: "Knowing you're listed before your emails start bouncing. The free Domain Checker checks your domain and mail server against 6 blocklists in about ten seconds. Run it after every fix, and before big sends."
---

## 1. Find which list you're on

Run your domain through the [Domain Checker](/domain). It checks Spamhaus, SpamCop, Barracuda, PSBL and SURBL, and says whether it's your domain or your mail server that is listed.

## 2. Find the cause

The usual ones:

- A hacked email account or website sending spam
- An old or bought list full of dead addresses and spam traps
- A sudden jump from a few emails to thousands
- A shared server where someone else is sending spam

## 3. Fix it first

Change passwords, clean your website, remove old addresses, and slow down. Ask for removal before the cause is fixed and you'll be listed again.

## 4. Ask for removal

| List | What to do |
|---|---|
| Spamhaus (ZEN, DBL) | Look up your IP or domain at check.spamhaus.org and follow the steps. Free. |
| SpamCop | Nothing. It lifts the listing 24 hours after the last spam report. It doesn't remove early because you fixed it. |
| Barracuda | Fill in its removal request form. Requests are usually handled within 12 hours. |
| PSBL, SURBL | Use the removal link on the list's own site. |

## Asked to pay for removal?

Some smaller lists charge for quick removal. Spamhaus, SpamCop and Barracuda don't.
