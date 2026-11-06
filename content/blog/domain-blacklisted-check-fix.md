---
title: "Is my domain blacklisted? Checks, causes and subdomains"
slug: "domain-blacklisted-check-fix"
description: "How to check if your domain or mail server is blacklisted, what gets a whole domain listed, whether subdomains are covered, and how to get removed for free."
date: "2026-07-12"
updated: "2026-11-06"
author: "trovarcis-team"
category: "Email Deliverability"
tags: ["blacklist", "spamhaus", "dnsbl", "deliverability", "subdomains"]
readingTime: 5
---

A blacklist, also called a blocklist or DNSBL, is a public list that mail servers check before accepting email. There are two kinds, and they work differently. **IP blocklists** list the addresses of servers that send mail. **Domain blocklists** list domain names, wherever they appear: in the sender address or in a link inside the email.

<nav class="picker" aria-labelledby="picker-title">
<p class="picker-title" id="picker-title">What do you need?</p>
<ul>
<li><a href="#check"><strong>Check if my domain is listed</strong><span>Free, in one pass, no signup.</span></a></li>
<li><a href="#subdomains"><strong>Does a listing cover my subdomains?</strong><span>Usually yes. Here is how it works.</span></a></li>
<li><a href="#why-listed"><strong>What gets a whole domain listed?</strong><span>What the lists say they look for.</span></a></li>
<li><a href="#get-delisted"><strong>I'm listed. How do I get off?</strong><span>Fix the cause, then request removal.</span></a></li>
<li><a href="#not-listed"><strong>Mail is rejected, but I'm not listed</strong><span>Where to look next.</span></a></li>
</ul>
</nav>

## Check if my domain is listed {#check}

Paste your domain into the free [Domain Checker](/domain). In one pass it checks:

- **Your domain** on Spamhaus DBL and SURBL, the two main domain blocklists.
- **Your mail server's IP address** on Spamhaus ZEN, SpamCop, PSBL and Barracuda.

It also checks SPF, DKIM, DMARC and your mail server setup, because those cause rejections too. Every listing it finds links to that list's own lookup or removal page.

To check Spamhaus by hand, use their [reputation checker](https://check.spamhaus.org/). Technical users can also run `dig yourdomain.com.dbl.spamhaus.org`: an answer starting with `127.0.1.` means listed, no answer means not listed. An answer starting with `127.255.255.` means Spamhaus refused the lookup, which happens through big public DNS services, so use the website instead.

If another tool tells you that you're listed on **SORBS**, ignore it. SORBS shut down on June 5, 2024, and its results no longer mean anything.

## Does a listing cover my subdomains? {#subdomains}

On Spamhaus DBL, **usually yes**. Spamhaus lists domains at the main domain level, for example `example.com`, and every subdomain under it, such as `mail.example.com` or `news.example.com`, then shows as listed too.

There is one exception. When a legitimate website gets hacked and abused, Spamhaus may list only the hacked hostname, so the rest of the domain keeps working.

What this means for you:

- **Sending from a subdomain does not protect your main domain.** If the main domain gets listed, the subdomain goes with it.
- **A listed subdomain usually means the main domain is listed.** Check both, and fix the cause on whichever part of the domain was abused.

## What gets a whole domain listed? {#why-listed}

Spamhaus does not publish its exact criteria, and it re-checks listings all the time. What it does say is that the DBL lists domains with a poor reputation, including domains used in:

- spam, as the sender or as a link in the message
- phishing pages
- malware
- control servers for infected computers

A domain can be listed **without ever sending email**. If your domain appears in links inside other people's spam, or a hacked page on your site hosts phishing, that alone can get it listed. Brand new domains also start with little reputation, so they get less benefit of the doubt.

IP blocklists work on the sending server instead. Common causes are mail hitting spam traps (addresses that exist only to catch senders using bought or scraped lists), many spam complaints, and infected computers sending mail. If you use a shared sending service, the IP is shared with other customers, and its listing is the service's to fix.

## I'm listed. How do I get off? {#get-delisted}

1. **Find and fix the cause first.** Remove bought or old addresses from your list, clean any hacked pages on your website, and change your email passwords if someone may have sent mail through your account. A removal request without a fix usually ends in a new listing.
2. **Request removal on the list's own site.** For Spamhaus, look up your domain or IP in their [reputation checker](https://check.spamhaus.org/) and follow the steps it shows. Once approved, removal is immediate, though some mail servers can take up to 24 hours to see it.
3. **Never pay for removal.** Spamhaus says removal is always free. Anyone charging a fee to delist you is not connected to the list.

Many listings also expire on their own once the problem stops.

## Mail is rejected, but I'm not listed {#not-listed}

Public blocklists are only one reason mail gets refused. Gmail, Outlook and Yahoo also use their own reputation systems, which you can't look up on a public list. Read the bounce message: it usually names the reason.

The most common causes after blocklists:

- **SPF, DKIM or DMARC fails.** The [Domain Checker](/domain) shows which, and the [DNS Generator](/records) builds the records to fix it. If SPF fails with a PermError, see [the 10 DNS lookup limit](/blog/spf-permerror-10-dns-lookups-fix).
- **Too many complaints.** Google asks bulk senders to keep their spam complaint rate below 0.1% and never reach 0.3%.
- **Your login or server is set up wrong.** The free [SMTP Tester](/smtp-test) shows exactly what your mail server answers.

For the full list of reasons mail ends up in spam, see [why emails go to spam](/blog/why-emails-go-to-spam).
