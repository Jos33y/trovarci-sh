---
title: "How to create a Gmail app password"
description: "Create a Gmail app password in four steps, so an email app or sending software can send through your Gmail or Google Workspace account."
short: "Turn on 2-Step Verification in your Google account, then open myaccount.google.com/apppasswords, type a name for the app and press Create. Google shows a 16-character code once: paste it into your app as the password, without spaces."
published: "2026-11-07"
checked: "2026-11-07"
topic: smtp
action: smtp
asks:
  - gmail app password
  - how to get an app password for gmail
  - google app password smtp
  - 535 username and password not accepted
  - app passwords option missing
  - gmail password not working in outlook or app
needs:
  - Your Google account password
  - Your phone, for 2-Step Verification
sources:
  - "Google: Sign in with app passwords | https://support.google.com/accounts/answer/185833"
related:
  - gmail-smtp-settings
  - gmail-sending-limits
slow: "Finding out whether the password actually works. The free SMTP Tester logs in with it and tells you in a few seconds, without sending anything."
---

## 1. Turn on 2-Step Verification

In your Google account, open **Security** and turn on **2-Step Verification**. The app passwords page only appears once it is on.

## 2. Open the app passwords page

Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) and sign in again if asked.

## 3. Name it and create it

Type a name you will recognize, such as the app you are connecting, and press **Create**. Google shows a 16-character code. It is shown only once, so copy it now.

## 4. Paste it into your app

Use the code as the password, without spaces, and your full Gmail address as the username. If you ever change your Google password, your app passwords stop working and you need a new one.

## No app passwords option?

Google doesn't show the option when your account uses only security keys for 2-Step Verification, has Advanced Protection, or is a work, school or other organization account. For a work account, ask whoever manages it which way to connect.
