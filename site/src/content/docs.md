# Veil documentation

Veil is a Chrome extension that hides sensitive data on web pages before you share your screen, record a demo or take a screenshot. This guide covers every feature. For a quick look, see the [home page](/) and its live demo.

## Install Veil

1. Open Veil on the [Chrome Web Store](https://chromewebstore.google.com/detail/veil-hide-blur-rewrite/mmgidjpigbhdkdnmjhcbjhlbfhecddkc) and click **Add to Chrome**.
2. Click the puzzle-piece icon in the toolbar and pin Veil.

When Veil is installed, updated or reloaded, it starts again in the tabs that are already open. If a tab does not respond, reload it. Chrome updates Veil on its own.

## Hide sensitive data on a site

Use this to cover money, emails, card numbers and other data that has a known format.

1. Open the site you plan to share.
2. Click the Veil icon and turn on **Hide sensitive data on this site**.
3. Under **What to hide**, select the types. Money is selected to start with.
4. Choose a style: **Mask**, **Blur** or **Hide**.

Veil covers every match on the site's pages, including matches that load later. The setting applies to the whole site, and each selected type shows as a row under **Sensitive data** in the popup. Delete a row to stop hiding that type.

### What types can Veil find?

| Type | Examples | How Veil avoids false matches |
|---|---|---|
| Money | `$1,240.50`, `Rs. 1,00,000` | Skips version numbers, years, percentages and phone numbers |
| Emails | `jane@example.com` | Needs a name, an `@` and a domain |
| Phone numbers | `+880 1712-345678`, `(555) 123-4567`, `01712345678` | 9 to 15 digits. A number without separators must start with 0. Dates and `1 234 567` style amounts are skipped |
| Card numbers | `4242 4242 4242 4242` | 13 to 19 digits that pass the Luhn checksum, the check digit that every card number has |
| IBANs | `DE89 3704 0044 0532 0130 00` | Must pass the IBAN checksum |
| API keys and tokens | `sk_live_…`, `ghp_…`, `shpat_…`, `AKIA…`, `xoxb-…`, JWTs | Known key formats only |
| IP addresses | `192.168.1.10` | IPv4 only |

Veil does not look for names, street addresses or bank account numbers, because they have no reliable format. [Pick those elements](#pick-an-element-and-change-it) yourself instead.

Veil skips code elements (`code`, `pre`, `kbd` and `samp`) for every type except API keys and tokens, because pages often show keys in code elements.

### What counts as money?

- A currency symbol or code before or after a number: `$1,240.50`, `1.240,50 €`, `৳ 5,000`, `Tk 500`, `Rs. 2,500`, `USD 99`, `99 BDT`, `CHF 1'250.00`, `US$1,000`, `50¢`.
- Short forms: `$1.2k`, `€3M`, `₹3 lakh`.
- Amounts split across elements, such as `<span>$</span><span>1,240</span>`.
- Input fields whose value has a currency, or whose label, name or placeholder says price, amount, total or similar.
- Plain numbers next to words like Total, Balance, Price, Revenue or Fee, including `Balance | 5,000` table cells. This one is off by default because it catches more false matches. Turn on **Also catch plain numbers next to words like Total or Balance** to use it.

### Add your own words

The custom box takes one entry per line. A plain entry matches that text, and case does not matter. An entry between slashes, such as `/INV-\d+/`, is a regular expression.

### Mask, blur or hide: which style should I use?

| Style | Looks like | Changes the page's HTML? |
|---|---|---|
| Mask (default) | A solid grey bar over the match | No. It uses Chrome's CSS Highlight API, so it is safe on React and Vue sites |
| Hide | The match is invisible, and its space is kept | No |
| Blur | The match is blurred | Yes. Each match is wrapped in a `<veil-money>` element, which can occasionally upset pages built with a framework |

Use Mask unless you have a reason not to. With Blur you can also turn on **Show hidden data clearly while I hover over it**. That setting is off by default.

### How do I see the hidden data again?

Press **Alt+Shift+M** to show the hidden data on the current tab. Press it again to hide it.

### Veil covered something that is not sensitive

Pick the element, or right-click it and choose **Veil this element**. Then click **Keep this visible when hiding sensitive data**. The popup shows how many elements you have kept visible and lets you reset them.

## Pick an element and change it

Use this for anything without a fixed format, such as names, addresses, photos or a whole panel. There are three ways to start:

- Click the Veil icon, then **Pick an element**.
- Press **Alt+Shift+V**.
- Right-click anything on the page and choose **Veil this element**. This skips the picker.

While you pick:

| Key | Action |
|---|---|
| Click or Enter | Select the highlighted element |
| ↑ / ↓ | Move to the parent or child element |
| Esc or right-click | Cancel |

After you select an element, a panel appears:

- **This page / Whole site** sets where the change applies. Veil remembers your last choice.
- **Replace text** makes the element editable in place, so the new text keeps the site's font, size and color. Press Enter to save, Shift+Enter for a new line, and Esc to cancel.
- **Blur** shows a live preview. Drag the slider to set the strength, and optionally let the element show clearly while you hover over it.
- **Hide** has two modes. **Keep the space** leaves a blank gap. **Remove from the layout** lets the page close up around it.
- **Select parent / Select child** changes your selection without restarting the picker.

Every save shows an **Undo** button for 5 seconds. Veil applies your change again every time the page loads, including on single-page apps.

To change a saved rule, select the same element again and apply the same action. Veil updates the rule instead of adding a second one.

## Manage your rules

The popup lists the current site's rules in three groups: this page, the whole site, and other pages on the site. For each rule you can:

- Turn it on or off.
- Jump to the element on the page.
- Delete it.

The switch in the popup header pauses all of Veil's changes. **Alt+Shift+X** does the same.

### Back up and move your rules

**Export** saves all your rules to a JSON file. **Import** adds the rules from a file to your existing ones and never overwrites them.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Alt+Shift+V | Pick an element |
| Alt+Shift+X | Pause or resume all changes |
| Alt+Shift+M | Show or hide sensitive data on the current tab |

To change them, open `chrome://extensions/shortcuts`.

## Before you share your screen

- Open the pages you plan to show before you start sharing. On a slow page, data can flash on screen before Veil's first scan.
- Check that the right types are selected for each site. Only money is selected to start with.
- Press **Alt+Shift+M** once to check what Veil covers, then press it again.

## Known limits

- **Veil hides data on screen only.** The page's own scripts can still read the original data, including text you replaced.
- **Veil cannot reach some content:** charts drawn on a `<canvas>`, images, other sites' shadow DOM components, blank or `srcdoc` iframes that the page fills in itself, and text with a gradient fill.
- **Numbers without a currency** are not caught unless you turn on the plain-number setting.
- **Rules can break when a site changes.** A redesign can make a selector stop matching. Veil also stores the start of the element's text as a fallback, which recovers many of these cases, but not elements without text, such as images.
- **Lists that reorder can misfire.** A rule for "the 2nd card" may land on a different item when the order changes.
- **Replacing text on framework-rendered elements can occasionally break that part of the page.** If this happens, delete the rule, or pick a smaller element that contains only text.
- **Some pages are off limits.** Chrome blocks extensions on `chrome://` pages and on the Chrome Web Store.

## Privacy and permissions

Veil makes no network requests and has no analytics or remote code. Your rules are saved with `chrome.storage.local` on your device. Veil asks for access to all http and https sites so it can apply your rules again when a page loads. Read the [privacy policy](/privacy/) for the details.

## Get help

Report a bug or ask a question in the [GitHub issues](https://github.com/jnahian/veil-chrome-ext/issues). To report a security problem, follow the [security policy](https://github.com/jnahian/veil-chrome-ext/blob/main/SECURITY.md).
