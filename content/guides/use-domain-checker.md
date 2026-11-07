---
title: "How to check your domain's email setup"
nav: "Domain Checker"
description: "Check SPF, DKIM, DMARC, mail servers and blocklists for any domain in one go with the free Domain Checker, and read what each result means."
short: "Type your domain into the Domain Checker and press Check Domain. You get one verdict, Healthy, Issues Found or Action Needed, and five sections. Open any section that isn't Healthy: each problem has a plain fix underneath. Start with Proof it's really you and Blocklists."
published: "2026-11-07"
checked: "2026-11-07"
topic: tools
order: 1
action: domain
asks:
  - how to use the domain checker
  - check my domain email setup
  - check spf dkim dmarc
  - domain health check free
  - is my domain set up for email
  - what does action needed mean domain checker
needs:
  - Your domain, like example.com (not an email address)
related:
  - use-dns-record-generator
  - find-why-emails-go-to-spam
  - remove-from-blocklist
post: email-domain-health-check
---

## 1. Run the check

Open the [Domain Checker](/domain), type the domain you send email from, such as **example.com**, and press **Check Domain**. No signup. If you send from an address like you@mail.example.com, check **mail.example.com**.

## 2. Read the verdict

| Verdict | What it means |
|---|---|
| Healthy | Nothing found that would hurt your email |
| Issues Found | Things worth fixing, but nothing stopping your email today |
| Action Needed | At least one problem that can send your email to spam or get it refused |

## 3. Open the sections in this order

| Section | What it checks | Why it matters |
|---|---|---|
| Proof it's really you | SPF, DKIM, DMARC and BIMI | Gmail and Yahoo require these from bulk senders |
| Blocklists | Whether your mail server or domain is on a spam list | A listing gets email refused outright |
| Mail server | That your domain has working mail servers | Without them, replies and bounces go nowhere |
| Website | Your site's certificate and secure redirect | Matters for trust and for links in your email |
| DNS setup | Your domain's DNS itself | Rarely the cause of spam problems |

Each check that fails shows what's wrong and how to fix it. Fix the red ones first.

## 4. If DKIM shows as missing

The checker looks for DKIM under the names email providers commonly use. If yours uses an unusual name, it can show as missing when it works. To be sure, open one of your emails in Gmail, choose **Show original**, and look for **DKIM: PASS**.

## 5. Fix, then check again

Need the records to add? The [DNS Generator](/records) writes them for your provider. DNS changes usually show within an hour, sometimes up to 48. Run the check again to confirm.
