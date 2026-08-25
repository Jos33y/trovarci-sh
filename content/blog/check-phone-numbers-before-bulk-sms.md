---
title: "How to check phone numbers before sending bulk SMS (and stop paying for dead numbers)"
slug: "check-phone-numbers-before-bulk-sms"
description: "Every dead number on your list costs you money on every send. What phone verification actually checks, why landlines fail silently, and how to clean a list collected on paper."
date: "2026-08-27"
author: "Trovarcis Team"
category: "Email Marketing"
tags: ["sms", "phone-verification", "line-type", "list-hygiene", "bulk-sms"]
readingTime: 9
---

Email bounces cost you reputation. SMS to a dead number costs you cash, on every single send, forever.

That difference matters more than it sounds. A bad email address is a one-time reputation hit you can recover from. A bad phone number sitting in your contact list gets charged every week for as long as nobody removes it, and nothing in your SMS dashboard tells you which numbers those are. The message shows as sent. You paid for it. Nobody received it.

If you run a church, a school, a shop, or anything else where a list of phone numbers was collected by hand over several years, this is almost certainly happening to you right now.

Here is what phone verification actually checks, why some numbers fail without ever telling you, and how to clean a list before your next send.

## Why numbers go dead without you noticing

Four things happen to a phone list over time, and only one of them is visible.

**People change numbers.** They switch carrier, lose a phone, move country, or stop using a line. The old number gets reassigned to someone else within months. Your message now goes to a stranger, and you paid to send it.

**Handwriting.** Any list collected on a paper form, a sign-up sheet at the back of a hall, or a slip at a counter contains transcription errors. A 3 read as an 8. A digit missing. Two digits swapped. These look like real numbers in a spreadsheet, which is exactly why nobody catches them.

**Missing or wrong country codes.** A list built from local formats works fine until it goes into a bulk SMS platform, which needs full international format. Numbers stored as `0803...` instead of `+234803...` fail on submission or route to the wrong country entirely.

**Landlines.** A landline cannot receive SMS. Sending to one does not bounce, does not warn you, and does not appear as an error. It fails silently. If your list has office numbers, home numbers, or anything collected before mobile phones became universal, some portion of it is landlines you are texting into nothing.

That last one is the most expensive, because it is the most invisible.

## What verification actually tells you

A proper phone check answers three questions about each number.

**Is it a real, assignable number?** Every country publishes a numbering plan through its telecom regulator: which prefixes exist, how many digits a valid number has, how they are structured. A number is checked against that plan. This catches typos, missing digits, and numbers that could never exist.

**What kind of line is it?** Mobile, landline, VoIP, or toll-free. Only mobile numbers reliably receive SMS. Landlines and toll-free numbers generally cannot. VoIP numbers sometimes can and sometimes cannot, depending on the provider.

**Which carrier operates it now?** Not which carrier it was assigned to originally. Numbers get ported between carriers constantly, and a number collected as a landline five years ago may be a mobile today, or the reverse.

That is what the [Number Verifier](/verify-number) returns: validity against the current numbering plan, the real carrier, and the line type, for numbers in most countries. Two credits per number, which is two cents.

## The arithmetic that makes this obvious

Work it out with your own numbers before deciding whether cleaning is worth it. Most people have never done this and are surprised by the answer.

Take a list of 2,000 numbers collected over several years. A conservative estimate for a list like that is 8 to 15% unusable, counting dead numbers, typos, and landlines together. Call it 10%, so 200 numbers.

If you send one SMS a week to the whole list, those 200 numbers cost you 200 sends every week. That is 10,400 wasted messages a year, and you pay your SMS provider for every one. Multiply by whatever your provider charges per message and that is the annual cost of not cleaning.

Verifying the same list once costs 2,000 numbers at two cents, so $40.

For most organizations the cleaning pays for itself within the first two or three sends. The larger the list and the more often you send, the faster it pays back. Filtering landlines alone can cut a meaningful share of messaging spend on lists that were collected before mobile was the default.

There is also the part that does not show up in the arithmetic. A high failure rate on your sends is visible to your SMS provider, and providers do restrict accounts that consistently submit large volumes of undeliverable numbers.

## What to do with each result

Verification gives you categories. What you do with each one depends on how you plan to reach that person.

| Result | What it means | What to do |
|---|---|---|
| Valid, mobile | Real number, can receive SMS | Send |
| Valid, landline | Real number, cannot receive SMS | Move to a call list, remove from SMS |
| Valid, toll-free | Business line, usually cannot receive SMS | Remove from SMS |
| Valid, VoIP | May or may not receive SMS | Separate segment, test with a small batch |
| Invalid | Fails the country numbering plan | Remove, or fix if the typo is obvious |
| Wrong format | Missing country code or local format | Reformat to international, then recheck |

The landline row is the one worth acting on first, because those numbers belong to real people who want to hear from you. They are not dead contacts. They are contacts on the wrong channel. A church with 300 landlines on its SMS list has 300 members it should be calling or emailing instead, and it will never know that from the SMS dashboard.

The invalid row is worth reviewing by hand rather than deleting in bulk, especially on a list collected on paper. A number one digit short is usually a transcription error, and the person is often recoverable if someone recognizes the name.

## Cleaning a list that was collected by hand

Most guides on this topic assume your numbers came from a web form with validation. If yours came from sign-up sheets, registration forms, or a notebook at the counter, the process is different.

**Fix the format first, verify second.** Get every number into full international format before you check anything. A number stored in local format may come back invalid because the checker cannot tell which country it belongs to. If your list is all one country, adding the country code is a spreadsheet operation, not a manual one.

**Strip the noise.** Paper-sourced lists collect spaces, dashes, brackets, and occasional notes in the same cell. Remove everything that is not a digit or a leading plus sign.

**Deduplicate before verifying, not after.** The same person appears three times with three different formats of the same number. Fixing the format first makes the duplicates visible, and every duplicate you remove is a number you do not pay to check.

**Verify, then keep the report.** The result tells you which are mobile. That distinction is worth keeping in your records permanently, because it tells you which channel to use for each person from now on rather than only for this campaign.

**Fix the form.** If numbers are still being collected on paper, the list will decay again. Adding a field for country code, printing boxes for individual digits, and reading the number back to the person catches most errors at the point they happen.

## How often to check

Less often than an email list, because phone numbers change more slowly than email addresses. But not never.

- **Before the first send to any list** you have not verified before, regardless of age
- **Every 6 to 12 months** for an active list you send to regularly
- **Whenever a batch is added** from a new source, an event, or a registration drive
- **After any period of not sending.** A list that has been quiet for a year has drifted

The rule that matters more than the schedule: check before a large send, not after it fails. The whole point is that failures on SMS are invisible until you look at the bill.

## What this does not cover

Verification confirms the number is real, current, and able to receive SMS. It does not confirm the person wants your messages.

Consent rules vary by country and several of them are strict about automated messages to mobile numbers. Verification is a technical check, not a permission check, and passing it does not mean a number is legal to text in your jurisdiction. Keep a record of how each number was collected and what the person agreed to.

It also does not tell you whether the phone is switched on right now. No check can, short of sending something. What it tells you is that the number is assignable, correctly formatted, currently held by a named carrier, and on a line type that can receive a message. That removes most of the waste.

## Where to start

1. **Take the list you plan to send to next.** Not the master file. The one going out.
2. **Fix the format.** Every number in full international format, digits and a leading plus sign only, duplicates removed.
3. **Run it through the [Number Verifier](/verify-number).** New accounts get 10 free credits and each check costs two, so five numbers are free to test with before you commit anything. No card required to sign up.
4. **Split the results.** Mobile numbers stay on SMS. Landlines move to a call or email list. Invalid entries get reviewed by hand if the list came from paper.

If you also send email to the same contacts, the same problem exists on that side and the fix is the same shape: [How to clean an email list before sending](/blog/clean-email-list-before-sending).
