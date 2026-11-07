---
title: "What an email bounce means: hard and soft bounces"
description: "What a bounced email means, how to tell a hard bounce from a soft one by its code, and what to do with each address."
short: "A bounce is a reply saying your email wasn't delivered. Codes starting with 5 are hard bounces: the address doesn't exist or the server refused it for good, so remove it. Codes starting with 4 are soft bounces, such as a full mailbox or a busy server, so it may work later."
published: "2026-11-07"
checked: "2026-11-07"
topic: lists
action: verify
asks:
  - hard bounce vs soft bounce
  - what does bounced email mean
  - 550 5.1.1 user unknown
  - mailbox full bounce
  - why did my email bounce
  - email hard bounce
sources:
  - "RFC 3463: Enhanced Mail System Status Codes | https://www.rfc-editor.org/rfc/rfc3463"
  - "Google: Gmail sending limits | https://support.google.com/mail/answer/22839"
related:
  - verify-email-list-before-sending
  - find-why-emails-go-to-spam
  - remove-from-blocklist
post: clean-email-list-before-sending
slow: "Finding the dead addresses before they bounce. The Email Verifier checks each address with its mail server without sending anything, for 1 credit (1 cent) each."
---

## Read the code

The reply has a three-digit code and a longer one after it. The first digit tells you which kind it is.

| Code | Means | What to do |
|---|---|---|
| 550 5.1.1 | No such mailbox | Remove the address |
| 552 5.2.2 | Mailbox full | Try again later. Remove it if it keeps happening |
| 421 4.7.0 | Try again later | Slow down. Most sending software retries by itself |
| 550 5.7.1 | Refused by the server's rules | Check your domain setup and the email itself |

## 1. Remove hard bounces before the next send

Sending to an address that bounced hard tells providers you don't know who you're emailing. Take it off the list now.

## 2. Watch soft bounces

One soft bounce is normal. The same address soft-bouncing send after send is effectively dead: remove it.

## 3. Stop if many bounce at once

A lot of bounces in one send means the list has gone stale. Stop and check the list before going on. Gmail can block an account from sending for 24 hours after many bounces.

Refused by policy rather than by address? [Find why your emails go to spam](/guides/find-why-emails-go-to-spam).
