---
title: "How to add a DMARC record"
nav: "Add a DMARC record"
description: "Add a DMARC record to any domain in three steps: the exact name and value, where reports go, and when to move from p=none to quarantine."
short: "In your DNS settings, add a TXT record named _dmarc with the value v=DMARC1; p=none; rua=mailto:you@yourdomain.com. Keep p=none for two to four weeks while reports arrive, then change it to p=quarantine, and later to p=reject."
published: "2026-11-07"
checked: "2026-11-07"
topic: dns
order: 2
action: records
asks:
  - dmarc record example
  - how to create a dmarc record
  - add dmarc to dns
  - what should my dmarc record be
  - dmarc p=none quarantine reject
  - no dmarc record found
needs:
  - Access to your domain's DNS settings
  - SPF and DKIM already set up
sources:
  - "Google: Set up DMARC | https://knowledge.workspace.google.com/admin/security/set-up-dmarc"
  - "Google: Email sender guidelines | https://support.google.com/a/answer/81126"
related:
  - google-workspace-spf-dkim-dmarc
  - find-why-emails-go-to-spam
post: spf-dkim-dmarc-setup
slow: "Writing the record without a typo, and knowing it's live. The free DNS Generator writes it for your provider, and the free Domain Checker reads it back."
---

## 1. Pick where reports go

Mail providers send a report of who sent email as your domain, usually once a day. Use a mailbox you can check, such as `dmarc@yourdomain.com`, and create it before you add the record.

## 2. Add the record

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` |

Some DNS panels want the full name, `_dmarc.yourdomain.com`. Most add your domain for you.

## 3. Check it

Run your domain through the [Domain Checker](/domain). It shows the record and what it means. New records can take a few hours to appear.

## 4. Tighten it later

`p=none` only watches: fake email using your domain still gets through. When the reports show your own email passing for two to four weeks, change `p=none` to `p=quarantine`, so failures go to spam. Later, `p=reject` refuses them.

## Already have a DMARC record?

A domain has one. Edit the one you have instead of adding a second.
