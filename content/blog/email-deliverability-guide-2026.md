---
title: "Email deliverability in 2026: how to get emails into the inbox"
slug: "email-deliverability-guide-2026"
description: "Why emails don't reach the inbox, and what to do about it in 2026: the rules Gmail, Yahoo and Outlook enforce, the checks before every send, and the fix for each problem."
date: "2026-07-12"
updated: "2026-11-06"
author: "trovarcis-team"
category: "Email Deliverability"
tags: ["deliverability", "spf", "dkim", "dmarc", "sender-reputation", "inbox-placement"]
readingTime: 6
---

**In short:** whether your email reaches the inbox comes down to four things: your domain is set up to prove the email is really from you (SPF, DKIM and DMARC), your domain and server aren't on a blocklist, your list doesn't contain dead addresses, and people want your emails. Check your domain and your list before every send, add an easy unsubscribe link, and grow your sending volume steadily.

<nav class="picker" aria-labelledby="picker-title">
<p class="picker-title" id="picker-title">Where are you?</p>
<ul>
<li><a href="#starting"><strong>I'm setting up a new domain</strong><span>What to do before the first send.</span></a></li>
<li><a href="#spam"><strong>My emails go to spam</strong><span>Find your cause.</span></a></li>
<li><a href="#bounces"><strong>My emails bounce or get rejected</strong><span>The list, or a blocklist.</span></a></li>
<li><a href="#promotions"><strong>They land in Gmail's Promotions tab</strong><span>Not spam, but not seen.</span></a></li>
<li><a href="#bulk"><strong>I'm sending to a big list</strong><span>The rules for bulk senders.</span></a></li>
</ul>
</nav>

## The four things that decide where your email lands {#four-things}

1. **Proof it's from you.** Three DNS records, SPF, DKIM and DMARC, let mail providers check that an email claiming to be from your domain really is. Without them, your email looks like it could be fake.
2. **Your reputation.** Mail providers remember how people react to your emails: bounces, spam reports, replies, opens. A domain or server on a public blocklist starts with a bad reputation.
3. **Your list.** Addresses that don't exist bounce, and every bounce tells providers you don't know who you're emailing.
4. **Your message.** Heavy designs, lots of links and no easy unsubscribe make an email look like a campaign nobody asked for.

The first three are settled before you write a word.

## I'm setting up a new domain {#starting}

1. **Add SPF, DKIM and DMARC.** The [DNS Generator](/records) gives you the exact records for your email provider to copy into your DNS. Step by step: [How to set up SPF, DKIM and DMARC](/blog/spf-dkim-dmarc-setup).
2. **Check them.** Run your domain through the free [Domain Checker](/domain). It confirms the records work and that your domain isn't on a blocklist.
3. **Test your login.** The [SMTP Tester](/smtp-test) shows whether your email account's server, port and password work.
4. **Start small.** Send first to people who know you and will reply, then grow week by week.

## My emails go to spam {#spam}

If everything goes to spam for everyone, it's your setup: authentication or a blocklist. If it's only some people, it's their history with you. If it's only some campaigns, it's the message. Pick your situation here: [Why your emails go to spam, and how to find your reason](/blog/why-emails-go-to-spam).

## My emails bounce or get rejected {#bounces}

- **"Address not found" or "user unknown":** the address doesn't exist. Clean your list with the [Email Verifier](/verify) before the next send. How: [How to clean an email list before sending](/blog/clean-email-list-before-sending).
- **"Blocked", "rejected for policy" or a blocklist name:** your domain or server is listed, or your authentication fails. Check both with the [Domain Checker](/domain), then see [Is my domain blacklisted?](/blog/domain-blacklisted-check-fix).
- **"Authentication failed" or "535" when sending:** your login is wrong, often because Gmail and Microsoft need an app password instead of your normal one. Test with the [SMTP Tester](/smtp-test).

## They land in Gmail's Promotions tab {#promotions}

Promotions isn't spam: the email arrived and Gmail sorted it. Plain, personal-looking emails with few links land in Primary more often, and readers who move you to Primary teach Gmail for next time. More: [Gmail Promotions tab: why emails go there and how to move them](/blog/gmail-promotions-tab-fix).

## I'm sending to a big list {#bulk}

Gmail and Yahoo have required this from bulk senders since February 2024, and Outlook.com has required SPF, DKIM and DMARC since May 2025:

- **SPF, DKIM and DMARC** all set up, with your From address matching your domain.
- **One-click unsubscribe** that works without logging in.
- **Few complaints:** Google asks bulk senders to keep spam reports below 0.1% and never reach 0.3%.

Then send it the safe way:

- **Clean the list right before the send,** not months earlier.
- **Respect each account's daily limit:** Gmail allows 500 a day on a personal account and 2,000 on Google Workspace. Spread big sends across several accounts.
- **Stop if addresses start bouncing.** Keep going and the damage lands on your account.

[Trovarcis Sender](/sender) does this for you when you send from your own accounts. It sets aside typos, duplicates and broken addresses before anything goes out, keeps each account inside its limits, pauses by itself if too many addresses are refused, and shows the mail server's own reason for every email that didn't arrive. Your lists and your SMTP credentials are stored locally. Trovarcis never sees them.

<div class="product-card">
<img src="/images/sender/sender-report-800.webp" width="800" height="589" alt="Trovarcis Sender sending a campaign across three SMTP accounts, each within its daily limit." loading="lazy">
<div class="product-card-body">
<p class="product-card-price">{{sender_price}} <span>one payment, 3 computers, every 1.x update</span></p>
<a class="product-card-cta" href="/sender">Get Sender</a>
</div>
</div>

More on this: [How to send bulk email without getting blacklisted](/blog/send-bulk-email-without-blacklist).

## Before every send

1. **Domain:** [Domain Checker](/domain), free.
2. **List:** [Email Verifier](/verify) on the exact list you're sending to.
3. **Message:** [Email Scorer](/score) on the real email.
4. **Test:** send it to your own Gmail and check where it lands.
