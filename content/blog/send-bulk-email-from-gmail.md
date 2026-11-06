---
title: "How to send bulk email from Gmail without getting blocked"
slug: "send-bulk-email-from-gmail"
description: "Gmail's daily sending limits, how to connect Gmail to a sending app with an app password, what to do when Gmail blocks you, and how to send to more people than one account allows."
date: "2026-11-06"
author: "trovarcis-team"
category: "Email Marketing"
tags: ["gmail", "bulk-email", "sending-limits", "app-password", "smtp"]
readingTime: 5
---

**In short:** a personal Gmail account can send to about 500 people a day, and a paid Google Workspace account to about 2,000. Go over, or send to too many addresses that don't exist, and Gmail stops you from sending for up to 24 hours. To send a bulk email from Gmail safely, check the list first, connect Gmail to a sending app with an app password, keep each account under its daily limit, and stop the moment addresses start bouncing.

<nav class="picker" aria-labelledby="picker-title">
<p class="picker-title" id="picker-title">What do you need?</p>
<ul>
<li><a href="#limits"><strong>How many emails can I send a day?</strong><span>The limit for each kind of account.</span></a></li>
<li><a href="#app-password"><strong>How do I send from Gmail in another app?</strong><span>The app password and the settings.</span></a></li>
<li><a href="#blocked"><strong>Gmail blocked me</strong><span>Why it happened and what to do now.</span></a></li>
<li><a href="#more"><strong>My list is bigger than the limit</strong><span>Three ways to reach everyone.</span></a></li>
</ul>
</nav>

## How many emails can I send a day? {#limits}

| Account | Daily limit |
|---|---|
| Personal Gmail (@gmail.com) | 500 |
| Google Workspace, paid | 2,000 |
| Google Workspace, free trial | 500 |

Count people, not emails. One email to 500 people uses the whole day on a personal account. Your replies and everyday messages count too, so plan to send your campaign well below the limit, not right up to it.

## How do I send from Gmail in another app? {#app-password}

Your normal Gmail password won't work in a sending app. Google wants an app password: a separate 16-character code that only lets the app send email.

1. **Turn on 2-Step Verification** in your Google account, under Security. App passwords only appear once it's on.
2. **Create the app password** at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). Give it a name you'll recognize, like the app's name, and copy the code.
3. **Enter these settings** in your sending app:
    - **Server:** `smtp.gmail.com`
    - **Port:** `587` with STARTTLS, or `465` with SSL
    - **Username:** your full Gmail address
    - **Password:** the app password, without spaces
4. **Test it** with the free [SMTP Tester](/smtp-test) before your first send. It shows whether the login works, and if not, where it fails.

**No app password option?** Google doesn't offer one if your account signs in with a security key only, uses Advanced Protection, or belongs to a work or school that has turned it off. For a work account, ask whoever manages it.

**Error 535, "Username and Password not accepted":** you used your normal password, or the app password was copied wrong. Create a new one and paste it again.

## Gmail blocked me {#blocked}

Gmail blocks sending for one of two reasons:

- **You went over the daily limit.** Sending usually comes back within 1 to 24 hours.
- **Too many of your emails bounced.** Sending to lots of addresses that don't exist can block your account for 24 hours. This is the one to worry about, because it says something about your list.

What to do now:

1. **Stop.** Don't move the same list to another account. The same addresses will bounce there too.
2. **Wait** for sending to come back.
3. **Clean the list** before you try again. The [Email Verifier](/verify) finds the addresses that would bounce, and new accounts get 10 free credits. How to read the results: [How to clean an email list before sending](/blog/clean-email-list-before-sending).
4. **Send the rest over several days,** in smaller batches.

## My list is bigger than the limit {#more}

**Spread it over days.** 2,000 people on a personal account is four or five days of sending. It's free, and slower is safer for a list you haven't emailed in a while.

**Move to Google Workspace.** About 2,000 a day per user, from your own domain instead of @gmail.com, which also looks more trustworthy to the people you email.

**Send from several accounts at once, each inside its own limit.** Three Workspace accounts reach about 6,000 people a day, or you can mix Gmail with your other email accounts. Doing this by hand means splitting the list, tracking each account's count and watching for bounces. [Trovarcis Sender](/sender) does that part:

- It checks the list before anything goes out, and sets aside typos, duplicates and broken addresses.
- It keeps each account inside the daily and hourly limits you set, and takes turns between them.
- It pauses the campaign by itself if too many addresses are refused, before Gmail blocks you.
- It never emails anyone on your Do not send list.
- It shows the mail server's own reason for every email that didn't arrive.

Your lists and your SMTP credentials are stored locally. Trovarcis never sees them.

<div class="product-card">
<img src="/images/sender/sender-report-800.webp" width="800" height="589" alt="Trovarcis Sender sending a campaign across three SMTP accounts, each within its daily limit." loading="lazy">
<div class="product-card-body">
<p class="product-card-price">{{sender_price}} <span>one payment, 3 computers, every 1.x update</span></p>
<a class="product-card-cta" href="/sender">Get Sender</a>
</div>
</div>

## Getting into the inbox, not just out of Gmail

The daily limit decides how many emails leave. Whether they land in the inbox depends on trust:

- **Sending from your own domain?** Check it with the free [Domain Checker](/domain). It confirms the records that prove the email is really from you, and that your domain isn't on a blocklist. Missing records: [How to set up SPF, DKIM and DMARC](/blog/spf-dkim-dmarc-setup).
- **Write like a person.** Plain emails with few links and no big images get through more often. Score yours with the [Email Scorer](/score).
- **Make leaving easy.** An unsubscribe link costs you less than a spam report.

More on sending to a big list safely: [How to send bulk email without getting blacklisted](/blog/send-bulk-email-without-blacklist).
