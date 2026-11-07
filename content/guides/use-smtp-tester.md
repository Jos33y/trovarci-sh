---
title: "How to test SMTP settings before you send"
nav: "SMTP Tester"
description: "Test an email account's SMTP server, port and password with the free SMTP Tester. See which step fails and what the server said, without sending an email."
short: "Open the SMTP Tester, type the SMTP server, choose the port and security, enter the username and password, and press Test Connection. It runs each step of a real connection and stops at the one that fails, with the server's own reply. No email is sent and the password isn't saved."
published: "2026-11-07"
checked: "2026-11-07"
topic: tools
order: 3
action: smtp
asks:
  - how to test smtp settings
  - smtp test online
  - check smtp server connection
  - test smtp username and password
  - smtp connection failed
  - which smtp port should i use
needs:
  - The SMTP server, username and password of the account you send from
  - For Gmail or Microsoft, an app password
related:
  - gmail-smtp-settings
  - microsoft-365-smtp-auth
  - smtp-error-codes
---

## 1. Enter the server

Open the [SMTP Tester](/smtp-test) and type the **SMTP server**, such as smtp.gmail.com. Known providers fill in the port and security for you.

## 2. Pick the port and security

| Port | Security | Use |
|---|---|---|
| 587 | STARTTLS | The usual choice |
| 465 | SSL/TLS | When your provider says 465 |
| 25 | | Server to server. Most home and office networks block it |

## 3. Sign in

Enter the **Username**, usually your full email address, and the **Password**. For Gmail use an [app password](/guides/gmail-app-password), not your normal password. The password is used for this test only and never saved.

Under **Advanced options** you can set a different **From address**, a **Test recipient** and the timeout.

## 4. Read the result

Press **Test Connection**. Each step shows a tick or a cross:

| Step | If it fails |
|---|---|
| Connect to server | Wrong server name, or the port is blocked. Try 587 |
| Server greeting | The server is up but not answering mail. Check the server name |
| Encryption (STARTTLS) | Port and security don't match. 587 goes with STARTTLS, 465 with SSL/TLS |
| Log in | Wrong username or password, or SMTP sign-in is turned off for the account |
| Sender accepted | The account may not send from that From address |
| Recipient accepted | The server won't accept mail for that recipient |

**Your settings work** means the same details will work in your sending software. If it fails, the server's own reply is shown: paste it into the [help desk](/guides) for what it means.
