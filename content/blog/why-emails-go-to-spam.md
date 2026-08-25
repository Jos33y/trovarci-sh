---
title: "Why your emails go to spam (and how to find out which reason is yours)"
slug: "why-emails-go-to-spam"
description: "Every guide lists fifteen causes. You have one or two. Four questions that narrow it down, what each answer points to, and the fix for each."
date: "2026-08-28"
author: "Trovarcis Team"
category: "Email Deliverability"
tags: ["spam-filter", "deliverability", "inbox-placement", "authentication", "sender-reputation"]
readingTime: 11
---

Around one in six marketing emails never reaches the inbox, according to Validity's 2025 benchmark. Over 50,000 sends that is more than 8,000 messages nobody sees.

Search for why and you get the same article fifteen times. Authentication, reputation, content, engagement, list hygiene, warm-up. All of it true. None of it useful, because you do not have fifteen problems. You have one or two, and the article will not tell you which.

This is the diagnostic instead. Four questions narrow the cause to one or two candidates, and each answer points at a different fix.

## First, confirm it is actually spam

Three different things get described as "going to spam" and they have three different causes. Getting this wrong means fixing the wrong thing for a week.

**The spam folder.** The message was accepted and filed as junk. The recipient can find it. This is a trust decision about you as a sender.

**The Promotions tab.** Gmail only, and it is not spam. The message reached the inbox and was sorted into a category. Open rates drop 40 to 60% and nobody ever complains, because from the recipient's side nothing went wrong. This is a content and structure decision, not a trust decision, and the fixes are almost entirely different: [Why your emails hit Gmail Promotions and how to move them to Primary](/blog/gmail-promotions-tab-fix).

**Not delivered at all.** The receiving server rejected the message or the connection. Nothing arrives anywhere. This is usually authentication failure, a blacklist listing, or a bounce, and it is the only one of the three that leaves a trace in your sending logs.

Check your logs before anything else. If the message shows as delivered, it is a placement problem. If it shows a rejection or a bounce code, it is a delivery problem, and the rest of this article is the wrong page. Start with [Is your domain blacklisted?](/blog/domain-blacklisted-check-fix) instead.

## Question 1: all recipients, or some?

The single most useful question, and almost nobody asks it.

**All recipients, every provider.** The problem is on your side and it applies to every message equally. That means authentication, a blacklist listing, or domain reputation. Content is not the cause, because content varies between campaigns and this does not.

Check in this order: authentication passing and aligning, then blacklist status, then domain reputation.

**Some recipients, not others.** The problem is per-recipient, which means engagement history. Gmail tracks whether each individual recipient opens, replies, deletes without reading, or has previously marked you as spam. A recipient who once replied to you gets your mail in the inbox almost regardless of what you send. A recipient who has ignored forty messages gets filtered on volume alone.

No content change fixes this for the second group. The fix is list segmentation and sunsetting people who have not engaged in a year.

**One provider only.** Gmail filtering you while Outlook does not, or the reverse, points at that provider's own reputation system rather than anything universal. For Gmail, verify your domain in Google Postmaster Tools and read the four reputation scores. If domain reputation shows low or bad there, that is your answer and nothing else matters until it recovers.

## Question 2: sudden, or always?

**It started recently and used to work.** Something changed. Work backwards through what:

- A new sending service was added, which almost always means SPF was edited and the recursive lookup count may now exceed the RFC limit of 10. This fails as `permerror` while looking correct in a DNS panel: [SPF PermError: the 10 DNS lookup limit](/blog/spf-permerror-10-dns-lookups-fix)
- A DKIM key rotated and the DNS record was never republished. Silent, and one of the most common causes of slow decay
- A list was imported from a new source, and the bounce rate on the first send to it damaged your reputation
- Volume jumped. A domain that sends 200 a day for months and then sends 20,000 looks like a compromised account, because that is what a compromised account looks like
- A DNS migration transcribed records by hand and a selector lost a character

**It has never worked.** The setup was never completed. Go to [How to set up SPF, DKIM, and DMARC](/blog/spf-dkim-dmarc-setup) and do it properly, then come back.

## Question 3: does authentication pass and align?

Not "is it configured." Does it pass, and does it align.

Send a message from your production sender to a personal Gmail account. Open it, choose Show original, and read the top block. You want three passes:

```
SPF:   PASS with IP 203.0.113.42
DKIM:  'PASS' with domain yourdomain.com
DMARC: 'PASS'
```

The trap: SPF and DKIM can both pass while DMARC fails. Alignment is a separate requirement. The domain that authenticated has to match the domain in the visible `From:` header. A marketing platform that uses its own return-path domain passes SPF for itself, not for you, and DMARC fails even though two lines say PASS.

This is the most common silent failure in the whole stack, and it looks fine in every DNS checker.

Test from every sender you use, not one. Your transactional provider, your marketing platform, and anything sending direct SMTP are three separate configurations and any one of them can be the broken one.

For the full audit including blacklist status, mail server configuration, and transport security, the [Domain Checker](/domain) runs 25 tests in about ten seconds with no account. What each result means: [Email domain health check: the 25 tests that matter](/blog/email-domain-health-check).

## Question 4: is it the list, or the message?

If authentication passes and aligns, the domain is clean, and the problem hits all recipients, the remaining candidates are your list and your content. These are separable.

**The list is the cause if:** bounce rate is above 2%, complaint rate is above 0.1%, the list was bought or scraped or inherited, or it has not been cleaned in six months. Address data decays around 22% a year, so a list nobody has touched in a year is carrying meaningful dead weight, and every hard bounce is a signal that you do not know who is on your list. Fix: [How to clean an email list before sending](/blog/clean-email-list-before-sending).

**The message is the cause if:** bounce and complaint rates are normal, the domain is clean, and specific campaigns land badly while others do not. That last detail is the tell. If your receipts arrive and your newsletter does not, the difference is the message, not the sender.

## What actually triggers a content flag

Not the words. This is worth being blunt about, because "avoid spam trigger words like free and discount" appears in almost every article on this topic and it has been wrong for about a decade.

Gmail's classifier is a machine learning model trained on billions of messages. It does not consult a keyword blocklist. The word "free" in a normal sentence to an engaged recipient lands in the inbox. A template-heavy HTML message to a cold list lands in spam whether or not it contains the word. Context is the signal.

What the classifiers actually weigh:

- **HTML weight and image-to-text ratio.** 60KB of styled HTML with 200 characters of text reads as a template. Human-typed messages carry roughly balanced weight after boilerplate
- **Link count and link type.** More than three or four outbound links per 500 words trips the campaign signal. Click wrappers, redirector domains, and shortened links carry extra weight, and generic URL shorteners are heavily associated with spam
- **The missing plain-text alternative.** HTML-only multipart messages are a bulk-sender signal
- **Header structure.** A missing `List-Unsubscribe` on a bulk send is a stronger negative than most senders realize. Above 100 recipients you want both that and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, which gives Gmail a native unsubscribe button so people use it instead of the spam button
- **The From address.** A no-reply sender is a mild negative on its own and a large one in combination with the above, because it signals a broadcast nobody expects a response to
- **Subject-line patterns stacked together.** One percent sign is nothing. A percent sign plus all-caps plus an emoji cluster plus a question and exclamation combination is a pattern

Analyzing a message against all of this by hand takes about twenty minutes and you have to know what to look for. Paste the actual message into the [Email Scorer](/score) instead and it grades content, structure, and authentication signals together, then returns the specific factors dragging placement rather than a number.

Score the real message, not a template you plan to edit later. New accounts get 10 free credits, one score costs one credit, and no card is required. Ten runs is enough to test a subject line variant, compare a plain-text version against the HTML, and confirm the fix before the campaign goes out.

## The causes ranked by how often they are the cause

From diagnosing this repeatedly, in rough order:

1. **Authentication failing or failing to align.** Most common, most invisible, and the one people are most confident they have already handled
2. **List quality.** Bounces and complaints from a list that was bought, inherited, or left uncleaned
3. **Engagement history.** Sending to people who stopped opening a year ago and never removing them
4. **Volume shape.** A spike, a long gap followed by a big send, or a cold domain sending at scale
5. **Content and structure.** Real, and lower on this list than any content-focused article will tell you
6. **Blacklist listing.** Less common than feared, and the most dramatic when it happens

Notice that four of the six are decided before you write a word.

## The loop that keeps it fixed

Deliverability is not a setup task. Every provider change, every list import, every campaign moves it. Run this before any significant send:

1. **Domain.** [Domain Checker](/domain), free, no account. Authentication, blacklists, mail server, transport security
2. **List.** [Email Verifier](/verify) on the segment you are actually sending to, not the master file
3. **Message.** [Email Scorer](/score) on the real content
4. **Test send.** To a personal Gmail address. Show original. Confirm three passes. Confirm where it landed

Four checks, a few minutes, and they catch the causes in the order those causes actually occur.

## Where to start

1. **Answer question 1 first.** All recipients or some. It eliminates half the possible causes in one step
2. **Check authentication passes and aligns** from every sender you use, via Show original on a real message
3. **Run the [Domain Checker](/domain)** for the full picture including blacklists
4. **Only then look at content**, and score the real message with the [Email Scorer](/score) rather than guessing at it

If everything above is clean and you are still landing badly, the remaining causes are reputation and engagement, which take weeks rather than minutes: [the complete guide to email deliverability in 2026](/blog/email-deliverability-guide-2026) covers what to do about both.
