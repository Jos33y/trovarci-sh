---
title: "Gmail sending limits: how many emails a day"
nav: "Gmail sending limits"
description: "How many emails Gmail and Google Workspace let you send a day, what counts toward the limit, and what happens when you go over it."
short: "A personal Gmail account can send to 500 people a day, and one email can have at most 500 recipients. Google Workspace allows 2,000 a day per user, or 500 on a free trial. Go over, and Gmail stops you sending for up to 24 hours."
published: "2026-11-07"
checked: "2026-11-07"
topic: smtp
order: 5
action: sender
asks:
  - how many emails can i send per day with gmail
  - gmail daily limit
  - google workspace sending limit
  - gmail bulk email limit
  - gmail limit per hour
  - how many recipients can i send to in gmail
sources:
  - "Google: Gmail sending limits | https://support.google.com/mail/answer/22839"
  - "Google: Gmail sending limits in Google Workspace | https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace"
related:
  - daily-sending-limit-exceeded
  - gmail-smtp-settings
  - gmail-app-password
post: send-bulk-email-from-gmail
slow: "Keeping several accounts under their limits by hand. Trovarcis Sender sends one campaign through all your accounts, keeps each inside the daily and hourly limits you set, and pauses itself before Gmail blocks you. {{sender_price}} once."
---

## The limits

| Account | Per day |
|---|---|
| Personal Gmail | 500 |
| Google Workspace, paid | 2,000 |
| Google Workspace, free trial | 500 |

On a personal account, one email can go to at most 500 recipients.

## What counts

Count people, not emails. One email to 500 people uses the whole day on a personal account. Replies and your everyday messages count too, so plan a campaign well below the limit.

## When you go over

Gmail refuses further email, often with **550 5.4.5 Daily user sending quota exceeded**. Sending usually comes back within 1 to 24 hours. Sending to many addresses that don't exist can also block an account for 24 hours.

What to do now: [Daily sending limit exceeded](/guides/daily-sending-limit-exceeded).

## To send more

Spread the list over several days, move to Google Workspace, or send from several accounts at once, each inside its own limit.
