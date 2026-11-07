---
title: "How to set up Amazon SES to send your newsletter"
nav: "Amazon SES for a newsletter"
description: "Set up Amazon SES as your newsletter's sending account: verify your domain, ask for production access, create SMTP details. About 10 cents per 1,000 emails."
short: "In the Amazon SES console, create an identity for your domain and add the DKIM records it gives you to your DNS. Then request production access (marketing mail, your website, how you handle unsubscribes and bounces); Amazon replies within 96 hours. Finally, create SMTP credentials under SMTP settings and use them in your sending app on port 587."
published: "2026-11-07"
checked: "2026-11-07"
topic: smtp
order: 6
action: sender
asks:
  - how to set up amazon ses for newsletter
  - amazon ses smtp settings
  - amazon ses production access request
  - amazon ses sandbox limit
  - cheap smtp for newsletter
  - send newsletter with amazon ses
needs:
  - An AWS account
  - Your own domain, and access to its DNS settings
  - A website your subscribers signed up on
sources:
  - "AWS: Request production access | https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html"
  - "AWS: Obtaining SMTP credentials | https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html"
related:
  - choose-smtp-account
  - export-mailchimp-list
  - use-dns-record-generator
post: send-newsletter-without-mailchimp
slow: "The sending itself. Amazon SES delivers, but it has no place to write, schedule or keep your issues. Trovarcis Sender connects to SES with the SMTP details from step 4 and sends each subscriber their own copy at the pace you set."
---

## 1. Pick a region and verify your domain

In the Amazon SES console, choose the region closest to your readers (top right) and keep using it: everything in SES is per region. Open **Identities**, **Create identity**, choose **Domain**, and enter your domain. SES gives you three DKIM records: add them as CNAME records in your DNS. The identity shows as verified once they're found, usually within an hour.

## 2. Know what the sandbox allows

New SES accounts start in the sandbox:

| | In the sandbox | After production access |
|---|---|---|
| Who you can email | Only addresses you've verified | Anyone |
| Emails a day | 200 | A quota set by Amazon, raised as you send well |
| Speed | 1 a second | Faster |

## 3. Request production access

In the SES console, open **Account dashboard** and choose **Request production access**. Choose **Marketing** as the mail type, give your website, and confirm you only email people who asked for it and that you handle bounces and complaints. Amazon replies within 96 hours.

Say plainly how people sign up and how they unsubscribe. A vague request is the usual reason for a no.

## 4. Create the SMTP details

In SES, open **SMTP settings**, then **Create SMTP credentials**. Download the file: the password is shown once.

| Setting | Value |
|---|---|
| Server | email-smtp.your-region.amazonaws.com, shown on the SMTP settings page |
| Port | 587, STARTTLS |
| Username and password | From the file you downloaded, not your AWS login |

Test them with the free [SMTP Tester](/smtp-test) before your first issue.

## What it costs

$0.10 per 1,000 emails. A weekly issue to 5,000 subscribers is about 21,700 emails a month: around $2.
