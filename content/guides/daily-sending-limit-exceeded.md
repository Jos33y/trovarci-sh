---
title: "Daily sending limit exceeded: what it means and what to do"
description: "What 'daily sending limit exceeded' means on Gmail, Google Workspace and Amazon SES, how long it lasts, and how to finish your campaign."
short: "Your email account has sent as much as it may in a day, so the provider refuses more until the limit resets, usually within 24 hours. Stop sending from that account, wait, and spread the rest of the campaign over more days or more accounts."
published: "2026-11-07"
checked: "2026-11-07"
topic: sending
action: sender
asks:
  - 550 5.4.5 daily user sending quota exceeded
  - email rate limit exceeded
  - you have reached a limit for sending mail
  - daily message quota exceeded
  - maximum sending rate exceeded
  - gmail stopped sending emails
sources:
  - "Google: Gmail sending limits | https://support.google.com/mail/answer/22839"
  - "Amazon: Errors related to SES sending quotas | https://docs.aws.amazon.com/ses/latest/dg/manage-sending-quotas-errors.html"
related:
  - gmail-sending-limits
  - gmail-smtp-settings
post: send-bulk-email-from-gmail
slow: "Counting how much each account has sent, and stopping in time. Trovarcis Sender keeps every account inside the daily and hourly limits you set, takes turns between accounts, and carries on the next day by itself. {{sender_price}} once."
---

## Where you'll see it

| Provider | Message | When it clears |
|---|---|---|
| Gmail, Google Workspace | `550 5.4.5 Daily user sending quota exceeded` | Usually within 1 to 24 hours |
| Amazon SES | `454 Throttling failure: Daily message quota exceeded` | When the 24-hour quota resets |
| Amazon SES | `454 Throttling failure: Maximum sending rate exceeded` | Seconds. You sent too fast, not too much |

## 1. Stop sending from that account

Retrying straight away won't work. Pause the campaign, or move the rest to another account.

## 2. Wait for the reset

Gmail usually lets you send again within 24 hours. Amazon SES asks you to wait and retry.

## 3. Set a daily cap below the limit

Next time, keep each account under its limit, with room for your everyday email. Gmail's limits: [Gmail sending limits](/guides/gmail-sending-limits).

## 4. Spread the rest

Send the remainder over the next days, or across several accounts, each inside its own limit.
