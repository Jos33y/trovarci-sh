---
title: "How to export your list from Mailchimp, unsubscribes included"
nav: "Export a Mailchimp list"
description: "Download every contact from a Mailchimp audience as CSV, what each file in the export is for, and which ones to import where so nobody who left gets emailed."
short: "In Mailchimp, open Audience, choose the audience, click Export audience, then Export CSV. Mailchimp emails you when the ZIP is ready. Inside are separate files: subscribed (your mailing list), unsubscribed and cleaned (people never to email again), and non-subscribed. Only Owners and Admins can export."
published: "2026-11-07"
checked: "2026-11-07"
topic: lists
order: 3
action: sender
asks:
  - how to export contacts from mailchimp
  - export mailchimp audience csv
  - leave mailchimp keep my list
  - download mailchimp subscribers
  - move list from mailchimp
needs:
  - Owner or Admin access to the Mailchimp account
related:
  - verify-email-list-before-sending
  - amazon-ses-newsletter
  - choose-smtp-account
post: send-newsletter-without-mailchimp
slow: "Keeping the people who left from ever getting an email again. Trovarcis Sender's Do not send list takes the unsubscribed and cleaned files once and skips those addresses on every send after, whatever list you import."
---

## 1. Start the export

In Mailchimp, click **Audience**. If you have more than one, pick it from the **Audience** drop-down. Click **Export audience**, then **Export CSV** in the pop-up. Mailchimp emails you when it's ready; it can take a few minutes for a big list.

To find it later: **Audience**, the **More options** drop-down, **Export history**. Exports stay for 30 days.

## 2. Unzip it and know what each file is

| File | Who's in it | What to do with it |
|---|---|---|
| subscribed | Your mailing list | Import it as your list |
| unsubscribed | People who left | Keep. Never email them again |
| cleaned | Addresses that bounced for good | Keep with the unsubscribed |
| non-subscribed | Contacts who never opted in, such as buyers | Don't add to your newsletter |

## 3. Keep the people who left out for good

Don't delete the unsubscribed and cleaned files. Load them into your sending app's do-not-email list before your first send, so a future import of an old spreadsheet can never put them back.

## 4. Check the subscribed list before the first send

Addresses go stale over time. Run the subscribed file through the [Email Verifier](/verify) so your first send from a new account doesn't start with a wave of bounces.

## If Excel shows strange characters

Names with accents can come out garbled in Excel. Open the file through **Data, From Text/CSV** and choose **UTF-8**, or open it in Google Sheets, which reads it correctly.
