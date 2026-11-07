---
title: "How to check if an email address is real"
nav: "Email Verifier"
description: "Check whether an email address exists without emailing it. How to use the Email Verifier for one address or a whole list, and what each result means."
short: "Type the address into the Email Verifier and press Verify. It asks the address's mail server whether the mailbox exists, without sending anything, and says Valid, Invalid, Risky or Unknown. For a list, choose Have a list? and upload a CSV or paste the addresses. 1 cent per address."
published: "2026-11-07"
checked: "2026-11-07"
topic: tools
order: 4
action: verify
asks:
  - how to check if an email address is real
  - is this email address valid
  - check if email exists without sending
  - email verifier how to use
  - what does risky mean email verification
  - accepts all email meaning
  - catch-all email address
needs:
  - A free Trovarcis account (10 free credits)
related:
  - verify-email-list-before-sending
  - email-bounce-meaning
  - use-domain-checker
post: clean-email-list-before-sending
---

## 1. Check one address

Open the [Email Verifier](/verify), type the address and press **Verify**. The check runs in a few seconds and costs 1 credit (1 cent). New accounts get 10 free.

## 2. Read the result

| Result | What it means | What to do |
|---|---|---|
| Valid | The mailbox exists and accepts email | Send |
| Invalid | The mailbox or domain doesn't exist, or the address is written wrong | Don't send. It would bounce |
| Risky | Real, but a throwaway inbox, a shared inbox like info@, or a server that accepts every address | Keep the ones you know; send carefully to the rest |
| Unknown | The mail server wouldn't say yes or no, or was too slow | Check again later |

The details under the result show each check: **Format**, **Domain**, **Mail server**, **Mailbox** and **Safety**.

**Accepts all** means the server says yes to any address, real or not, so nobody can confirm the mailbox from outside. Most are real; send to them carefully.

## 3. Check a whole list

Choose **Have a list? Upload CSV for bulk verification**. Drop in a CSV or TXT file, or paste addresses one per line. Duplicates are removed before you're charged, and the cost shows before you start. Up to 50,000 per list.

You can leave the page while it runs. When it's done, download:

| File | What's in it |
|---|---|
| valid.txt | Only the valid addresses, ready to paste into your sender |
| all.txt | Every address, one per line |
| results.csv | Every address with its result and reason |

Lists are deleted after 48 hours, so download them when they finish. Credits for addresses that couldn't be checked come back automatically.
