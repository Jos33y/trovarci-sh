---
title: "How to clean an email list before sending (and what to do with the results)"
slug: "clean-email-list-before-sending"
description: "What list cleaning actually removes, what every verifier gets wrong about catch-all addresses, and how to decide what to send to once the results come back."
date: "2026-08-26"
author: "Trovarcis Team"
category: "Email Deliverability"
tags: ["email-verification", "list-hygiene", "catch-all", "bounce-rate", "deliverability"]
readingTime: 11
---

Cleaning an email list means removing addresses that will bounce, complain, or damage your sender reputation before you send to them. Run every address through verification, drop the invalid ones, segment the ambiguous ones, and suppress anyone who has not engaged in a year.

The first three steps are mechanical. The fourth is judgment. And the part almost nobody explains properly is what to do with the results that come back neither valid nor invalid, which on a business list is often a fifth of the file.

This covers when cleaning is worth doing, what verification can actually determine, what it cannot, and how to decide what to send to once you have the report.

## When your list needs cleaning

Any one of these means clean before your next send:

- **You have not cleaned in six months.** Address data decays at roughly 22% a year, so a six-month-old list already carries around 11% dead weight. Nothing about the list changed. People left jobs and closed accounts.
- **Bounce rate above 2%.** Gmail treated 5% as the warning line a few years ago. The working threshold now sits closer to 2 or 3%, and inbox placement starts dropping within days of crossing it.
- **Complaint rate above 0.1%.** Google's published limit is 0.3%, but throttling starts well before that.
- **You imported a list from anywhere.** A purchased list, a scraped list, an event badge scan, a spreadsheet inherited from someone who left. New sources are the most common cause of sudden bounce spikes.
- **Replies asking who you are.** A clear signal the list contains people who no longer recognize you, or never did.

If none of those apply and you mail a list you built yourself every month, cleaning is maintenance rather than rescue. Quarterly is enough.

## What verification actually removes

Verification connects to the receiving mail server and asks whether an address exists, without sending anything. It reliably identifies four categories.

**Syntax failures.** Malformed addresses, missing an `@`, illegal characters, trailing spaces from a spreadsheet paste. Free to detect, since it needs no network call.

**Dead domains.** The domain no longer resolves or publishes no MX record. No mailbox can exist there. Also determinable without contacting anyone.

**Invalid mailboxes.** The domain accepts mail and rejects this specific address. This is the core of verification and the source of most of the value, because every one of these would have been a hard bounce.

**Disposable domains.** Temporary inbox providers used to grab a lead magnet without giving a real address. Deliverable today, gone next week.

It also flags **role addresses** like `info@`, `support@`, `admin@`, and `sales@`. These are usually valid and usually deliverable. They are also read by whoever happens to be on rotation, and they generate complaints at several times the rate of personal addresses. Valid is not the same as worth sending to.

## What verification cannot determine, and why every vendor pretends otherwise

Some domains are configured to accept mail addressed to anything. `realperson@company.com` and `nonsense123@company.com` both get a `250 OK` at the protocol level. These are catch-all domains, also called accept-all.

Standard SMTP verification cannot tell you whether a specific mailbox on a catch-all domain exists, because the server answers yes to every question you ask it. This is not a limitation of any particular tool. It is the protocol working as designed.

Which is worth sitting with for a moment, because the market around this fact is strange.

Ask how common catch-all domains are and you get answers ranging from 12 to 15% of business domains, to about 30%, to 40% of B2B lists, depending entirely on which vendor is publishing. Each figure conveniently supports the size of the problem that vendor sells a solution to. The honest answer is that it varies enormously by industry and company size, that mid-market and enterprise domains use it far more than small businesses, and that you should measure it on your own list rather than trusting anyone's headline number.

Then there is the second layer. Several vendors sell proprietary systems that claim to resolve catch-all addresses: AI scoring, activity detection, thirty-plus signal models. These are inference, not verification. They are guessing well, from engagement signals and pattern data, and a good guess has real value. But a guess presented as a verdict is how a list gets sent to with false confidence, and catch-all addresses carry meaningfully higher bounce rates than confirmed ones.

The one method that genuinely resolves a catch-all is sending an actual message and watching what happens. Some services do exactly this, dispatching a blank email and reporting back within a day or two. It works because it stops being verification and becomes a send. That is a real tradeoff, not a free lunch: you are mailing an address you could not confirm in order to find out whether you can mail it.

**What this means for your list.** Treat catch-all as a flag, not a verdict. Anyone who tells you they verified a catch-all address with certainty and without sending anything is selling you a probability with the uncertainty removed from the label.

At Trovarcis, addresses that come back catch-all or unknown are refunded rather than charged, because charging you for a result that says "we could not determine this" is not a service. You get the flag and you get your credit back.

## What to do with each result

Verification gives you categories. The decision about what to send to is yours, and it should not be the same decision for every category.

| Result | Action |
|---|---|
| Valid | Send |
| Invalid | Remove permanently, add to suppression |
| Syntax failure | Remove, or fix if the typo is obvious |
| No MX on domain | Remove permanently |
| Disposable | Remove |
| Role address | Segment separately, send at lower frequency, or drop |
| Catch-all or unknown | Segment separately, send in small batches, drop non-responders |

The catch-all row is the one that costs money to get wrong in both directions. Send to all of them and you inherit their bounce risk on your main campaign. Drop all of them and you may be cutting a large share of your addressable market, since catch-all configuration is most common at exactly the mid-market and enterprise companies worth selling to.

The middle path works and takes patience. Pull catch-all addresses into their own segment. Send to a few hundred at a time, well after your main send so a bad batch cannot poison the campaign. Watch bounce rate on that segment specifically. Anyone who does not engage across two touches comes out. Over a few campaigns the segment either proves itself or shrinks to nothing, and either outcome is information you did not have before.

## What cleaning costs against what it saves

Worth doing the arithmetic before assuming verification is an expense.

A 10,000-address list that has not been touched in a year will typically carry 15 to 25% dead addresses. Send to it unverified and you post a bounce rate several times the threshold that triggers throttling. The cost of that is not the wasted sends. It is a damaged sender reputation that takes weeks to rebuild and suppresses delivery to the 8,000 addresses that were fine.

The cost of verifying it is a fraction of a cent per address, and addresses that cost nothing to determine, meaning syntax failures, dead domains, and results the tool cannot resolve, are refunded rather than billed. On a badly decayed list that refund is substantial, because a bad list contains more free-to-determine addresses than a good one. The worse your list, the cheaper it is to clean.

**One practical note if your list is small.** Most verification services carry a minimum purchase, commonly in the range of $30 to $50, which means somebody with 400 addresses to check cannot buy from them at all. Trovarcis starts at $5 with no minimum and no subscription, because a 400-address list is a real list and its owner is not less deserving of a clean file than someone with 400,000.

Run yours through the [Email Verifier](/verify). New accounts get 10 free credits, one credit checks one address, and no card is required to sign up. Ten credits is enough to sample your worst segment and see the category breakdown before you commit anything.

## How often, and when

Frequency scales with volume and with how fast the list grows:

- **Monthly** above 100,000 addresses, or any list growing quickly from new sources
- **Quarterly** between 10,000 and 100,000
- **Twice a year** under 10,000 with steady, self-collected growth
- **Always** before the first send to any list you imported, bought, inherited, or collected at an event

The rule that overrides the schedule: verify immediately before a campaign, not on a calendar. A list cleaned in March and sent to in September is a list with six months of decay in it. The verification has an expiry date and it is shorter than most people assume.

## Cleaning is one of three things, not the whole job

A clean list gets your mail accepted. It does not decide where it lands.

Two other layers matter and neither is visible in a verification report:

**The sending domain.** If SPF, DKIM, or DMARC fail or fail to align, or the domain is on a blacklist, a perfectly clean list still underperforms. Check it before the send with the [Domain Checker](/domain), which is free and needs no account. What each result means: [Email domain health check: the 25 tests that matter](/blog/email-domain-health-check).

**The message.** Content and header structure decide Primary versus Promotions, and a clean list has no influence on that classifier. Run the actual message through the [Email Scorer](/score) before the campaign. The signal breakdown: [Why your emails hit Gmail Promotions and how to move them to Primary](/blog/gmail-promotions-tab-fix).

For how these fit together into a send that does not get you listed, including spam traps and the volume ramp: [How to send bulk email without getting blacklisted](/blog/send-bulk-email-without-blacklist).

## Where to start

1. **Verify the list you are actually sending to this week.** Not the master file, not the one cleaned last quarter. Run it through the [Email Verifier](/verify) and read the category breakdown before deciding anything.
2. **Split the results properly.** Valid sends. Invalid and disposable go to suppression permanently. Role addresses and catch-all get their own segments with their own rules.
3. **Check the domain in the same session** with the [Domain Checker](/domain). A clean list sent from a broken domain is wasted work in both directions.

If your bounce rate is already high and you want the diagnosis before the fix, [the complete guide to email deliverability in 2026](/blog/email-deliverability-guide-2026) covers reputation, thresholds, and what each mailbox provider enforces.
