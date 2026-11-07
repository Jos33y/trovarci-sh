---
title: "Find why your emails go to spam: 4 checks in order"
description: "Four checks, in the order that finds the cause fastest: your domain, the email's headers, your list, then the message. With the fix for each."
short: "First check your domain's setup and blocklists with the free Domain Checker. Then open one of your emails in Gmail, choose Show original, and look for SPF, DKIM and DMARC: PASS. Then check your list for dead addresses, and last, score the email itself. Fix the first check that fails."
published: "2026-11-07"
checked: "2026-11-07"
topic: deliverability
action: domain
asks:
  - why are my emails going to spam
  - emails landing in junk
  - how to stop emails going to spam
  - gmail marking my emails as spam
  - outlook sends my email to junk
  - email deliverability check
sources:
  - "Google: Email sender guidelines | https://support.google.com/a/answer/81126"
  - "Google: Postmaster Tools | https://postmaster.google.com"
related:
  - google-workspace-spf-dkim-dmarc
  - remove-from-blocklist
  - verify-email-list-before-sending
post: why-emails-go-to-spam
slow: "Running the checks one by one. The free Domain Checker covers the setup and the blocklists in about ten seconds, and tells you what to fix first."
---

## 1. Check your domain

Run your domain through the [Domain Checker](/domain). A blocklist listing or a missing SPF, DKIM or DMARC record is the most common cause, and the result says how to fix each.

## 2. Read one email's headers

Send yourself an email at a Gmail address, open it, and choose **Show original**. Look for:

- **SPF: PASS**
- **DKIM: PASS**
- **DMARC: PASS**

A FAIL here is your answer. Google Workspace? [Set up SPF, DKIM and DMARC](/guides/google-workspace-spf-dkim-dmarc).

## 3. Check your list

Lots of bounces, or a list that hasn't been emailed in months, makes providers trust everything you send less. [Verify the list](/guides/verify-email-list-before-sending) before the next send.

## 4. Check the message

Heavy images, many links, a subject that reads like an ad, or no unsubscribe link push an email toward spam. Score it with the [Email Scorer](/score).

## Still going to spam?

Ask a few readers to move your email to their inbox, and check your spam rate in Google Postmaster Tools. Google asks bulk senders to keep reported spam below 0.1%.
