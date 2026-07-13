---
title: "Why your emails hit Gmail Promotions (and how to move them to Primary)"
slug: "gmail-promotions-tab-fix"
description: "Gmail's Promotions tab crushes your open rate. Here's what triggers it, how to check your emails against every factor, and the fix that actually works."
date: "2026-07-11"
author: "Trovarcis Team"
category: "Email Deliverability"
tags: ["gmail", "deliverability", "cold-outreach", "promotions-tab"]
readingTime: 9
---

Gmail's Promotions tab is not the spam folder. It's worse. Spam gets filtered, so at least you know the message failed. Promotions gets ignored. Your reply rate drops 40 to 60 percent versus Primary, and no user ever complains, because from their side, everything works. The message arrived. They just never saw it.

The decision is per-recipient, algorithmic, and slower to react than spam classification. Gmail's spam filter runs on receipt. The Primary-vs-Promotions call runs continuously against a rolling model of that recipient's engagement history, your domain reputation, and the shape of the message itself. Fix the wrong signal and nothing changes. Fix the right one and delivery shifts within days.

Below: what Gmail actually looks at, how to figure out which signal is killing your specific email, and the five fixes that move the needle. Skip the "don't use the word FREE" advice. Gmail hasn't cared about keyword lists in a decade.

## How Gmail decides where your email lands

Every message routed to Gmail runs through classifiers that score four independent factor groups. No single factor sends you to Promotions. The composite score does.

### Content signals

Gmail's content classifier reads the raw HTML, the plain-text alternative, the subject line, and the pre-header. It flags:

- **Subject-line patterns.** Percent signs, currency symbols, all-caps runs longer than three words, question-mark-plus-exclamation combinations, emoji clusters. These correlate with promotional intent in Gmail's training data. One or two are fine. Stacked, they push the score.
- **HTML-to-text ratio.** A message with 60KB of styled HTML and 200 characters of plain text reads as a template. Human-typed messages carry roughly 1:1 HTML-to-text weight after boilerplate.
- **Image density.** More than one image per 200 words of copy, or a single hero image over 600px wide, signals a marketing template.
- **Link density.** More than three outbound links per 500 words trips the "campaign" signal. Tracked links (utm parameters, click wrappers, redirector domains) carry extra weight.
- **Promotional vocabulary.** Not keywords in isolation. Combinations. "Limited time" plus "shop now" plus a discount code in the pre-header trains as a promo template regardless of what the individual words look like.

### Sender signals

- **Authentication.** SPF, DKIM, and DMARC must all pass AND align. Failure alone won't send you to Promotions, but misalignment removes any margin the other signals would have given you.
- **Sending IP reputation.** Shared IPs on transactional providers carry the reputation of every sender using them. This is one reason cold outreach through SendGrid or Mailgun often lands in Promotions even with clean content.
- **Domain age and volume ramp.** A domain that starts sending 5,000 emails a day from cold gets sorted as bulk. Warm domains that grew from 10 to 5,000 over months land in Primary.

### Engagement signals

Per-recipient history is the single strongest signal. Gmail tracks: does this recipient open your emails, reply, star, forward, or move to Primary? Or do they delete without opening, mark as read without opening, or "move to Promotions"?

A recipient who once replied to you gets your future messages in Primary almost regardless of content. A recipient who never opens you gets sorted into Promotions on volume alone. This is why cold outreach with zero prior engagement is a hard problem no content fix fully solves.

### Structural signals

The technical shape of the message header stack. Gmail looks for `List-Unsubscribe` (RFC 8058 one-click), `Precedence: bulk`, `Feedback-ID`, and `X-Mailer` values that identify bulk sending platforms. Missing `List-Unsubscribe` on a bulk send is a stronger negative signal than most senders realize.

## Fix the right signal, not all of them

Most articles on this topic list 10 or 20 generic tips. That advice fails because it doesn't map to your specific message. Your subject line might be clean but your HTML weight is triple the threshold. Or your content is fine but authentication is misaligned. Or your engagement history with the recipient is dead and no content change will save it.

The right approach: analyze the specific email that's failing before changing anything. Grade it against every signal above. Identify the two or three factors dragging the score down. Fix those. Ignore the rest.

Doing this by hand is possible but slow. You'd need to run HTML weight analyzers, check the subject against promotional-pattern regex, verify authentication headers, and inventory the header stack. Twenty minutes per email before you've made any change.

Paste your subject line and body into the [Email Scorer](/score). It runs content, structural, and authentication checks against a scoring model trained on the signals above plus common failure patterns. Output is a numeric grade plus the specific factors dragging it down, with concrete recommendations tied to each factor.

New Trovarcis accounts get 10 free credits on signup. One score costs one credit. Ten free scores is enough to iterate through subject line variants, test a plain-text version against your HTML version, and confirm the fix before you send to your list. No card required to sign up.

Once you know which signals are hurting your specific message, the fix list narrows from "20 things you might do" to "these two things you must do." That's the entire point of running the diagnostic first.

## The five fixes that actually move the needle

Not a comprehensive list. Five changes that consistently move messages from Promotions to Primary across the diagnostic cases we see.

### Fix 1: Subject line surgery

Remove every symbol that isn't a letter, digit, or space. No percent signs, no currency prefixes, no emoji, no square brackets, no question-plus-exclamation stacks. Keep the subject under 50 characters. Match the tone of a one-to-one email, not a campaign.

Before:
```
🚨 Last Chance: 50% OFF Everything Ends Tonight
```

After:
```
Quick question about your Q3 roadmap
```

The second reads to Gmail's classifier as a person-to-person message. The first reads as bulk promo template. Same sender, same authentication, same list, different tab.

### Fix 2: HTML weight reduction

The threshold: keep the rendered HTML under 100KB, use fewer than 15 images, keep image bytes under 500KB combined. Every message should include a plain-text alternative that is not just the HTML stripped of tags but a genuinely readable text version.

The image-to-text ratio matters more than absolute image count. A 1500-word article with 5 images reads as content. A 200-word teaser with 3 images and a hero banner reads as marketing.

If your ESP forces heavy templates, ship the plain-text version as the primary and drop the HTML entirely for cold outreach. Reply rates on plain-text cold email are usually higher than HTML equivalents anyway.

### Fix 3: List-Unsubscribe header setup

For any send above 100 recipients, both these headers must be present:

```
List-Unsubscribe: <mailto:unsubscribe@yourdomain.com>, <https://yourdomain.com/unsub?id=abc>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

The `List-Unsubscribe-Post` header (RFC 8058) tells Gmail your unsubscribe endpoint accepts a one-click POST. Gmail then shows the native "Unsubscribe" button next to the sender name. Recipients who would have hit spam use that button instead. That protects your domain reputation and improves the composite score for future sends.

Missing this on a bulk send is treated as a bulk-sender red flag by Gmail's February 2024 sender requirements. It's not optional above 5,000 daily to Gmail addresses.

### Fix 4: Authentication baseline

SPF, DKIM, and DMARC must all pass AND align. Alignment means the domain in the `From:` header matches (or is a subdomain of) the domain used for SPF and DKIM signing.

Quick check via Gmail's "Show original" on any received message:

```
SPF:   PASS with IP 203.0.113.42
DKIM:  'PASS' with domain yourdomain.com
DMARC: 'PASS'
```

All three must say PASS. If SPF says PERMERROR or SOFTFAIL, no content fix will save you. That specific case, where SPF fails because your record exceeds the 10 DNS lookup limit, is the topic of a companion piece: the [SPF PermError fix guide](/blog/spf-permerror-10-dns-lookups-fix).

### Fix 5: Engagement warm-up

A new domain sending 5,000 cold emails on day one gets sorted as bulk. A domain that ramped from 50 warm messages a day to 5,000 over eight weeks lands in Primary.

Warm-up in practice: start with recipients most likely to engage (existing customers, replied-to conversations, opted-in newsletter subscribers). Send 50 to 100 a day for two weeks. Increase 20 percent weekly. Only add cold prospects after week 4.

Automated warm-up services (Mailwarm, Instantly Warmup, Warmup Inbox) simulate engagement by sending between mailboxes on their network. They help but they don't replace real recipient engagement. Genuine replies from real customers are worth 100x automated warm-up opens.

## What NOT to do

Four pieces of advice you'll find on the top-10 SERP pages that don't work:

- **"Ask subscribers to whitelist you."** Doesn't scale. Fewer than 2 percent of recipients follow the instruction. The 98 percent who ignore it still train the classifier against you. Whitelist behavior also varies by client and doesn't override Gmail's tab sorting anyway.
- **"Tell recipients to disable the Promotions tab."** The Promotions tab is a recipient-side setting. Disabling it means everything lands in one inbox for that user. It doesn't change how Gmail classifies your messages, it just changes how one recipient views them.
- **"Have recipients drag your email to Primary."** The "move to Primary" action does train Gmail's per-recipient model. But it's per-recipient. Getting 50 people to do it doesn't help the other 5,000. Useful for one-to-one relationship recovery. Useless for list-wide fixes.
- **"Avoid these 500 spam words."** Gmail's Promotions classifier is a machine learning model trained on billions of messages. It doesn't consult a keyword blocklist. The word "free" in a natural sentence to an engaged recipient lands in Primary. The word "offer" in a template-heavy HTML to a cold list lands in Promotions. Context is the signal, not the word.

## Verify the fix

Content and header fixes only work if your domain authentication is clean. A subject line rewrite that still lands in Promotions because DMARC is failing wastes the fix.

Run your domain through the [Domain Checker](/domain) before and after any content change. The tool runs 25+ checks across SPF syntax and alignment, DKIM selector presence, DMARC policy and reporting, mail server configuration, SSL/TLS on the mail server, and blacklist status across 15+ RBLs.

The output tells you which specific authentication or reputation factor is failing, if any. Fix those first. Then the content changes above will actually stick.

The Domain Checker is free and requires no signup. Paste a domain, wait 10 seconds, read the report. Green across the board means content changes will show measurable improvement in Gmail placement within 3 to 7 days. Red on SPF alignment or DMARC policy means fix the authentication first, then revisit the content.

After the domain shows green, send a test message to a personal Gmail account. View "Show original." Confirm SPF, DKIM, and DMARC all pass. Confirm the message landed in Primary rather than Promotions in the target inbox. Then send to your list.

## Where to start

Three actions in order:

1. Run one of your failing emails through the [Email Scorer](/score). Identify the two or three signals dragging it into Promotions.
2. Fix those specific signals using the five techniques above. Don't fix what isn't broken.
3. Verify domain authentication with the [Domain Checker](/domain). Send a test. Check the headers. Ship.

If SPF is now failing after you added a new sending service (SendGrid, Mailchimp, a marketing platform), the root cause is almost certainly the 10 DNS lookup limit. Read the [SPF PermError fix guide](/blog/spf-permerror-10-dns-lookups-fix) for the diagnostic and the three fixes ranked by preference.
