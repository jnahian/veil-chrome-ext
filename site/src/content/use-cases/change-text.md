---
title: Change Text on Any Website for Mockups
order: 8
summary: Edit text on a live website in Chrome for mockups, demos and doc screenshots. Veil keeps the site's font and color, and reapplies your edit on every visit.
icon: type
related: [pick-an-element-and-change-it, manage-your-rules, known-limits]
---

# Edit a live website's text, and keep the edit

Veil is a free Chrome extension that lets you replace the text of any element on a website. You type straight onto the page, the new text keeps the site's font, size and color, and Veil applies it again every time the page loads. Use it to swap real names for sample ones, tidy a page for a screenshot, or try out new copy on the real design.

![The Veil popup listing a replaced heading, a blurred avatar and a removed banner as rules for the page](../../../../store/assets/screenshot-5-rules.png)

## How do I change text on a website?

Pick the element and choose **Replace text**, then type the new text in place and press Enter.

1. Press **Pick an element (Alt+Shift+V)**, or right-click the text and choose **Veil this element**.
2. Click the text you want to change. Use ↑ and ↓ to move to the parent or child element.
3. Choose **This page** or **Whole site**.
4. Click **Replace text** and type. Press Enter to save, Shift+Enter for a new line, and Esc to cancel.

Every save shows an **Undo** button for 5 seconds. See [Pick an element and change it](../docs.md#pick-an-element-and-change-it).

## Does the new text stay after I reload?

Yes. Veil saves each edit as a rule and applies it again every time the page loads, including on single-page apps. The edit is only in your Chrome, and nobody else sees it.

## What can I use it for?

| Job | Example |
|---|---|
| Product screenshots for docs or marketing | Replace a real customer's name with a sample one |
| Demos on a live account | Change "Good morning, Maya" to "Good morning" |
| Copy reviews | Try a new headline or button label on the real page |
| Training material | Show sample values in a label or a table cell |

For data with a known format, such as emails and amounts, Veil can mask every match on a site without editing each one. See [hide customer data in live demos](live-demos.md).

## How do I change or remove an edit?

- **Change it:** select the same element again and choose **Replace text**. Veil updates the rule instead of adding a second one.
- **Turn it off or delete it:** open the popup, where each rule has a switch, a button that jumps to the element, and a delete button.
- **See the original page:** press **Pause all changes (Alt+Shift+X)**, and press it again to resume.

See [Manage your rules](../docs.md#manage-your-rules).

## What are the limits?

- **Framework pages can break.** Replacing text on elements rendered by a framework can occasionally break that part of the page. If it does, delete the rule, or pick a smaller element that contains only text.
- **A redesign can break a rule.** If the site changes, the selector can stop matching. Veil also stores the start of the element's text as a fallback, which recovers many of these cases.
- **Lists that reorder can misfire.** An edit to "the 2nd card" can land on a different item when the order changes.
- **The page still holds the original.** The site's own scripts can still read the text you replaced.

See [Known limits](../docs.md#known-limits).

## Get Veil

Veil is free, open source under the MIT License, and needs no account. It makes no network requests, and your rules stay on your device.

[Add Veil to Chrome](https://chromewebstore.google.com/detail/veil-hide-blur-rewrite/mmgidjpigbhdkdnmjhcbjhlbfhecddkc). Want to remove an element instead? Read how to [hide any element on a website permanently](hide-elements.md).
