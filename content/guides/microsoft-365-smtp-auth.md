---
title: "Fix 535 5.7.139 Authentication unsuccessful in Microsoft 365"
nav: "Microsoft 365: 535 5.7.139"
description: "Microsoft 365 refuses SMTP sign-in with 535 5.7.139. What each version of the message means, the setting that fixes it, and what changes in December 2026."
short: "Error 535 5.7.139 means Microsoft 365 blocked SMTP sign-in, not that your password is wrong. In the Microsoft 365 admin center, open Users, Active users, pick the mailbox, choose Mail, then Manage email apps, tick Authenticated SMTP and save. If it still fails, security defaults or the organisation-wide SMTP setting is blocking it."
published: "2026-11-07"
checked: "2026-11-07"
topic: smtp
order: 3
action: smtp
asks:
  - 535 5.7.139 authentication unsuccessful
  - SmtpClientAuthentication is disabled for the tenant
  - SmtpClientAuthentication is disabled for the mailbox
  - user is locked by your organization's security defaults policy
  - office 365 smtp not working
  - outlook smtp authentication unsuccessful
  - microsoft 365 smtp settings
  - enable smtp auth office 365
  - smtp.office365.com 535 error
  - basic authentication smtp office 365 2026
needs:
  - Admin access to the Microsoft 365 account, or the person who has it
  - The mailbox you want to send from
sources:
  - "Microsoft: Enable or disable SMTP AUTH in Exchange Online | https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission"
  - "Microsoft message center MC786329: Basic Auth for SMTP AUTH | https://mc.merill.net/message/MC786329"
related:
  - smtp-error-codes
  - use-smtp-tester
  - gmail-smtp-settings
slow: "Trying settings in your sending software one at a time. The SMTP Tester signs in with your settings and shows the exact step that fails and the server's own words, so you know whether it's the password, the mailbox setting or the organisation's policy."
---

## 1. Read the end of the message

The words after **5.7.139** tell you which switch is off. Paste your full error into the [help desk](/guides) to have it explained, or find it here:

| The message ends with | What it means | Fix |
|---|---|---|
| SmtpClientAuthentication is disabled for the Mailbox | SMTP sign-in is off for this one mailbox | Step 2 |
| SmtpClientAuthentication is disabled for the Tenant | SMTP sign-in is off for the whole organisation | Step 3 |
| user is locked by your organization's security defaults policy | Security defaults block all SMTP sign-in | Step 4 |
| basic authentication is disabled | A sign-in policy blocks password sign-in over SMTP | Step 4 |
| the user credentials were incorrect | The username or password is wrong | Use the full email address and check the password |

## 2. Turn on SMTP sign-in for the mailbox

1. Open the Microsoft 365 admin center and go to **Users**, then **Active users**.
2. Select the person whose mailbox you send from, then choose **Mail**.
3. Under **Email apps**, choose **Manage email apps**.
4. Tick **Authenticated SMTP** and select **Save changes**.

Allow up to an hour for the change to apply, then test again.

## 3. Check the organisation-wide setting

In the Exchange admin center, open **Settings**, then **Mail flow**. If **Turn off SMTP AUTH protocol for your organization** is ticked, SMTP sign-in is off for everyone. The mailbox setting in step 2 overrides it for that one mailbox, which is usually the safer choice.

## 4. If security defaults are on

Security defaults turn off SMTP sign-in for the whole organisation, whatever steps 2 and 3 say. Turning them off is done in Microsoft Entra, under the organisation's **Properties**, and removes protections such as required two-step sign-in. Decide that with whoever looks after your accounts' security, not just to make one app work.

## 5. Use the right settings

| Setting | Value |
|---|---|
| Server | smtp.office365.com |
| Port | 587 |
| Security | STARTTLS |
| Username | The full email address |
| Password | The mailbox password |

## What changes in December 2026

Microsoft is turning off password sign-in over SMTP by default for existing organisations at the end of December 2026. Admins can still turn it back on. Organisations created after that date start with it off. Microsoft says it will announce a final removal date in the second half of 2027.

If your sending stops in January with this error, steps 2 to 4 are where to look first.
