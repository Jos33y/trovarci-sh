---
title: "How to email all your church members at once, without a monthly fee"
slug: "email-all-church-members"
description: "Send the weekly bulletin or an event notice to every member, each in their own email, without Gmail's BCC limits, exposed addresses or a monthly bill. A simple routine any volunteer can keep."
date: "2026-11-07"
author: "trovarcis-team"
category: "Email Marketing"
tags: ["church", "church-email", "bulk-email", "newsletter", "gmail"]
audience: "Churches"
priority: 1
readingTime: 5
---

**In short:** don't send to the whole congregation from Gmail in one BCC email. Gmail stops at 500 people a day, one slip into CC shows everyone's address, and big BCC emails land in spam. Keep the members in one spreadsheet, and send each person their own email ("Dear Grace") from the church's address with a small app that respects Gmail's limits. Set it up once and the weekly bulletin takes five minutes, for whichever volunteer is on duty.

<nav class="picker" aria-labelledby="picker-title">
<p class="picker-title" id="picker-title">What do you need?</p>
<ul>
<li><a href="#bcc"><strong>Why does BCC from Gmail keep failing?</strong><span>The limits and the risks, in plain words.</span></a></li>
<li><a href="#list"><strong>How should we keep the member list?</strong><span>One spreadsheet, and sending to one group.</span></a></li>
<li><a href="#account"><strong>Which address should it come from?</strong><span>Gmail, the church domain, and the daily limits.</span></a></li>
<li><a href="#weekly"><strong>How do we make it a weekly routine?</strong><span>Five minutes, any volunteer.</span></a></li>
</ul>
</nav>

## Why BCC from Gmail keeps failing {#bcc}

- **The limit.** A personal Gmail account can email 500 people a day, and one email can have at most 500 recipients. Google Workspace allows 2,000 a day. Go over, and Gmail stops you sending anything for up to 24 hours, including replies to members.
- **Exposed addresses.** One email with the whole congregation in CC instead of BCC shares every member's address with everyone, and replies-to-all follow.
- **Spam folders.** One email to hundreds of hidden recipients looks like a mass mailing to Gmail and Outlook, and often lands in spam or Promotions. An email addressed to one person reads like an email.
- **No idea who got it.** Bounced addresses come back as a pile of error emails, and nobody updates the list.

## Keep the members in one spreadsheet {#list}

One sheet, one row per person:

| first_name | email | group |
|---|---|---|
| Grace | grace@example.com | choir |
| Daniel | daniel@example.com | youth |
| Maria | maria@example.com | |

- **One address per row.** If a couple shares an address, one row is enough.
- **A group column** lets you send the choir rehearsal change to the choir only: filter the sheet and save that as its own list.
- **Save it as CSV** (File, Download, CSV in Google Sheets; Save As, CSV in Excel) when it's time to send.

Members who ask to stop getting emails go on a "do not email" list, not deleted from the sheet, so nobody adds them back by accident next month.

## Which address to send from {#account}

| Sending from | Daily limit | Notes |
|---|---|---|
| A Gmail address, like stmarks.office@gmail.com | 500 people | Fine for most congregations |
| The church's own domain on Google Workspace, like office@stmarks.org | 2,000 people per mailbox | Looks more trustworthy, and stays with the church when volunteers change |

Use one shared office address, not a volunteer's personal one, so the emails and replies stay with the church when people change roles.

Sending from the church's own domain? Check it's set up so inboxes trust it with the free [Domain Checker](/domain).

## Make it a weekly routine {#weekly}

1. **Open last week's bulletin**, change the dates and announcements.
2. **Pick the list**: everyone, or one group.
3. **Send a test to yourself** and read it on your phone.
4. **Send**, or schedule it for Saturday evening.

If the routine lives in one app on the church office computer, the next volunteer learns it in one sitting.

## Doing it with Trovarcis Sender

Trovarcis Sender is a Windows app the church pays for once. It sends the bulletin from the church's own Gmail or Workspace address, one email per member.

- **Every member gets their own email**, starting "Dear Grace". Nobody sees anyone else's address, and a missing first name never prints as "Dear ,": Sender uses a fallback like "Dear friend".
- **It stays inside the daily limit you set**, 500 for Gmail. A list bigger than one day's limit carries on the next day.
- **Last week's bulletin is saved.** Duplicate it, change what's new, send.
- **Schedule it** for Saturday evening, or limit sending to set hours.
- **Do not send** keeps everyone who asked to stop from getting the next email.
- **The report shows who it went to**, and the mail server's reason for any address it couldn't reach, so the list stays clean.
- **One payment covers 3 computers**: the office computer, the pastor's laptop and a spare.

Your member list stays on the church's computer. Trovarcis never sees it.

<div class="product-card">
<img src="/images/sender/sender-report-800.webp" width="800" height="589" alt="Trovarcis Sender sending a campaign across three SMTP accounts, each within its daily limit." loading="lazy">
<div class="product-card-body">
<p class="product-card-price">{{sender_price}} <span>one payment, 3 computers, every 1.x update</span></p>
<a class="product-card-cta" href="/sender">Get Sender</a>
</div>
</div>

## Need a hand getting set up?

Not sure which address to send from, or stuck setting it up? [Write to us](/contact) and we'll walk you through it.
