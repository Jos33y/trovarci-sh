---
title: "Send your newsletter without a monthly bill: the one-time alternative to Mailchimp"
slug: "send-newsletter-without-mailchimp"
description: "Mailchimp's free plan now stops at 250 contacts. What your newsletter costs there, and how to send it yourself for one payment: the software, the sending account, signups, clicks and unsubscribes."
date: "2026-11-07"
author: "trovarcis-team"
category: "Email Marketing"
tags: ["newsletter", "mailchimp-alternative", "bulk-email", "amazon-ses", "one-time-payment"]
readingTime: 6
---

**In short:** Mailchimp's free plan now holds 250 contacts and 500 emails a month. Past that, Standard costs about $100 a month at 5,000 subscribers, and the bill grows with your list. You can send the same newsletter yourself with two pieces: sending software you pay for once, and a sending account such as Amazon SES that charges about 10 cents per 1,000 emails. A weekly newsletter to 5,000 people then costs around $2 a month to send.

<nav class="picker" aria-labelledby="picker-title">
<p class="picker-title" id="picker-title">What do you need?</p>
<ul>
<li><a href="#cost"><strong>What will Mailchimp cost me?</strong><span>The price at your list size, per month and per year.</span></a></li>
<li><a href="#how"><strong>How do I send it myself?</strong><span>The two pieces, and which sending account to pick.</span></a></li>
<li><a href="#tracking"><strong>What about signups, clicks and opens?</strong><span>How each works without Mailchimp.</span></a></li>
<li><a href="#move"><strong>How do I move my list?</strong><span>Export, check, import, send.</span></a></li>
</ul>
</nav>

## What Mailchimp costs as your list grows {#cost}

| Subscribers | Mailchimp | Per year |
|---|---|---|
| Up to 250 | Free, 500 emails a month | $0 |
| 2,500 | Standard, $60 a month | $720 |
| 5,000 | Standard, $100 a month | $1,200 |
| 10,000 | Standard, $135 a month | $1,620 |

Mailchimp charges for the people on your list, not the emails you send, and unsubscribed contacts still count unless you remove them. Prices from Mailchimp's pricing page, monthly billing, checked November 2026.

Work out your own numbers, including three years, with the [bulk email cost calculator](/bulk-email-cost-calculator?contacts=5000&sends=4).

## How to send it yourself {#how}

Mailchimp is two things in one bill: the software where you write and send, and the servers that deliver the email. Split them and each gets cheap.

1. **Sending software** you install and pay for once. You import your list, paste your newsletter, and send.
2. **A sending account** that delivers the email. You pay it per email, or a small flat fee.

### Which sending account for a newsletter

A newsletter goes to people who signed up, which is exactly what sending services are built for.

| Account | Cost | Good for |
|---|---|---|
| Amazon SES | $0.10 per 1,000 emails | Any size. The cheapest once set up. New accounts ask Amazon for production access first, usually a one-day form |
| Brevo | Free for 300 emails a day; paid plans by emails sent | Small lists, and a quick start |
| Google Workspace | About $7 a month per mailbox; 2,000 emails a day each | Lists under a few thousand, sent from a real mailbox |

Two rules whichever you pick:

- **Send from your own domain**, like news@yourname.com. A sending service delivering mail "from" a @gmail.com address gets it junked or refused, because Gmail says no one else may send as Gmail.
- **Set up your domain's records** so inboxes trust the mail. The [DNS Generator](/records) writes them for your provider, and the [Domain Checker](/domain) confirms they work.

## Signups, clicks and opens without Mailchimp {#tracking}

**Signups.** A form on your website, Google Forms or Tally collects addresses into a spreadsheet. Export it as CSV and import it before each issue.

**Clicks.** Add UTM tags to your links and every click shows in your own Google Analytics, by issue and by link. For per-reader clicks, put a merge field in the link, like `?r={{id}}`, so each subscriber gets their own. Use links on your own domain: link shorteners are a common spam signal.

**Opens.** Since 2021 Apple Mail loads every email's images on delivery and Gmail caches them, so open rates count machines as well as people, on Mailchimp too. Judge an issue by its clicks and replies.

**Unsubscribes.** Put an unsubscribe link in your footer: a page or form on your site works. Then make sure nobody who left gets the next issue (Sender's Do not send list does this).

## Moving your list from Mailchimp {#move}

1. **Export your audience** as a CSV from Mailchimp's Audience page. Include unsubscribed contacts: you need them to keep not emailing them.
2. **Check the list.** Addresses that no longer exist bounce, and a burst of bounces on your first send from a new account looks bad. The [Email Verifier](/verify) finds them for 1 cent each.
3. **Import, write, send a test to yourself**, then send the issue.

## Sending it with Trovarcis Sender

Trovarcis Sender is the software half: a Windows app you pay for once and use with any sending account, SES, Brevo, Workspace or your own server.

- **Paste the HTML from any email designer**, or write plain text. Merge fields like `{{firstName | there}}` fill in each reader's details, with a fallback when one is missing.
- **Next week's issue starts from this week's.** Messages are saved; duplicate one and change what's new.
- **Schedule it.** Pick the day and time, or limit sending to set hours.
- **Imports check the list**: duplicates removed, typos and broken addresses set aside with the reason.
- **Your unsubscribes stay unsubscribed.** Import Mailchimp's unsubscribed contacts into Do not send once, and Sender skips them on every issue.
- **The report shows who got it**, and the mail server's own reason for every email that didn't arrive.

<div class="product-card">
<img src="/images/sender/sender-report-800.webp" width="800" height="589" alt="Trovarcis Sender sending a campaign across three SMTP accounts, each within its daily limit." loading="lazy">
<div class="product-card-body">
<p class="product-card-price">{{sender_price}} <span>one payment, 3 computers, every 1.x update</span></p>
<a class="product-card-cta" href="/sender">Get Sender</a>
</div>
</div>

## Need a hand getting set up?

Not sure which sending account fits your newsletter, or stuck on the setup? [Write to us](/contact) and we'll point you to the right one and walk you through it.
