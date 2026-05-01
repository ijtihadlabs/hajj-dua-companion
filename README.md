# Hajj Dua Companion

A free offline-first dua and adhkar companion for Hajj and Umrah, built as a
khidmah by Ijtihad Labs.

Current release: `2026.05.01`

The app is designed for iPhone Home Screen use during Hajj:

- no login
- no analytics or tracking
- no network dependency after first install
- Qur'anic duas shown with verified Uthmani/QPC Hafs text
- Sunnah duas separated from narration/context
- companion reports labelled as athar, not Prophetic Sunnah
- weaker or devotional material kept in the appendix
- personal and requested duas remain private on the device

## Release 2026.05.01

- personal and requested Arabic now uses the same large readable Arabic style as the app
- `Create personal version` lets users edit Arabic, transliteration, and English directly
- original verified Qur'an/Sunnah source text is kept as a collapsed reference for personalised duas
- `More -> About` now shows the app version, saved-data schema, update note version, and offline status
- added `Show what's new` so release notes can be reopened after the one-time popup is dismissed
- added `Refresh app files`, which refreshes service-worker/cache files without clearing saved duas
- saved data remains schema `v6` and continues to preserve saved duas, requested duas, custom categories, settings, and reading position

## Live site

Production URL:

```text
https://hajj-dua-companion.ijtihadlabs.org
```

## Install On iPhone

1. Open the production URL in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Open the app once while online so the offline files can cache.
5. Before travelling, use Saved -> Data backup -> Export backup.

## Local preview

```bash
python3 -m http.server 8787
```

Open:

```text
http://127.0.0.1:8787
```

## Deployment

This is a static site deployed on Netlify.

- Netlify site name: `hajj-dua-companion`
- Publish directory: `.`
- Build command: none
- Custom domain: `hajj-dua-companion.ijtihadlabs.org`

To conserve Netlify credit, prefer one Git-triggered production deploy per reviewed release.
Avoid preview/manual deploys unless the Git deploy fails and a manual deploy is explicitly approved.

## Data safety

Saved duas, requested duas, editable categories, reading position, and settings are stored
locally in the browser/Home Screen app. Normal app updates should preserve this data.
Clearing Safari website data or deleting the Home Screen app can remove local data, so
users should use Export backup before travel or before major device/browser changes.

The `Refresh app files` button clears only app caches/service-worker files and reloads the
app. It does not clear saved duas, requested duas, categories, settings, backups, or the
release-note marker.

## Important note

References are provided to make access easier. Open dua moments are not fixed wordings.
Important religious matters should be reviewed with reliable scholarship.
