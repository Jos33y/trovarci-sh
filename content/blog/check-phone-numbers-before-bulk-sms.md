---
title: "How to check phone numbers before sending bulk SMS"
slug: "check-phone-numbers-before-bulk-sms"
description: "Stop paying to text dead numbers and landlines. How to check a phone list before a bulk SMS, what each result means, and how to clean a list collected by hand."
date: "2026-08-27"
updated: "2026-11-06"
author: "trovarcis-team"
category: "Email Marketing"
tags: ["sms", "phone-verification", "line-type", "list-hygiene", "bulk-sms"]
readingTime: 4
---

**In short:** every text to a dead number, a mistyped number or a landline is paid for and never read, and your SMS dashboard still shows it as sent. Before a bulk send, put every number in international format, remove duplicates, and run the list through a phone number checker. Keep the mobiles, move landlines to a call or email list, and fix or remove the rest.

<nav class="picker" aria-labelledby="picker-title">
<p class="picker-title" id="picker-title">What do you need?</p>
<ul>
<li><a href="#why"><strong>Why do texts go nowhere?</strong><span>The four reasons a number fails.</span></a></li>
<li><a href="#how"><strong>How to check my list</strong><span>Four steps.</span></a></li>
<li><a href="#results"><strong>What do my results mean?</strong><span>What to do with each one.</span></a></li>
<li><a href="#by-hand"><strong>My list was collected on paper</strong><span>Fix these first.</span></a></li>
</ul>
</nav>

## Why do texts go nowhere? {#why}

- **The number changed hands.** People switch numbers and old ones get given to someone else. You pay to text a stranger.
- **Typos.** A 3 read as an 8, a missing digit, two digits swapped. They look like real numbers in a spreadsheet.
- **No country code.** Bulk SMS services need the international format, like `+44 7700 900123`. A number saved as `07700 900123` can fail or go to the wrong country.
- **Landlines.** A landline can't receive a text. It doesn't bounce or show an error. It just never arrives.

## How to check my list {#how}

1. **Take the list you're about to send to,** not your whole contact file.
2. **Put every number in international format:** a plus sign, the country code, then the number, with no spaces or dashes. Remove duplicates.
3. **Run it through the [Number Verifier](/verify-number).** For each number it shows whether it's valid, its country, its carrier and its line type: mobile, landline or VoIP. Upload up to 10,000 numbers at once.
4. **Sort the results** using the table below.

The format check is free for single numbers. The carrier and line type check costs 2 credits per number, and new accounts get 10 free credits to try it.

## What do my results mean? {#results}

| Result | What it means | What to do |
|---|---|---|
| Valid, mobile | Real number that can receive texts | Send |
| Valid, landline | Real number, can't receive texts | Call or email them instead |
| Valid, VoIP | May or may not receive texts | Test with a few first |
| Toll-free | Business line, usually can't receive texts | Remove from SMS |
| Invalid | Can't exist in that country | Fix if the typo is obvious, otherwise remove |

Landlines are real people who want to hear from you, just on the wrong channel. Move them to a call or email list rather than deleting them.

## My list was collected on paper {#by-hand}

Sign-up sheets and forms filled in by hand have the most errors. Before checking:

1. **Clean the cells:** keep only digits and a leading plus sign.
2. **Add the country code** to every number. If the whole list is from one country, that's one change for the whole column.
3. **Remove duplicates:** the same person often appears several times, written differently.
4. **Look at invalid results by hand.** A number one digit short is usually a typo, and you may recognize the name.

To stop it happening again, add a country code box to the form and read each number back to the person.

## How often

Check before the first send to any new list, whenever you add a batch of numbers, and every 6 to 12 months for a list you text regularly.

A valid number tells you the line works, not that the person agreed to your texts. Keep a record of how each number was collected.

Emailing the same people too? Clean that list as well: [How to clean an email list before sending](/blog/clean-email-list-before-sending).
