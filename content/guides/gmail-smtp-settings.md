---
title: "Gmail SMTP settings: server, port and password"
description: "The Gmail SMTP settings for any email app or sending software: server, port, encryption, username, the app password and the daily limit."
short: "Server smtp.gmail.com, port 587 with STARTTLS or 465 with SSL, your full Gmail address as the username, and an app password instead of your normal password. A personal account can send to 500 people a day, Google Workspace to about 2,000."
published: "2026-11-07"
checked: "2026-11-07"
topic: smtp
action: smtp
asks:
  - gmail smtp server
  - gmail smtp port
  - smtp settings for gmail
  - what is the smtp server for gmail
  - google workspace smtp settings
  - smtp.gmail.com port 587 or 465
sources:
  - "Google: Sign in with app passwords | https://support.google.com/accounts/answer/185833"
  - "Google: Gmail sending limits | https://support.google.com/mail/answer/22839"
  - "Google: Gmail sending limits in Google Workspace | https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace"
related:
  - gmail-app-password
  - gmail-sending-limits
  - daily-sending-limit-exceeded
post: send-bulk-email-from-gmail
slow: "Getting every setting right, and finding out why a login fails. The free SMTP Tester checks the server, port, encryption and password in one go, and shows the server's own reply when something is wrong."
---

## The settings

| Setting | Value |
|---|---|
| Server | `smtp.gmail.com` |
| Port | `587` with STARTTLS, or `465` with SSL |
| Username | Your full Gmail or Google Workspace address |
| Password | An app password, not your normal one |
| Daily limit | 500 people on a personal account, 2,000 on Google Workspace |

## 1. Create an app password

Gmail refuses your normal password in other apps. Turn on 2-Step Verification, then create an app password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). Step by step: [How to create a Gmail app password](/guides/gmail-app-password).

## 2. Enter the settings in your app

Copy the table above into your email app or sending software. Paste the app password without spaces.

## 3. Test before you send

Run the settings through the [SMTP Tester](/smtp-test) before your first campaign. Error **535 "Username and Password not accepted"** means the normal password was used, or the app password was copied wrong.

## Using Google Workspace?

The settings are the same. Google doesn't show the app passwords option for some work and school accounts, so if you can't find it, ask whoever manages your Workspace account how to connect.
