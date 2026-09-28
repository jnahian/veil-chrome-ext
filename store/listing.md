# Chrome Web Store listing text

Copy each field into the Chrome Web Store Developer Dashboard. The [submission guide](GUIDE.md) tells you where each field goes.

## Store listing tab

### Title and summary

Chrome takes these from `manifest.json`, so you cannot edit them in the dashboard.

- Title: `Veil: Hide, Blur & Rewrite`
- Summary: `Hide, blur or rewrite any element, and mask money, emails, phone numbers and other sensitive data. Changes stay on every visit.`

### Description

```text
Veil hides private information on web pages before you share your screen, record a demo, or take a screenshot.

HIDE SENSITIVE DATA ON A WHOLE SITE
Turn it on once for a site, and Veil covers every match on its pages, including content that loads later:
• Money: $1,240.50, 1.240,50 €, Rs. 1,00,000, USD 99, $1.2k
• Email addresses
• Phone numbers, such as +880 1712-345678 and (555) 123-4567
• Card numbers (checked with the Luhn checksum)
• IBANs (checked with the IBAN checksum)
• API keys and access tokens
• IPv4 addresses
• Your own words, or regular expressions

Choose how matches look:
• Mask: a solid bar. The page itself does not change.
• Blur: blurred, and optionally clear while you hover.
• Hide: invisible, with the space kept.

HIDE, BLUR OR REWRITE ANY ELEMENT
Click "Pick an element", or right-click the page and choose "Veil this element". Then:
• Replace its text directly on the page, in the site's own font.
• Blur it, with a live preview and an optional hover reveal.
• Hide it, with or without its space.
Apply a change to one page or to the whole site. Veil applies your changes again on every visit, also on single-page apps.

KEYBOARD SHORTCUTS
• Alt+Shift+V: pick an element
• Alt+Shift+X: pause or resume all changes
• Alt+Shift+M: show hidden data on the current tab for a moment

PRIVATE BY DESIGN
Veil makes no network requests, and has no analytics and no remote code. Your rules stay in your browser. You can export them to a JSON file and import them again.

LIMITS
Veil hides data visually only. The page's own scripts can still read it. Veil does not work inside iframes, canvas charts or images.

Website: https://veil-ce.jnahian.me
Source code (MIT License): https://github.com/jnahian/veil-chrome-ext
```

### Other fields

| Field | Value |
|---|---|
| Category | Privacy & Security. If the dashboard does not list it, use Tools. |
| Language | English |
| Store icon | `assets/store-icon-128.png` |
| Screenshots | `assets/screenshot-1-mask.png` to `assets/screenshot-5-rules.png`, in that order |
| Small promo tile | `assets/promo-small-440x280.png` |
| Marquee promo tile | `assets/promo-marquee-1400x560.png` |
| Official URL | None |
| Homepage URL | `https://veil-ce.jnahian.me/` |
| Support URL | `https://github.com/jnahian/veil-chrome-ext/issues` |
| Mature content | Off |

## Privacy practices tab

### Single purpose

```text
Veil hides, blurs or replaces content on the web pages that a user visits, so that the user can keep private information off the screen.
```

### Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Saves the user's rules and sensitive data configuration on the device, so that Veil can apply them again on every visit. |
| `scripting` | After an install or update, starts Veil in the tabs that are already open. Without this, those tabs need a reload before Veil works. |
| `contextMenus` | Adds the "Veil this element" item to the right-click menu. |
| Host permissions (`http://*/*`, `https://*/*`) | The user can create rules and turn on sensitive data hiding for any site. Veil must apply them while each page loads, before the content shows, so the content script runs on all http and https pages. |

### Remote code

Select "No, I am not using remote code".

### Data usage

Select one data type: Website content.

Google requires this disclosure even for data that never leaves the device. Veil reads page text to find sensitive data, and each rule stores the start of its element's text.

Do not select any other data type.

Select all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy policy URL

```text
https://veil-ce.jnahian.me/privacy/
```
