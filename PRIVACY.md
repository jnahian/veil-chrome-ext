# Privacy policy

Last updated: 2026-09-17

This policy applies to Veil, the Chrome extension published from the [jnahian/veil-chrome-ext](https://github.com/jnahian/veil-chrome-ext) repository.

## Summary

Veil reads the content of the pages that you open, and it saves your rules. All of this stays in your browser. Veil does not send or sell any data.

## What Veil stores

Veil saves this information with Chrome's `chrome.storage.local` API, on your device only:

- The rules that you create: the page or site, a selector for the element, the action, and any replacement text that you enter.
- The start of the original text of each selected element. Veil uses this text to find the element again after a page change.
- Your sensitive data configuration for each site: the selected data types, the style, and your custom words or patterns.
- Your preferences, such as the paused state and the default scope.

Sensitive data hiding does not store the values that it hides. But a rule stores the start of its element's text, and an export file contains that text. If you share an export file, first make sure that its rules contain no secrets.

## What Veil reads

Veil reads the content of the pages that you open, in your browser, for two reasons:

- To apply your rules to the elements that you selected.
- To find and hide the sensitive data types that you turned on.

This processing happens only on your device.

## What Veil sends

Veil makes no network requests. It has no analytics, no tracking and no remote code. Veil shares no data with the developer or with any other party.

## Export and import

When you click Export, Veil saves your rules to a JSON file on your device. Veil does not upload this file. You decide where the file goes.

## Deleting your data

To delete the data for one site, open the Veil popup on that site and click Clear this site. To delete all Veil data, remove the extension from Chrome.

## Changes to this policy

If this policy changes, the new version is published at this address, with a new date at the top.

## Contact

For questions about this policy, open an issue at <https://github.com/jnahian/veil-chrome-ext/issues> or send an email from the [support page](https://veil-ce.jnahian.me/support/).
