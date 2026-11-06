---
title: "How to clean an email list before sending"
slug: "clean-email-list-before-sending"
description: "How to clean an email list before a campaign: what to remove, what each verification result means, and what to do with catch-all and role addresses."
date: "2026-08-26"
updated: "2026-11-06"
author: "trovarcis-team"
category: "Email Deliverability"
tags: ["email-verification", "list-hygiene", "catch-all", "bounce-rate", "deliverability"]
readingTime: 4
---

**In short:** run the list you're about to send to through an email verifier. Remove invalid, disposable and broken addresses. Put catch-all and role addresses like `info@` in their own group and send to them carefully. Stop emailing people who haven't opened anything in a year. Do it right before each campaign, because lists go stale.

<nav class="picker" aria-labelledby="picker-title">
<p class="picker-title" id="picker-title">What do you need?</p>
<ul>
<li><a href="#when"><strong>Does my list need cleaning?</strong><span>The signs, and how often.</span></a></li>
<li><a href="#how"><strong>How to clean it</strong><span>Four steps.</span></a></li>
<li><a href="#results"><strong>What do my results mean?</strong><span>What to do with each one.</span></a></li>
<li><a href="#catch-all"><strong>What is a catch-all address?</strong><span>And whether to send to it.</span></a></li>
</ul>
</nav>

## Does my list need cleaning? {#when}

Clean it before your next send if any of these are true:

- You haven't cleaned it in months. People change jobs and close accounts all the time, so every list decays.
- Your last campaign had a lot of bounces.
- People are reporting your emails as spam, or replying to ask who you are.
- You imported it from somewhere else: a bought list, an event, a spreadsheet from a colleague.

**How often:** right before every campaign to that list. A list cleaned months ago has months of dead addresses in it.

## How to clean it {#how}

1. **Export the exact list you're about to send to,** not your whole contact file.
2. **Run it through the [Email Verifier](/verify).** Paste or upload up to 50,000 addresses. It checks each one with its mail server, without sending an email.
3. **Sort the results** using the table below.
4. **Remove anyone who hasn't opened anything in a year.** They earn you nothing and hurt your reputation.

New accounts get 10 free credits, and each address costs 1 credit, so you can try it on a sample first.

## What do my results mean? {#results}

| Result | What it means | What to do |
|---|---|---|
| Valid | The mailbox exists and accepts mail | Send |
| Invalid | The mailbox or domain doesn't exist | Remove for good |
| Disposable | A throwaway inbox | Remove |
| Role | A shared address like `info@` or `sales@` | Send less often, or remove |
| Catch-all | The domain accepts every address, so this one can't be confirmed | Send carefully, see below |
| Unknown | The server wouldn't give a yes or no | Retry later, or treat like catch-all |

Add every invalid address to your Do not send list, so it never comes back from an old export.

## What is a catch-all address? {#catch-all}

Some company domains accept mail for any address, real or not. Ask whether `anything@company.com` exists and the server says yes. So no verifier can confirm a single mailbox on that domain without actually sending to it.

Catch-all addresses are common at larger companies, so dropping them all can mean dropping good contacts. The safe middle:

1. Put them in their own group.
2. Send to them after your main campaign, a few hundred at a time.
3. Watch the bounces from that group alone.
4. Remove anyone who bounces or never opens across two emails.

## After the list is clean

A clean list gets your email accepted. Two other things decide where it lands:

- **Your domain:** check SPF, DKIM, DMARC and blocklists with the free [Domain Checker](/domain).
- **Your message:** score it with the [Email Scorer](/score).

Sending the campaign yourself? [Trovarcis Sender](/sender) sets aside typos, duplicates and broken addresses before anything goes out, and never mails your Do not send list again.

More on sending safely: [How to send bulk email without getting blacklisted](/blog/send-bulk-email-without-blacklist).
