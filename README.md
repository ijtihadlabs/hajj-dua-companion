# Hajj Dua Companion

A free offline-first dua and adhkar companion for Hajj and Umrah, built as a
khidmah by Ijtihad Labs.

Current release: `2026.04.30`

The app is designed for iPhone Home Screen use during Hajj:

- no login
- no analytics or tracking
- no network dependency after first install
- Qur'anic duas shown with verified Uthmani/QPC Hafs text
- Sunnah duas separated from narration/context
- companion reports labelled as athar, not Prophetic Sunnah
- weaker or devotional material kept in the appendix

## Release 2026.04.30

- refreshed calm reading layout with bottom navigation
- one-time "What's new" note so existing users understand the update
- Saved workspace with editable categories, personal duas, requested duas, and backup/import
- added source-audited Hajj, Umrah, and Madinah guidance discovered from the 2024 Hajj/Umrah/Madinah PDF and verified against primary/reputable sources
- added `data/source_audit.json` for local review of included and excluded candidate items
- refreshed mobile PDF fallback from the same app data

## Live site

Production URL:

```text
https://hajj-dua-companion.ijtihadlabs.org
```

## Local preview

```bash
python3 -m http.server 8765
```

Open:

```text
http://127.0.0.1:8765
```

## Deployment

This is a static site deployed on Netlify.

- Netlify site name: `hajj-dua-companion`
- Publish directory: `.`
- Build command: none
- Custom domain: `hajj-dua-companion.ijtihadlabs.org`

## Data safety

Saved duas, requested duas, editable categories, and reading settings are stored
locally in the browser/Home Screen app. Normal app updates should preserve this
data. Clearing Safari website data or deleting the Home Screen app can remove
local data, so users should use Export backup before travel or before major
device/browser changes.

## Important note

References are provided to make access easier. Open dua moments are not fixed
wordings. Important religious matters should be reviewed with reliable
scholarship.
