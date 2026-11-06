---
title: "Gmail Promotions tab: why emails go there and how to move them"
slug: "gmail-promotions-tab-fix"
description: "Why Gmail puts emails in Promotions, how to move one to Primary for good, how to turn the tabs off, and what to do if your own emails land there."
date: "2026-07-11"
updated: "2026-11-06"
author: "trovarcis-team"
category: "Email Deliverability"
tags: ["gmail", "promotions-tab", "inbox", "deliverability"]
readingTime: 4
---

Gmail sorts your inbox into tabs on its own. Promotions is where it puts mail that looks like marketing: offers, newsletters, store emails. Nothing in Promotions is spam, and nothing there is lost. You can move any email out of it, and Gmail learns from that.

<nav class="picker" aria-labelledby="picker-title">
<p class="picker-title" id="picker-title">What do you see?</p>
<ul>
<li><a href="#promotions-is-full"><strong>Promotions has more mail than Primary</strong><span>Why it fills up, and the newer "most relevant" sorting.</span></a></li>
<li><a href="#move-to-primary"><strong>An email I want keeps going to Promotions</strong><span>Move it once, or make it stay in Primary.</span></a></li>
<li><a href="#turn-off-tabs"><strong>I don't want tabs at all</strong><span>Turn them off on a computer or in the app.</span></a></li>
<li><a href="#other-labels"><strong>Labels like "Flagged by Guardio"</strong><span>Those come from an app, not from Gmail.</span></a></li>
<li><a href="#for-senders"><strong>My own emails land in Promotions</strong><span>For people sending the email, not reading it.</span></a></li>
</ul>
</nav>

## How Gmail decides which tab {#how-gmail-decides}

Gmail has five tabs: Primary, Social, Promotions, Updates and Forums. You can choose which ones to show, but you can't create your own. Primary holds mail from people you know and anything that doesn't fit the other tabs.

Gmail doesn't publish its exact rules. It looks at the email itself and at how you treat mail from that sender. Every time you move an email to another tab, Gmail adjusts how it sorts mail for you.

## Promotions has more mail than Primary {#promotions-is-full}

For most people, marketing email is most of the email they get. Every store, app and newsletter you ever gave your address to sends to it, often several times a week. People you actually talk to send far less. So Promotions grows faster than Primary, and its unread count keeps climbing because nobody opens most of it.

Gmail also changed the Promotions tab in September 2025. On the mobile app, for personal accounts, Promotions can be sorted by **most relevant** instead of newest first, and it can show cards with deals that are about to expire at the top. If you prefer the old order, Gmail lets you switch the sorting back to **most recent**.

To cut it down for good, unsubscribe from senders you never read. Gmail shows an Unsubscribe link next to the sender name on most marketing emails.

## An email I want keeps going to Promotions {#move-to-primary}

**On a computer:** drag the email from the Promotions tab onto the Primary tab. Gmail usually asks whether to do the same for future messages from that sender. Click **Yes**.

**In the Gmail app:** open the email, tap the three dots at the top, choose **Move to**, then pick **Primary**.

If mail from that sender still lands in Promotions, make a filter. It works every time:

1. In Gmail on a computer, click the search options icon at the right end of the search bar.
2. Type the sender's address in **From**, then click **Create filter**.
3. Tick **Categorize as**, choose **Primary**, then click **Create filter**.

## I don't want tabs at all {#turn-off-tabs}

**On a computer:** click the gear icon at the top right. Under **Inbox type**, choose **Default** and click **Customize**. Untick the tabs you don't want and click **Save**. To get rid of tabs completely, pick a different inbox type, such as **Important first** or **Unread first**.

**In the Android app:** tap the menu (three lines), go to **Settings**, tap your account, then **Inbox categories**, and untick the tabs you don't want. The iPhone app has the same setting, with switches instead of tick boxes.

Mail from hidden tabs goes to your main inbox. Nothing is deleted.

## Labels like "Flagged by Guardio" {#other-labels}

Gmail only makes the five tabs above. A label such as **Flagged by Guardio** comes from Guardio, a security app you or someone on your device connected to your Gmail. Its Email Protection files scam emails and repeat marketing it considers unwanted into that label, and adds its own warning to scam emails.

If you didn't expect it, look in Guardio's settings under **Connections**. You can also see every app with access to your Gmail in your Google Account, under **Security**, and remove the ones you don't want.

## My own emails land in Promotions {#for-senders}

If you send email and it lands in your readers' Promotions tab, it was still delivered. The reader can find it, and it is not spam. Promotions is a sorting decision, and Gmail makes it per reader.

Gmail doesn't publish what tips an email into Promotions. What tends to matter is whether the email looks like a campaign or like a message from a person:

- Heavy designed layouts, large images and many links read as marketing. A short message with plain text and one link reads like a person wrote it.
- Sales wording in the subject line and the first lines, such as discounts and deadlines, pushes the same way.
- What your readers do matters most. When someone replies to you, or moves your email to Primary, Gmail takes note for that reader.

So the most reliable fix is to ask: tell new subscribers to move your first email to Primary. If you want a second opinion on a draft before it goes out, the [Email Scorer](/score) reads it and flags what makes it look like a campaign.

If your emails go to **Spam** rather than Promotions, that is a different problem. Start with [why emails go to spam](/blog/why-emails-go-to-spam) and check your domain with the free [Domain Checker](/domain).
