---
title: "How to send each person a personalized email with an attachment"
nav: "Personalized email with attachment"
description: "Send many people their own email with their name and details, plus a file such as a job description or permission form, from your own Gmail or Workspace."
short: "Put each person's details in a spreadsheet, one column per detail (first name, role, date). Write the email once with those details as fields, attach the file, and send one email per person from your own address. Keep the file under about 10 MB, and leave attachments off a first email to strangers: they get filtered more often."
published: "2026-11-07"
checked: "2026-11-07"
topic: sending
order: 4
action: sender
asks:
  - send personalized email with attachment to multiple recipients
  - mail merge with attachment gmail
  - send job description to candidates bulk
  - send permission form to all parents
  - personalized bulk email with pdf
needs:
  - A spreadsheet with one row per person
  - The file to attach
related:
  - email-more-than-500
  - email-without-showing-addresses
  - gmail-sending-limits
post: email-candidates-in-bulk
slow: "Merging every row by hand. Trovarcis Sender fills each email from your spreadsheet, attaches the file, checks its size against your provider's limit, and holds back anyone whose row is missing a detail you didn't give a fallback for."
---

## 1. One column per detail

| first_name | email | role | interview |
|---|---|---|---|
| Priya | priya@example.com | Senior accountant | Tuesday 10:00 |
| Tomás | tomas@example.com | Payroll lead | Tuesday 14:30 |

## 2. Write it once, with fields

> Hi {{first_name}}, thanks for applying for the {{role}} role. Your interview is on {{interview}}. The job description is attached.

Give a field a fallback for blank cells, like `{{first_name | there}}`, or check the column is complete.

## 3. Attach the file

| Keep in mind | Why |
|---|---|
| Under about 10 MB | The email grows by about a third when it's sent. Gmail allows 25 MB in total |
| PDF, not Word | Opens the same on every phone |
| None on a first email to a stranger | Attachments from unknown senders are filtered more often; link to it instead |

## 4. Test, then send

Send one to yourself and open it on your phone: check the name, the details and that the file opens. Then send one email per person from your own address.
