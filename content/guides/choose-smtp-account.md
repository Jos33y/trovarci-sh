---
title: "Which SMTP account should I send bulk email through?"
nav: "Choose an SMTP account"
description: "The right sending account depends on who you email. Which to use for subscribers and customers, which for cold outreach, and the traps to avoid."
short: "Start with who you're emailing. People who signed up (subscribers, members, customers) suit a sending service like Amazon SES, Brevo or turboSMTP, from your own domain. People who never signed up (cold outreach) are banned on those services: use real Google Workspace mailboxes on a separate domain, at 30 to 50 emails a day each."
published: "2026-11-07"
checked: "2026-11-07"
topic: smtp
order: 7
action: sender
interest: smtp-desk
asks:
  - best smtp for bulk email
  - which smtp server should i use
  - smtp provider for newsletter
  - smtp for cold email
  - where to get smtp account
  - cheap smtp server for bulk email
  - can i use sendgrid for cold email
needs:
  - Your own domain, like yourcompany.com
related:
  - amazon-ses-newsletter
  - cold-outreach-setup
  - gmail-smtp-settings
slow: "Using the account well once you have it. Trovarcis Sender works with any SMTP account, keeps each one inside the daily limit you set, and spreads a send across several accounts."
---

## 1. Who are you emailing?

| They... | Use | Why |
|---|---|---|
| Signed up: subscribers, members, parents, customers | A sending service | Built for this, cheap at volume |
| Never signed up: prospects, passive candidates | Google Workspace mailboxes | Sending services ban cold email |
| A few hundred people you know | Your own Gmail or Workspace | Already have it |

## 2. People who signed up: a sending service

| Service | Price | Good for |
|---|---|---|
| Amazon SES | $0.10 per 1,000 emails | The cheapest at any size; needs a one-time approval ([setup](/guides/amazon-ses-newsletter)) |
| Brevo | Free for 300 a day; paid plans by emails sent | A quick start with a small list |
| turboSMTP | From about €15 a month for 15,000 emails | Human support, servers in Europe |

All of them expect you to send from your own domain, set up with SPF and DKIM. The [DNS Generator](/records) writes those records.

## 3. People who never signed up: mailboxes, not services

Sending services find cold email from spam reports, bounces and spam traps, and suspend the account, often without a refund. Outreach teams use real mailboxes instead: [cold outreach that keeps mailboxes alive](/guides/cold-outreach-setup).

## The traps

- **A @gmail.com address as From through a sending service.** Gmail tells other servers that only Gmail sends as Gmail, so the email is junked or refused even though the service says "sent".
- **No verified domain.** Some services still send, under their own name, and fewer emails arrive.
- **Microsoft 365 with a password.** Microsoft turns off password sign-in for SMTP by default from the end of December 2026. Google Workspace is the simpler choice for now.
