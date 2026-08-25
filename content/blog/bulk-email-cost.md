---
title: "What bulk email really costs (and why you pay for contacts you never email)"
slug: "bulk-email-cost"
description: "Four pricing models, real 2026 numbers at three list sizes, and the three-year totals nobody publishes. Plus the one lever that cuts the bill on every model."
date: "2026-08-29"
author: "Trovarcis Team"
category: "Email Marketing"
tags: ["pricing", "email-marketing", "bulk-email", "cost-comparison", "list-hygiene"]
readingTime: 12
---

Sending 100,000 emails a month costs somewhere between about $10 and about $700, depending entirely on which pricing model you happen to be on. Same messages, same recipients, same result in the inbox. Seventy times the price.

That spread exists because the four dominant pricing models in email are not variations on a theme. They meter completely different things, and the one that is cheapest for your sending pattern can be the most expensive for someone with a list the same size as yours.

Almost every comparison of this online is published by a company selling one of the options. This is the arithmetic without that.

*Figures below verified August 2026. Vendor pricing changes often, so confirm before buying.*

## The four models

**Per contact.** You pay for the size of your list, not for what you send. Mailchimp, ActiveCampaign, MailerLite, Klaviyo, Constant Contact. Send once a month or twenty times, the bill is identical. Add a contact who never opens anything and the bill goes up.

**Per email sent.** You pay for volume. Brevo is the main one. A large list you mail rarely is cheap. A small list you mail daily gets expensive fast.

**Per message infrastructure.** Raw sending APIs and SMTP relays: Amazon SES, Resend, Postmark, Mailgun, SendGrid. Cheapest per unit by a wide margin, priced in fractions of a cent. You get no campaign builder, no list management, no templates, and no reporting beyond delivery events. You are buying pipe, not a platform.

**Software you own.** A one-time license for an application that runs on your machine and sends through SMTP credentials you already have. No subscription and no per-message charge, because the vendor is not in the sending path. You supply the sending accounts and you carry the deliverability responsibility yourself.

Most people never compare across models. They compare Mailchimp to ActiveCampaign, which are the same model, and never ask whether the model is right.

## Real numbers, three list sizes

### 5,000 contacts, four sends a month

| Option | Monthly |
|---|---|
| Mailchimp Standard | ~$100 |
| MailerLite | ~$39 |
| ActiveCampaign Starter | ~$60 to $80 |
| Brevo (20,000 emails) | ~$19 |
| Amazon SES (20,000 emails) | ~$2 |

### 10,000 contacts, four sends a month

| Option | Monthly |
|---|---|
| Mailchimp Standard | ~$100 to $110 |
| ActiveCampaign Starter | ~$149 |
| Brevo (40,000 emails) | ~$29 to $69 |
| Amazon SES (40,000 emails) | ~$4 |

### 100,000 contacts, one send a month

| Option | Monthly |
|---|---|
| Mailchimp Standard | ~$700 |
| Brevo (100,000 emails) | ~$69 |
| Amazon SES (100,000 emails) | ~$10 |

The third table is where the model choice stops being a rounding error. Mailchimp charges $700 a month to hold 100,000 contacts whether you email them once or never. Brevo charges $69 to send to all of them. The gap is not a discount or a promotion. It is two companies metering two different things.

## Three-year totals

Monthly numbers hide the decision. Nobody publishes three-year totals because the comparison is uncomfortable for whoever is publishing.

At 100,000 contacts sending monthly:

| Option | 36 months |
|---|---|
| Mailchimp Standard | ~$25,200 |
| Brevo | ~$2,484 |
| Amazon SES | ~$360 |
| Owned software plus your own SMTP | one-time license plus SMTP costs |

Those are the same 3.6 million messages.

The right conclusion is not that Mailchimp is a ripoff. It is that you are paying roughly $24,800 over three years for a campaign builder, automation workflows, ecommerce integrations, template management, and support. If you use all of that and it drives revenue, it is defensible. If you send a plain newsletter to a list you exported from somewhere else, you are paying for a suite to use one feature of it.

## Where the money quietly leaks

Four traps, ranked by how much they cost people who do not know about them.

**You are billed for unsubscribed contacts.** On some contact-based platforms, unsubscribed and inactive contacts stay in your billable count until you manually archive them. A 10,000-contact list where 30% have unsubscribed still bills at the 10,000 tier. Estimates put the inflation at 10 to 20% of a typical bill, paid indefinitely, for people who have explicitly asked you to stop emailing them.

**Tier boundaries, not sliding scales.** Contact pricing moves in steps. Crossing from 9,999 to 10,001 contacts can move you a full tier for two addresses. Worth knowing where your next boundary sits before an import pushes you over it.

**Send allowances tied to contact tiers.** Several platforms cap monthly sends at a multiple of your contact tier, commonly around ten times. At 10,000 contacts that is 100,000 sends, which sounds generous until you run a weekly newsletter plus automations and a re-engagement sequence. Past the cap you pay overage or move up a tier.

**Annual billing as a lock.** The 20 to 25% annual discount is real and it removes your ability to leave when your list shape changes. Take it once you know your pattern, not while you are still learning it.

## The lever that works on every model

Here is the part that applies whichever model you are on, and it is the one nobody selling you a plan wants to lead with.

**Your list size is your bill.**

On per-contact pricing that is literal. Every dead address is a line item every month, forever, until someone removes it. A 10,000-contact list carrying 25% invalid addresses is 2,500 contacts you pay for and never reach. Clean it to 7,500 and on most platforms you drop a pricing tier, which is a permanent monthly saving from a one-time action.

On per-send pricing it is equally literal. Every message to an address that does not exist is a message you paid to send into nothing.

On infrastructure pricing the unit cost is low enough that the waste barely registers, but the reputation damage does. A bounce rate above 2% degrades inbox placement for the addresses that were fine, and that costs more than the sends did.

The arithmetic is unusually clean. Verifying 10,000 addresses is a one-time cost of a few tens of dollars. If it drops you one Mailchimp tier, it pays for itself in the first month and keeps paying every month after. If it does not drop you a tier, it still removes the bounces that were suppressing delivery to everyone else.

Run the list you are actually paying for through the [Email Verifier](/verify) and see the category breakdown before your next billing date. New accounts get 10 free credits, one credit checks one address, and no card is required to sign up. Addresses that cost nothing to determine are refunded rather than billed, so a badly decayed list is cheaper to clean than a healthy one.

The full process, including what to do with results that come back neither valid nor invalid: [How to clean an email list before sending](/blog/clean-email-list-before-sending).

## Which model fits which sender

Match the model to the shape of your sending, not to the brand you have heard of.

**Large list, infrequent sends.** An association, an alumni body, a customer base you contact quarterly, a church or school announcement list. Per-send pricing wins decisively. Paying monthly to hold 50,000 contacts you email four times a year is the most expensive way to do the least sending.

**Small list, frequent sends.** A weekly newsletter under a few thousand subscribers. Per-contact pricing wins, and the free tiers may cover you entirely.

**Ecommerce with behavioral automation.** Abandoned cart, post-purchase sequences, product recommendations tied to a store. The suite is doing real work and the per-contact price buys something. Stay on it.

**Plain campaigns to a list you already own.** No automation, no store integration, no template library needed. This is where people overpay most, because they bought a marketing suite to use its send button. Infrastructure pricing or owned software costs a fraction of it.

**Cold outreach.** None of the mainstream platforms want this traffic and most will suspend you for it. Their terms exist because your list quality becomes their reputation problem. If this is your use case you need infrastructure you control, and every safeguard becomes yours to run: [How to send bulk email without getting blacklisted](/blog/send-bulk-email-without-blacklist).

## What you actually own

One difference that does not show up in any pricing table, and shows up sharply the day you want to leave.

On a subscription, your list, your templates, your automation logic, and your sending history live inside someone else's product. Stop paying and access stops. Export is usually possible and usually incomplete, since segments, automation state, and engagement history rarely travel.

With infrastructure or owned software, the list is a file on your machine and the sending accounts are yours. The reputation you build attaches to your domain rather than to a shared pool. Nobody else's list can damage your delivery, and no one can suspend you for a campaign that was fine.

The tradeoff is real and worth stating plainly. When you own the infrastructure, every safeguard is yours. Nothing catches a bad list before it reaches a receiver. The volume ramp, the pacing, the list hygiene, and the authentication all become your responsibility, and the platform charging you $700 a month was doing some of that work quietly.

That is the actual decision, and it is not really about price. It is about whether you would rather rent a system that protects you from your own mistakes, or own one that does exactly what you tell it.

## Before you switch anything

Changing pricing model does not help if the underlying setup is broken. Two checks first, both free:

1. **The sending domain.** Authentication passing and aligning, no blacklist listing, mail server configured correctly. The [Domain Checker](/domain) runs 25 tests in about ten seconds with no account. What each result means: [Email domain health check](/blog/email-domain-health-check).
2. **The list.** Size it honestly before you price it. Paying per contact for addresses that bounce is the most expensive line on any plan.

Then price the model against your actual pattern: your list size, your real send frequency, and which platform features you use rather than which you were sold.

If your current problem is delivery rather than cost, the model is not the issue: [Why your emails go to spam](/blog/why-emails-go-to-spam) narrows it to a cause in four questions.
