---
title: "How to email just one group from your list"
nav: "Email one group only"
description: "Send to the choir, Year 4 parents or one team without keeping separate lists: one spreadsheet with a group column, filtered each time you send."
short: "Keep everyone in one spreadsheet with a group column (choir, youth, Year 4). When you send to one group, filter that column and save the filtered rows as their own CSV. People in two groups go in one row with both groups listed, so filtering by 'contains' finds them in each."
published: "2026-11-07"
checked: "2026-11-07"
topic: lists
order: 5
action: sender
asks:
  - email one group from contact list
  - send email to choir only
  - email one class parents
  - segment email list spreadsheet
  - filter contacts by group csv
needs:
  - Your list in Google Sheets or Excel
related:
  - google-form-mailing-list
  - email-without-showing-addresses
  - email-more-than-500
post: email-all-church-members
slow: "Remembering who asked to stop when you send to five different groups. Trovarcis Sender's Do not send list applies to every list you import, so a member who opted out is skipped whichever group you send to."
---

## 1. One list, one group column

| first_name | email | groups |
|---|---|---|
| Grace | grace@example.com | choir, youth leaders |
| Daniel | daniel@example.com | youth |

One row per address, even for people in several groups. Two separate lists drift apart within a month.

## 2. Filter and save

- **Google Sheets:** select the header row, choose **Data**, **Create a filter**, then on the groups column choose **Filter by condition**, **Text contains**, "choir". Copy the visible rows to a new sheet and download it as CSV.
- **Excel:** **Data**, **Filter**, then the groups column's arrow, **Text Filters**, **Contains**. Copy the visible rows to a new sheet and save it as CSV.

"Contains" catches Grace, who is in two groups.

## 3. Name the file for the send

Call it what it is, like "Choir, November rehearsals.csv", so you can see later who got what.
