---
title: "Set up SPF, DKIM and DMARC for Google Workspace"
nav: "Google Workspace SPF, DKIM, DMARC"
description: "The three DNS records Google Workspace needs, where to get the DKIM key in the Admin console, and how to check they work."
short: "Add a TXT record v=spf1 include:_spf.google.com ~all at @. Generate a DKIM key in the Admin console under Apps, Google Workspace, Gmail, Authenticate email, and add it as a TXT record at google._domainkey. Then add a DMARC record at _dmarc, starting with p=none."
published: "2026-11-07"
checked: "2026-11-07"
topic: dns
order: 1
action: records
asks:
  - google workspace dkim
  - google workspace spf record
  - set up dmarc for google workspace
  - gmail dkim setup
  - authenticate email google admin
  - _spf.google.com
needs:
  - Super admin access to your Google Workspace account
  - Access to your domain's DNS settings
sources:
  - "Google: Set up SPF | https://knowledge.workspace.google.com/admin/security/set-up-spf"
  - "Google: Set up DKIM | https://knowledge.workspace.google.com/admin/security/set-up-dkim"
  - "Google: Email sender guidelines | https://support.google.com/a/answer/81126"
related:
  - add-dmarc-record
  - find-why-emails-go-to-spam
  - remove-from-blocklist
post: spf-dkim-dmarc-setup
slow: "Getting three records exactly right and knowing they work. The free DNS Generator writes all three for Google Workspace, and the free Domain Checker confirms each one once it's live."
---

## 1. Add the SPF record

| Type | Name | Value |
|---|---|---|
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` |

That value is for a domain that sends only through Google Workspace. If other services send for you too, add them to the same record. A domain has one SPF record, never two.

## 2. Generate the DKIM key

In the Admin console, go to **Menu**, **Apps**, **Google Workspace**, **Gmail**, then **Authenticate email**. Pick your domain and choose **Generate New Record**. Choose **2048** bits if your DNS provider allows it, otherwise 1024, and keep the selector **google**.

Google suggests waiting 24 to 72 hours after turning on Gmail before generating the key.

## 3. Add it, then switch it on

Add the record Google shows. Don't press **Start authentication** yet.

| Type | Name | Value |
|---|---|---|
| TXT | `google._domainkey` | The value from the Admin console, starting `v=DKIM1; k=rsa; p=` |

Once the record is live, which can take up to 48 hours, go back to **Authenticate email** and press **Start authentication**.

## 4. Add DMARC

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` |

Create the mailbox in the value first, so the reports have somewhere to arrive. More: [How to add a DMARC record](/guides/add-dmarc-record).

## Check it worked

Run your domain through the [Domain Checker](/domain). Or send an email to a different Gmail address, open it, choose **Show original**, and look for **DKIM: PASS**. Emailing yourself doesn't prove it.
