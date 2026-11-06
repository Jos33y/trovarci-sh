---
title: "Why your emails go to spam, and how to find your reason"
slug: "why-emails-go-to-spam"
description: "Emails going to spam? Answer three quick questions to find your cause: authentication, a blocklist, your list or the message itself, with the fix for each."
date: "2026-08-28"
updated: "2026-11-06"
author: "trovarcis-team"
category: "Email Deliverability"
tags: ["spam-filter", "deliverability", "inbox-placement", "authentication", "sender-reputation"]
readingTime: 5
---

**In short:** there are many possible causes, but you usually have one or two. If every email lands in spam, the problem is your setup: SPF, DKIM or DMARC failing, or a blocklist. If only some people get it in spam, it's their history with you. If only some campaigns do, it's the message. Pick what you see below.

<nav class="picker" aria-labelledby="picker-title">
<p class="picker-title" id="picker-title">What do you see?</p>
<ul>
<li><a href="#every-email"><strong>Every email goes to spam, for everyone</strong><span>Your setup: authentication or a blocklist.</span></a></li>
<li><a href="#some-people"><strong>Spam for some people, inbox for others</strong><span>Their history with your emails.</span></a></li>
<li><a href="#suddenly"><strong>It worked before, and suddenly stopped</strong><span>Something changed. Here's what to look at.</span></a></li>
<li><a href="#some-campaigns"><strong>Some campaigns land, others don't</strong><span>The message itself.</span></a></li>
<li><a href="#promotions"><strong>It's in Promotions, not Spam</strong><span>That's a different problem.</span></a></li>
</ul>
</nav>

## Every email goes to spam, for everyone {#every-email}

When every message lands in spam, at every provider, the cause is on your side and it affects everything you send. Check these in order:

1. **SPF, DKIM and DMARC pass, and match your From address.** Send an email to a Gmail address, open it, choose **Show original**, and look for three passes: SPF, DKIM and DMARC. SPF and DKIM can both pass while DMARC fails, when they pass for your email service's domain instead of yours. That one looks fine everywhere else and is the most common silent cause.
2. **Your domain or server isn't on a blocklist.** The free [Domain Checker](/domain) checks both, along with your SPF, DKIM and DMARC records, in one go.
3. **Your domain's reputation at Gmail.** Add your domain to Google Postmaster Tools. If it shows a low reputation, nothing else matters until that recovers.

Missing records? The [DNS Generator](/records) builds them for your email provider, and [How to set up SPF, DKIM and DMARC](/blog/spf-dkim-dmarc-setup) walks through each one.

## Spam for some people, inbox for others {#some-people}

Then your setup is fine. Gmail and Outlook decide per person, based on how each one treats your emails. Someone who replies to you gets your mail in the inbox. Someone who deletes your emails unread for months gets them filtered.

- Send to your most engaged people first.
- Stop emailing people who haven't opened anything in a year.
- Ask new subscribers to reply, or to move your first email to their inbox.

## It worked before, and suddenly stopped {#suddenly}

Something changed. The usual suspects:

- **You added a new sending service** and edited your SPF record. SPF breaks once it needs more than 10 DNS lookups, and it still looks right in your DNS panel. See [SPF PermError: the 10 DNS lookup limit](/blog/spf-permerror-10-dns-lookups-fix).
- **Your DKIM key changed** and the new record was never published.
- **You moved your DNS** to a new host and a record didn't come across exactly.
- **You sent to a new or old list** and the bounces hurt your reputation.
- **You sent far more than usual,** which looks like a hacked account.

Run the [Domain Checker](/domain) first: it catches the first three in seconds.

## Some campaigns land, others don't {#some-campaigns}

If your receipts and replies arrive but your newsletter doesn't, the difference is the message. Spam filters don't work from lists of banned words. They look at the whole email:

- heavy designed layouts and big images with little text
- lots of links, link shorteners and tracking redirects
- no plain-text version
- no easy unsubscribe link
- a no-reply sender address

Paste the real email into the [Email Scorer](/score) and it shows what in the message is pushing it toward spam, with the fix for each.

If your bounce rate is high, the list is the problem rather than the message: [How to clean an email list before sending](/blog/clean-email-list-before-sending).

## It's in Promotions, not Spam {#promotions}

Promotions isn't spam. The email arrived and Gmail sorted it into a tab. The reasons and fixes are different: [Gmail Promotions tab: why emails go there and how to move them](/blog/gmail-promotions-tab-fix).

## Before every big send

1. Check your domain with the [Domain Checker](/domain).
2. Clean the exact list you're sending to with the [Email Verifier](/verify).
3. Score the real message with the [Email Scorer](/score).
4. Send a test to your own Gmail and check where it lands.

Sending in bulk from your own accounts? [Trovarcis Sender](/sender) checks your list before sending and keeps every account inside its limits.
