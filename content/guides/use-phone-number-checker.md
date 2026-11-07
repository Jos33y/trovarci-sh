---
title: "How to check if a phone number can receive SMS"
nav: "Phone Number Checker"
description: "Check whether a phone number is valid and can receive text messages before you send. How to use the Phone Number Checker for one number or a list."
short: "Type the number into the Phone Number Checker and press Verify for a free format check. Then press Get Carrier Info to ask the phone network whether it's mobile, landline or VoIP and which carrier it's on. Landlines can't receive texts. 2 cents per number. For a list, choose Have a list? Verify in bulk."
published: "2026-11-07"
checked: "2026-11-07"
topic: tools
order: 6
action: number
asks:
  - how to check if a phone number can receive sms
  - is this number a landline or mobile
  - phone number validator
  - check phone number carrier
  - verify phone numbers before bulk sms
  - clean phone number list
needs:
  - The number, with its country code if you have it
  - For carrier lookup, a free Trovarcis account (10 free credits)
related:
  - use-email-verifier
  - verify-email-list-before-sending
post: check-phone-numbers-before-bulk-sms
---

## 1. Check the format, free

Open the [Phone Number Checker](/verify-number). Type the number with its country code, like +44 20 7946 0958, or pick its country from the list. Press **Verify**. It checks the number against that country's numbering plan, with no signup. A number that fails here can't receive anything.

## 2. Ask the network

Press **Get Carrier Info** for 2 credits (2 cents). The phone network answers with:

| Field | What it tells you |
|---|---|
| Line type | Mobile, landline, VoIP or toll-free |
| Carrier | The phone network the number belongs to |
| Can receive texts | Yes, No, or Yes (limited) for some VoIP numbers |

Without the lookup, line type is only estimated from the number range, which can be wrong for numbers that moved networks.

## 3. Check a list

Choose **Have a list? Verify in bulk**, pick the **Default country for numbers without '+'**, and paste numbers one per line. Duplicates are removed before you're charged. Up to 10,000 per list. When it finishes, download **mobile.txt** for the numbers that can receive texts, **all.txt**, or **results.csv** with every field.

## What to remove

Remove invalid numbers and landlines before an SMS send: texts to them fail and still cost you. Keep landlines if you'll call them instead.
