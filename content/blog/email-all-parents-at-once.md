---
title: "How to email all parents at once, without BCC limits or duplicates"
slug: "email-all-parents-at-once"
description: "Send a letter to every parent, or one class, each in their own email with their child's name. Why BCC fails, how to stop parents getting it twice, and attachments."
date: "2026-11-07"
author: "trovarcis-team"
category: "Email Marketing"
tags: ["school", "parents", "school-email", "bulk-email", "gmail"]
audience: "Schools"
priority: 2
readingTime: 5
---

**In short:** stop sending one BCC email to every parent. Gmail caps it at 500 recipients, one slip into CC shares every family's address, and parents with two children get it twice. Keep one row per parent in a spreadsheet with their children's names and class, and send each parent their own email: "Dear parent of Sofia, Year 4 trip details are attached." A sending app does the splitting, the names and the daily limits for you.

<nav class="picker" aria-labelledby="picker-title">
<p class="picker-title" id="picker-title">What do you need?</p>
<ul>
<li><a href="#bcc"><strong>Why is BCC failing us?</strong><span>The limits, and why some parents never see it.</span></a></li>
<li><a href="#twice"><strong>Parents get our emails twice</strong><span>The cause, and the spreadsheet that fixes it.</span></a></li>
<li><a href="#class"><strong>How do I email one class only?</strong><span>One list, filtered.</span></a></li>
<li><a href="#send"><strong>How do I send it with each child's name?</strong><span>Step by step, attachments included.</span></a></li>
</ul>
</nav>

## Why BCC is failing you {#bcc}

- **The cap.** One email can go to at most 500 people, and a personal Gmail account to 500 people a day. A school Google Workspace account allows 2,000 a day. A whole-school letter means splitting the list by hand and sending it again and again.
- **Exposed addresses.** Put the list in CC by mistake once, and every family has every other family's address. Then come the replies-to-all.
- **Spam folders.** One email to hundreds of hidden recipients looks like a mass mailing, and some parents never see it. An email addressed to one parent reads like a letter from school.
- **No names.** "Dear parents" for a letter about one child's class trip reads like a circular, and gets read like one.

## Why parents get it twice, and the fix {#twice}

A family with two children appears twice on most class lists, once per child. Send to the lists one after another and that parent gets the letter twice, or three times.

The fix is a parent list, not a pupil list. One row per parent address, with all their children in it:

| parent_email | children | classes |
|---|---|---|
| m.garcia@example.com | Sofia and Leo | Year 4, Year 1 |
| j.walker@example.com | Amara | Year 4 |
| d.walker@example.com | Amara | Year 4 |

- **Two parents with separate addresses** get a row each, so both receive it.
- **Two children, one address** is one row, so the letter goes once.
- Most school systems export pupils with parent emails. Paste that into a sheet, sort by email, and merge the rows that share an address.

No time to merge? Send the pupil list as it is. A sending app that removes repeated addresses still sends each family one email; it just names the first child it finds, so write "Dear parent of {{child}} and family" or keep it to "Dear parent" for those letters.

## Emailing one class only {#class}

Keep the one parent list and filter it. In Google Sheets or Excel, filter the classes column for "Year 4" and save the result as its own CSV. Filtering by "contains" keeps the Garcia family, whose children are in two years, in both lists.

## Sending it with each child's name {#send}

With the parent list saved as CSV, a sending app writes each email for you:

> Dear parent of {{children}},
>
> The Year 4 trip to the science museum is on Friday 20 November. The permission form is attached.

1. **Import the CSV.** Duplicate addresses are removed and broken ones set aside, so nobody gets it twice.
2. **Write the letter once** with the names as fields, and attach the form.
3. **Send a test to yourself** and check it on your phone.
4. **Send, or schedule it** for the evening before.

Replies come back to the school address you sent from, one parent at a time, not as a reply-to-all.

For a closure or an emergency that parents must see within the hour, use your text message or school app alerts. Email is for letters, newsletters and reports.

## Doing it with Trovarcis Sender

Trovarcis Sender is a Windows app the school pays for once, and sends from the school's own Gmail or Workspace address.

- **Every parent gets their own email**, with their child's name. A missing name never prints as "Dear parent of ,": a fallback like "your child" fills the gap.
- **Duplicates are removed when you import**, so the family on two lists gets one email.
- **Attach the form**: permission slips, term dates, reports. Sender checks the size against your email provider's limit before sending.
- **It stays inside the daily limit you set**: 2,000 for a Workspace account. A bigger list carries on the next day.
- **Last term's letters are saved.** Duplicate one, change the dates, send.
- **The report shows who it went to**, and the mail server's reason for any address it couldn't reach, so the office can update those families' details.

The parent list stays on the school's computer. Trovarcis never sees it.

<div class="product-card">
<img src="/images/sender/sender-report-800.webp" width="800" height="589" alt="Trovarcis Sender sending a campaign across three SMTP accounts, each within its daily limit." loading="lazy">
<div class="product-card-body">
<p class="product-card-price">{{sender_price}} <span>one payment, 3 computers, every 1.x update</span></p>
<a class="product-card-cta" href="/sender">Get Sender</a>
</div>
</div>

## Need a hand getting set up?

Not sure how to turn your school system's export into a parent list, or which address to send from? [Write to us](/contact) and we'll walk you through it.
