---
title: "SMTP error codes: what each one means and what to do"
nav: "SMTP error codes"
description: "Every common SMTP error and bounce code in plain words: 421, 450, 451, 452, 535, 550, 552, 553, 554 and the 5.x.x codes, with what to do about each."
short: "The first digit says what to do. 2 means it worked. 4 means a temporary failure: wait, and your software tries again. 5 means a permanent failure: sending again won't help, so fix the cause or remove the address. The numbers after it, like 5.1.1, give the exact reason."
published: "2026-11-07"
checked: "2026-11-07"
topic: smtp
order: 4
action: smtp
asks:
  - smtp error codes list
  - what does 550 mean email
  - 550 5.1.1 user unknown
  - 554 5.7.1 rejected
  - 421 try again later
  - 451 temporary local problem
  - 452 insufficient system storage
  - 553 sender address rejected
  - 552 mailbox full
  - email bounce error codes
  - smtp reply codes meaning
  - 5.7.1 access denied
  - 4.7.0 temporarily deferred
needs:
  - The full error message from the bounce or your sending software
sources:
  - "RFC 5321: SMTP reply codes | https://www.rfc-editor.org/rfc/rfc5321#section-4.2"
  - "RFC 3463: Enhanced mail status codes | https://www.rfc-editor.org/rfc/rfc3463"
  - "IANA: SMTP enhanced status codes registry | https://www.iana.org/assignments/smtp-enhanced-status-codes/smtp-enhanced-status-codes.xhtml"
related:
  - email-bounce-meaning
  - microsoft-365-smtp-auth
  - remove-from-blocklist
post: send-bulk-email-without-blacklist
slow: "Sorting hundreds of bounces by hand. Trovarcis Sender records every failed email with the server's own reason, sorts permanent failures from temporary ones, and keeps permanently failed addresses off your next send."
---

## Paste it instead

Paste the whole error into the [help desk](/guides) and it is explained on the spot, with the guide that fixes it. The tables below are the same answers, to read through.

## 1. Read the first digit

| Starts with | Means | What to do |
|---|---|---|
| 2 | Worked | Nothing |
| 4 | Failed for now | Wait. Most sending software tries again by itself |
| 5 | Failed for good | Fix the cause or remove the address. Sending again fails the same way |

## 2. The three-digit code

| Code | What it means | What to do |
|---|---|---|
| 421 | The server is busy or limiting you, and closed the connection | Send slower and try later |
| 450 | The mailbox is busy or unavailable for now | Wait; it's retried |
| 451 | The receiving server had a problem on its side | Wait; it's retried |
| 452 | Too many recipients at once, or the server is out of space | Send to fewer people per email |
| 535 | Sign-in failed | Check the username and password; use an app password for Gmail |
| 550 | Refused: the mailbox doesn't exist, or you're blocked | Read the rest of the message; remove the address if it doesn't exist |
| 552 | The mailbox is full or the email is too large | Send a smaller email, or try later |
| 553 | The address isn't allowed, often a From address your account doesn't own | Send from the address you signed in with |
| 554 | Refused, often because of a blocklist or the content | Read the rest of the message for the reason |

## 3. The detailed code (like 5.1.1)

| Code | What it means | What to do |
|---|---|---|
| x.1.1 | The address doesn't exist | Remove it |
| x.1.2 | The domain doesn't exist or has no mail server | Check for a typo, then remove it |
| x.2.2 | The mailbox is full | Try later; remove it if it keeps failing |
| x.4.7 | Delivery took too long and was given up | Try again later |
| x.7.1 | Refused by the receiver's policy: blocked, or not allowed | Check blocklists and your domain setup |
| x.7.8 | Wrong username or password | Fix the login details |
| x.7.26 | Your email failed the domain checks (SPF or DKIM) | Fix your domain setup |
| 5.7.139 | Microsoft 365 has SMTP sign-in turned off | [The fix](/guides/microsoft-365-smtp-auth) |
| 4.7.0 | Delayed for now, often for sending too fast | Slow down; it's retried |

## 4. Words that matter more than the code

If the message names a blocklist, such as Spamhaus, SpamCop or Barracuda, the code matters less than the list: [get off the blocklist](/guides/remove-from-blocklist). If it says "quota" or "limit exceeded", the account hit its sending limit: [what to do](/guides/daily-sending-limit-exceeded).
