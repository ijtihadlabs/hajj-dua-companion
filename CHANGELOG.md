# Changelog

## 2026.05.01

- Added a visible app version/status block in `More -> About`.
- Added `Show what's new` to reopen the release notes after the one-time popup is dismissed.
- Added `Refresh app files` to refresh cache/service-worker files without clearing saved user data.
- Simplified `Create personal version` so Arabic, transliteration, and English can be edited directly.
- Rendered personal/requested Arabic with the same large readable Arabic styling as the main app.
- Kept original verified Qur'an/Sunnah source text as a collapsed reference for personalised duas.
- Preserved saved duas, requested duas, custom categories, settings, backups, and reading position under saved-data schema `v6`.

## 2026.04.30

- Refreshed the app reading layout and in-app title mark.
- Added a one-time update popup for existing users.
- Upgraded Saved into a private on-device dua workspace with editable categories, personal duas, requested duas, and backup/import.
- Added verified Hajj, Umrah, and Madinah guidance discovered from the 2024 Hajj/Umrah/Madinah PDF and cross-checked against primary/reputable sources.
- Added selected Riyad as-Salihin supplications and Madinah guidance cards.
- Added `data/source_audit.json` with inclusion/exclusion notes for reviewed candidates.
- Regenerated the offline app data, service worker cache, and mobile PDF fallback.

## Earlier

- Added saved dua categories.
- Replaced corrupted PDF-extracted Arabic with clean sourced Arabic where confidently matched.
- Added clean Sayyidul Istighfaar Arabic.
- Built the initial offline Hajj Dua Companion PWA.
