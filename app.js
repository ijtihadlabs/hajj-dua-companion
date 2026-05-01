const USER_DATA_KEY = 'hajjDuaCompanionUserData';
const APP_VERSION = '2026.05.01';
const USER_DATA_VERSION = 6;
const MIGRATION_BACKUP_KEY = 'hajjDuaCompanionMigrationBackup';
const NEEDS_CATEGORY = 'needs-category';
const REQUESTED_CATEGORY = 'requested-duas';
const VERSION_NOTES_KEY = 'hajjDuaCompanionSeenVersionNotes';
const VERSION_NOTES_ID = '2026.05.01';

const state = {
  data: null,
  userData: null,
  view: 'hajj',
  moment: 'Arafah',
  collection: 'quranic-rabbana',
  query: '',
  category: 'All',
  tier: 'All',
  savedFilter: 'all',
  fontScale: 1,
  tajweed: false,
  focusItems: [],
  focusIndex: 0,
  pendingSaveId: '',
  pendingSaveCategory: '',
  pendingCustomKind: 'personal',
  pendingCustomId: '',
  pendingCustomSourceSnapshot: null,
  pendingReturnAfterCustom: null,
  pendingProtectedSelection: null,
  pendingPhraseSegmentIds: [],
  pendingAutoEnglish: '',
  pendingEnglishEdited: false,
  suppressEnglishEdit: false,
  storageNotice: '',
  readingSaveTimer: 0,
  restoreTimer: 0,
  suppressReadingCapture: false,
};

const $ = (id) => document.getElementById(id);
const esc = (value = '') => String(value).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const nowIso = () => new Date().toISOString();

function readStoredJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function openVersionNotes() {
  const dialog = $('versionNotesDialog');
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function maybeShowVersionNotes() {
  if (safeLocalStorageGet(VERSION_NOTES_KEY) === VERSION_NOTES_ID) return;
  openVersionNotes();
}

function closeVersionNotes() {
  safeLocalStorageSet(VERSION_NOTES_KEY, VERSION_NOTES_ID);
  const dialog = $('versionNotesDialog');
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function updateAppMetadata() {
  if ($('appVersion')) $('appVersion').textContent = APP_VERSION;
  if ($('dataSchemaVersion')) $('dataSchemaVersion').textContent = `v${USER_DATA_VERSION}`;
  if ($('updateNoteVersion')) $('updateNoteVersion').textContent = VERSION_NOTES_ID;
  const status = $('updateStatus');
  if (!status) return;
  const offlineReady = Boolean(navigator.serviceWorker?.controller);
  status.textContent = offlineReady ? 'Loaded from this device · Offline ready' : 'Loaded from this device';
}

async function refreshAppFiles() {
  setStorageNotice('Refreshing app files. Your saved duas will stay on this device.');
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.includes('hajj-dua-companion')).map((key) => caches.delete(key)));
    }
    window.location.reload();
  } catch (error) {
    console.error('Could not refresh app files', error);
    setStorageNotice('App files could not be refreshed. Your saved duas were not changed.', true);
  }
}

function setStorageNotice(message, isWarning = false) {
  state.storageNotice = message || '';
  const notice = $('storageNotice');
  if (!notice) return;
  notice.textContent = state.storageNotice;
  notice.style.color = isWarning ? 'var(--rose)' : 'var(--muted)';
}

function defaultSettings() {
  const legacyFontScale = Number(localStorage.getItem('fontScale') || '1');
  return {
    fontScale: Number.isFinite(legacyFontScale) ? Math.min(1.35, Math.max(.82, legacyFontScale)) : 1,
    tajweed: localStorage.getItem('tajweedColours') === '1',
  };
}

function protectedCategories() {
  return [
    { id: REQUESTED_CATEGORY, title: 'Requested Duas', description: 'Duas requested by others.', protected: true, system: true },
    { id: NEEDS_CATEGORY, title: 'Needs category', description: 'Saved before categories were chosen or after a category was removed.', protected: true, system: true },
  ];
}

function seedCategories() {
  return [
    ...state.data.save_categories.map((category) => ({
      id: category.id,
      title: category.title,
      description: category.description || 'Saved dua category.',
      protected: false,
      system: false,
    })),
    ...protectedCategories(),
  ];
}

function slugify(value) {
  const slug = String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'category';
}

function uniqueCategoryId(title) {
  const existing = new Set(state.userData.categories.map((category) => category.id));
  const base = slugify(title);
  let candidate = base;
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function normalizeCategory(category, fallback = {}) {
  const id = String(category?.id || fallback.id || '').trim();
  if (!id) return null;
  return {
    id,
    title: String(category?.title || fallback.title || id).trim(),
    description: String(category?.description || fallback.description || 'Saved dua category.').trim(),
    protected: Boolean(category?.protected || fallback.protected),
    system: Boolean(category?.system || fallback.system),
  };
}

function normalizeSettings(settings = {}) {
  const fallback = defaultSettings();
  const fontScale = Number(settings.fontScale ?? fallback.fontScale);
  return {
    fontScale: Number.isFinite(fontScale) ? Math.min(1.35, Math.max(.82, fontScale)) : fallback.fontScale,
    tajweed: Boolean(settings.tajweed ?? fallback.tajweed),
  };
}

function normalizeSavedRecord(value, fallbackCategory = NEEDS_CATEGORY) {
  if (typeof value === 'string') return { categoryId: value || fallbackCategory, savedAt: nowIso(), updatedAt: nowIso() };
  return {
    categoryId: String(value?.categoryId || fallbackCategory),
    savedAt: value?.savedAt || nowIso(),
    updatedAt: value?.updatedAt || value?.savedAt || nowIso(),
  };
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasArabic(value = '') {
  return /[؀-ۿݐ-ݿࢠ-ࣿ]/.test(String(value));
}

function bodySegmentsFromText(text = '') {
  const segments = [];
  String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/).forEach((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    let current = null;
    lines.forEach((line) => {
      const type = hasArabic(line) ? 'arabic' : 'text';
      if (current && current.type === type) current.text += `\n${line}`;
      else {
        current = { type, text: line };
        segments.push(current);
      }
    });
  });
  return segments;
}

function normalizeBodySegments(segments, body = '') {
  if (!Array.isArray(segments) || !segments.length) return bodySegmentsFromText(body);
  return segments
    .map((segment) => ({
      type: segment?.type === 'arabic' ? 'arabic' : 'text',
      text: String(segment?.text || '').trim(),
    }))
    .filter((segment) => segment.text);
}

function normalizeSourceSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const sourceId = String(snapshot.sourceId || snapshot.id || '').trim();
  return {
    sourceId,
    title: String(snapshot.title || '').trim(),
    sourceLabel: String(snapshot.sourceLabel || snapshot.sourceKind || '').trim(),
    sourceRef: String(snapshot.sourceRef || '').trim(),
    arabic: String(snapshot.arabic || '').trim(),
    arabicQpcHafs: String(snapshot.arabicQpcHafs || '').trim(),
    arabicTajweedHtml: String(snapshot.arabicTajweedHtml || '').trim(),
    isQuran: Boolean(snapshot.isQuran),
    transliteration: String(snapshot.transliteration || '').trim(),
    meaning: String(snapshot.meaning || '').trim(),
    phraseSegments: normalizePhraseSegments(snapshot.phraseSegments || snapshot.phrase_segments || []),
  };
}

function normalizePhraseSegments(segments = []) {
  if (!Array.isArray(segments)) return [];
  return segments
    .map((segment, index) => ({
      id: String(segment?.id || `segment-${index}`).trim(),
      label: String(segment?.label || `Phrase ${index + 1}`).trim(),
      startToken: Math.max(0, Number(segment?.startToken ?? segment?.start ?? 0)),
      endToken: Math.max(0, Number(segment?.endToken ?? segment?.end ?? segment?.startToken ?? 0)),
      english: String(segment?.english || '').trim(),
      transliteration: String(segment?.transliteration || '').trim(),
      role: segment?.role === 'context' ? 'context' : 'dua',
    }))
    .filter((segment) => segment.id && segment.english && segment.endToken >= segment.startToken)
    .sort((a, b) => a.startToken - b.startToken || a.endToken - b.endToken);
}

function sourcePlainArabicFromSnapshot(snapshot) {
  const normalized = normalizeSourceSnapshot(snapshot);
  if (!normalized) return '';
  return normalized.isQuran
    ? (normalized.arabicQpcHafs || normalized.arabic)
    : normalized.arabic;
}

function sourceTokensFromText(text = '') {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

function sourceTokenCount(snapshot) {
  return sourceTokensFromText(sourcePlainArabicFromSnapshot(snapshot)).length;
}

function normalizeProtectedSelection(selection, snapshot) {
  const count = sourceTokenCount(snapshot);
  if (!snapshot || !count) return null;
  const rawStart = Number(selection?.startToken ?? selection?.start ?? 0);
  const rawEnd = Number(selection?.endToken ?? selection?.end ?? count - 1);
  const startToken = Math.min(Math.max(Number.isFinite(rawStart) ? rawStart : 0, 0), count - 1);
  const endToken = Math.min(Math.max(Number.isFinite(rawEnd) ? rawEnd : count - 1, startToken), count - 1);
  return { startToken, endToken };
}

function normalizeCustomDua(record, kind) {
  const id = String(record?.id || makeId(kind)).trim();
  const rawBody = String(record?.body || record?.requestText || '').trim();
  const sourceSnapshot = normalizeSourceSnapshot(record?.originalSource || record?.sourceSnapshot);
  const protectedSelection = normalizeProtectedSelection(record?.protectedSelection || record?.sourceSelection, sourceSnapshot);
  const legacyArabic = sourceSnapshot ? sliceTextBySelection(sourcePlainArabicFromSnapshot(sourceSnapshot), protectedSelection) : '';
  const arabicText = String(record?.arabicText || record?.editableArabic || record?.arabic || legacyArabic || '').trim();
  const englishText = String(record?.englishText || record?.english || record?.sourceEnglish || (sourceSnapshot ? rawBody : '') || '').trim();
  const body = sourceSnapshot ? (englishText || rawBody || arabicText) : rawBody;
  const english = englishText;
  const transliteration = String(record?.transliteration || record?.sourceTransliteration || sourceSnapshot?.transliteration || '').trim();
  const phraseSegmentIds = Array.isArray(record?.phraseSegmentIds) ? record.phraseSegmentIds.map((id) => String(id)).filter(Boolean) : [];
  const autoEnglish = String(record?.autoEnglish || '').trim();
  const englishEdited = Boolean(record?.englishEdited ?? (autoEnglish && english && english !== autoEnglish));
  return {
    id,
    kind,
    title: String(record?.title || (kind === 'requested' ? 'Requested dua' : 'Personal dua')).trim(),
    body,
    segments: sourceSnapshot ? [] : normalizeBodySegments(record?.segments || record?.bodySegments, body),
    arabicText,
    englishText,
    english,
    transliteration,
    protectedSelection,
    phraseSegmentIds,
    autoEnglish,
    englishEdited,
    note: String(record?.note || '').trim(),
    requestedBy: kind === 'requested' ? String(record?.requestedBy || '').trim() : '',
    categoryId: String(record?.categoryId || (kind === 'requested' ? REQUESTED_CATEGORY : NEEDS_CATEGORY)),
    sourceSnapshot,
    originalSource: sourceSnapshot,
    createdAt: record?.createdAt || nowIso(),
    updatedAt: record?.updatedAt || record?.createdAt || nowIso(),
  };
}

function createMigrationBackup(reason, rawUserData = '') {
  const backup = {
    app: 'Hajj Dua Companion',
    reason,
    createdAt: nowIso(),
    userDataRaw: rawUserData,
    legacy: {
      savedDuaCategories: localStorage.getItem('savedDuaCategories'),
      savedDuas: localStorage.getItem('savedDuas'),
      fontScale: localStorage.getItem('fontScale'),
      tajweedColours: localStorage.getItem('tajweedColours'),
    },
  };
  try {
    const stamp = backup.createdAt.replace(/[:.]/g, '-');
    localStorage.setItem(`${MIGRATION_BACKUP_KEY}:${stamp}`, JSON.stringify(backup));
    localStorage.setItem(MIGRATION_BACKUP_KEY, JSON.stringify(backup));
  } catch (error) {
    console.warn('Could not write migration backup', error);
  }
}

function normalizeUserData(input = {}) {
  const seeded = seedCategories();
  const incomingCategories = Array.isArray(input.categories) && input.categories.length
    ? input.categories.map((category) => normalizeCategory(category)).filter(Boolean)
    : seeded;
  const categoryMap = new Map();
  incomingCategories.forEach((category) => categoryMap.set(category.id, category));
  protectedCategories().forEach((category) => categoryMap.set(category.id, normalizeCategory(category)));
  const categories = Array.from(categoryMap.values());
  const validCategoryIds = new Set(categories.map((category) => category.id));
  const savedAppDuas = {};
  Object.entries(input.savedAppDuas || input.savedCategories || {}).forEach(([id, value]) => {
    const record = normalizeSavedRecord(value);
    if (!validCategoryIds.has(record.categoryId)) record.categoryId = NEEDS_CATEGORY;
    savedAppDuas[id] = record;
  });
  const customDuas = (Array.isArray(input.customDuas) ? input.customDuas : []).map((record) => normalizeCustomDua(record, 'personal'));
  const requestedDuas = (Array.isArray(input.requestedDuas) ? input.requestedDuas : []).map((record) => normalizeCustomDua(record, 'requested'));
  [...customDuas, ...requestedDuas].forEach((record) => {
    if (!validCategoryIds.has(record.categoryId)) record.categoryId = NEEDS_CATEGORY;
  });
  return {
    version: USER_DATA_VERSION,
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso(),
    settings: normalizeSettings(input.settings || {}),
    categories,
    savedAppDuas,
    customDuas,
    requestedDuas,
    reading: normalizeReadingState(input.reading || {}),
    migration: input.migration || {},
  };
}

function normalizeReadingState(reading = {}) {
  const positions = reading.positions && typeof reading.positions === 'object' ? reading.positions : {};
  return {
    last: normalizeReadingPosition(reading.last),
    positions: Object.fromEntries(
      Object.entries(positions)
        .map(([key, value]) => [key, normalizeReadingPosition(value)])
        .filter(([, value]) => value)
    ),
  };
}

function normalizeReadingPosition(value) {
  if (!value || typeof value !== 'object') return null;
  const contextKey = String(value.contextKey || '').trim();
  const targetId = String(value.targetId || '').trim();
  if (!contextKey || !targetId) return null;
  return {
    contextKey,
    targetId,
    view: ['hajj', 'collections', 'library', 'saved', 'more'].includes(value.view) ? value.view : 'hajj',
    moment: String(value.moment || '').trim(),
    collection: String(value.collection || '').trim(),
    category: String(value.category || 'All').trim() || 'All',
    tier: String(value.tier || 'All').trim() || 'All',
    savedFilter: String(value.savedFilter || 'all').trim() || 'all',
    query: String(value.query || '').trim(),
    scrollY: Number.isFinite(Number(value.scrollY)) ? Number(value.scrollY) : 0,
    updatedAt: value.updatedAt || nowIso(),
  };
}

function createUserDataFromLegacy() {
  const legacyMap = readStoredJson('savedDuaCategories', {});
  const legacySaved = readStoredJson('savedDuas', []);
  const savedAppDuas = {};
  if (legacyMap && typeof legacyMap === 'object') {
    Object.entries(legacyMap).forEach(([id, categoryId]) => {
      savedAppDuas[id] = normalizeSavedRecord(String(categoryId || NEEDS_CATEGORY));
    });
  }
  if (Array.isArray(legacySaved)) {
    legacySaved.forEach((id) => {
      if (!savedAppDuas[id]) savedAppDuas[id] = normalizeSavedRecord(NEEDS_CATEGORY);
    });
  }
  return normalizeUserData({
    settings: defaultSettings(),
    savedAppDuas,
    migration: { from: 'legacy-localStorage', at: nowIso() },
  });
}

function loadUserData() {
  const raw = localStorage.getItem(USER_DATA_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Number(parsed?.version || 1) < USER_DATA_VERSION) createMigrationBackup('before-user-data-v6-migration', raw);
      const normalized = normalizeUserData(parsed);
      state.userData = normalized;
      persistUserData(false);
      return normalized;
    } catch (error) {
      createMigrationBackup('invalid-current-user-data', raw);
      setStorageNotice('Saved data looked damaged, so a local backup was kept and legacy saved data was used where available.', true);
    }
  } else if (localStorage.getItem('savedDuaCategories') || localStorage.getItem('savedDuas') || localStorage.getItem('fontScale') || localStorage.getItem('tajweedColours')) {
    createMigrationBackup('before-versioned-user-data-migration');
  }
  const migrated = createUserDataFromLegacy();
  state.userData = migrated;
  persistUserData(false);
  return migrated;
}

function flattenSavedCategories() {
  return Object.fromEntries(Object.entries(state.userData.savedAppDuas).map(([id, record]) => [id, record.categoryId]));
}

function persistUserData(showSuccess = true) {
  if (!state.userData) return false;
  state.userData.updatedAt = nowIso();
  const payload = JSON.stringify(state.userData);
  try {
    localStorage.setItem(USER_DATA_KEY, payload);
    const roundTrip = JSON.parse(localStorage.getItem(USER_DATA_KEY) || '{}');
    if (roundTrip.version !== USER_DATA_VERSION) throw new Error('Saved data read-back failed');
  } catch (error) {
    console.error('Could not save user data', error);
    setStorageNotice('Saved changes could not be written on this device. Please export a backup before closing the app.', true);
    return false;
  }
  try {
    localStorage.setItem('savedDuaCategories', JSON.stringify(flattenSavedCategories()));
    localStorage.setItem('fontScale', String(state.userData.settings.fontScale));
    localStorage.setItem('tajweedColours', state.userData.settings.tajweed ? '1' : '0');
  } catch {
    // Compatibility snapshots are not the source of truth.
  }
  if (showSuccess) setStorageNotice('Saved on this device.');
  return true;
}

function saveState() {
  state.userData.settings.fontScale = state.fontScale;
  state.userData.settings.tajweed = state.tajweed;
  return persistUserData();
}

function userCategories() {
  return state.userData?.categories || [];
}

function saveCategoryById(id) {
  return userCategories().find((category) => category.id === id) || userCategories().find((category) => category.id === NEEDS_CATEGORY);
}

function saveCategoryLabel(id) {
  return saveCategoryById(id)?.title || 'Needs category';
}

function isSaved(id) {
  return Boolean(state.userData.savedAppDuas[id]);
}

function savedRecord(id) {
  return state.userData.savedAppDuas[id] || null;
}

function applyFontScale() {
  document.documentElement.style.setProperty('--arabic-scale', state.fontScale.toFixed(2));
}

function ensureReadingState() {
  if (!state.userData.reading) state.userData.reading = { last: null, positions: {} };
  if (!state.userData.reading.positions) state.userData.reading.positions = {};
  return state.userData.reading;
}

function currentContextSnapshot() {
  return {
    view: state.view,
    moment: state.moment,
    collection: state.collection,
    category: state.category,
    tier: state.tier,
    savedFilter: state.savedFilter,
    query: state.query,
  };
}

function readingContextKey(snapshot = currentContextSnapshot()) {
  if (snapshot.view === 'hajj') return `hajj:${snapshot.moment}:${snapshot.query}`;
  if (snapshot.view === 'collections') return `collections:${snapshot.collection}:${snapshot.query}`;
  if (snapshot.view === 'library') return `library:${snapshot.category}:${snapshot.tier}:${snapshot.query}`;
  if (snapshot.view === 'saved') return `saved:${snapshot.savedFilter}:${snapshot.query}`;
  if (snapshot.view === 'more') return `more:appendix:${snapshot.query}`;
  return `view:${snapshot.view}:${snapshot.query}`;
}

function activeListElement() {
  if (state.view === 'hajj') return $('hajjList');
  if (state.view === 'collections') return $('collectionList');
  if (state.view === 'library') return $('libraryList');
  if (state.view === 'saved') return $('savedList');
  if (state.view === 'more') return $('appendixList');
  return null;
}

function readingIdFromElement(element) {
  return element?.dataset?.readingId || '';
}

function mostVisibleReadingCard() {
  const list = activeListElement();
  if (!list) return null;
  const cards = [...list.querySelectorAll('[data-reading-id]')];
  let best = null;
  let bestVisible = 0;
  const viewportTop = 78;
  const viewportBottom = window.innerHeight - 92;
  cards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    const visible = Math.max(0, Math.min(rect.bottom, viewportBottom) - Math.max(rect.top, viewportTop));
    if (visible > bestVisible) {
      best = card;
      bestVisible = visible;
    }
  });
  return best;
}

function saveReadingPosition(targetId = '') {
  if (!state.userData || state.suppressReadingCapture) return;
  const card = targetId ? null : mostVisibleReadingCard();
  const id = targetId || readingIdFromElement(card);
  if (!id) return;
  const snapshot = currentContextSnapshot();
  const contextKey = readingContextKey(snapshot);
  const position = {
    ...snapshot,
    contextKey,
    targetId: id,
    scrollY: Math.max(0, window.scrollY || 0),
    updatedAt: nowIso(),
  };
  const reading = ensureReadingState();
  reading.positions[contextKey] = position;
  reading.last = position;
  persistUserData(false);
  renderContinuePrompt();
}

function scheduleReadingCapture(targetId = '') {
  window.clearTimeout(state.readingSaveTimer);
  state.readingSaveTimer = window.setTimeout(() => saveReadingPosition(targetId), targetId ? 0 : 350);
}

function readingLabel(position) {
  if (!position) return 'Continue where you left off';
  if (position.view === 'hajj') return `Continue: ${position.moment || 'Hajj'}`;
  if (position.view === 'collections') {
    const collection = state.data?.collections?.find((item) => item.id === position.collection);
    return `Continue: ${collection?.title || 'Collections'}`;
  }
  if (position.view === 'library') return 'Continue: Library';
  if (position.view === 'saved') return `Continue: ${saveCategoryLabel(position.savedFilter) || 'Saved'}`;
  if (position.view === 'more') return 'Continue: Appendix';
  return 'Continue where you left off';
}

function applyReadingContext(position) {
  if (!position) return;
  state.view = position.view || state.view;
  state.moment = position.moment || state.moment;
  state.collection = position.collection || state.collection;
  state.category = position.category || state.category;
  state.tier = position.tier || state.tier;
  state.savedFilter = position.savedFilter || state.savedFilter;
  state.query = position.query || '';
  if ($('searchInput')) $('searchInput').value = state.query;
  const band = document.querySelector('.search-band');
  if (band) {
    band.classList.toggle('search-open', Boolean(state.query));
    $('searchToggle')?.setAttribute('aria-expanded', String(Boolean(state.query)));
  }
}

function findReadingElement(targetId) {
  const activeList = activeListElement();
  const activeTarget = activeList
    ? [...activeList.querySelectorAll('[data-reading-id]')].find((element) => element.dataset.readingId === targetId)
    : null;
  if (activeTarget) return activeTarget;
  return [...document.querySelectorAll('[data-reading-id]')].find((element) => element.dataset.readingId === targetId) || null;
}

function scrollToReadingPosition(position, smooth = false) {
  if (!position?.targetId) return;
  window.clearTimeout(state.restoreTimer);
  const attemptScroll = (attempt = 0) => {
    const target = findReadingElement(position.targetId);
    if (target) target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
    else if (Number.isFinite(Number(position.scrollY))) window.scrollTo({ top: Number(position.scrollY), behavior: smooth ? 'smooth' : 'auto' });
    if (attempt < 3) {
      window.clearTimeout(state.restoreTimer);
      state.restoreTimer = window.setTimeout(() => attemptScroll(attempt + 1), 140);
    }
  };
  state.restoreTimer = window.setTimeout(() => attemptScroll(0), 80);
}

function restoreReadingForCurrentContext() {
  const reading = ensureReadingState();
  const position = reading.positions[readingContextKey()];
  if (position) scrollToReadingPosition(position);
}

function restoreLastReadingContext() {
  const position = state.userData?.reading?.last;
  if (!position) return;
  applyReadingContext(position);
}

function latestOtherReadingPosition() {
  const reading = ensureReadingState();
  const currentKey = readingContextKey();
  return Object.values(reading.positions || {})
    .filter((position) => position && position.contextKey && position.contextKey !== currentKey)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
}

function readingPositionByContext(contextKey = '') {
  if (!contextKey) return null;
  return ensureReadingState().positions?.[contextKey] || null;
}

function renderContinuePrompt() {
  const band = $('continueBand');
  const button = $('continueButton');
  if (!band || !button || !state.userData?.reading) return;
  const last = state.userData.reading.last;
  let position = last?.contextKey && last.contextKey !== readingContextKey() ? last : null;
  if (!position && ['saved', 'more'].includes(state.view)) position = latestOtherReadingPosition();
  const show = Boolean(position);
  band.hidden = !show;
  button.dataset.continueContext = position?.contextKey || '';
  if (show) button.textContent = readingLabel(position);
}

function continueLastReading() {
  const position = readingPositionByContext($('continueButton')?.dataset.continueContext) || latestOtherReadingPosition() || state.userData?.reading?.last;
  if (!position) return;
  applyReadingContext(position);
  render({ restore: false });
  scrollToReadingPosition(position, true);
}

function tierClass(tier) {
  if (tier === 'Qur’an') return 'quran';
  if (tier === 'Companion report / Athar') return 'athar';
  if (tier === 'Practical guidance') return 'guidance';
  if (tier === 'Needs verification') return 'needs';
  if (tier === 'Devotional/appendix') return 'appendix';
  return '';
}

function matchesTextQuery(values) {
  if (!state.query) return true;
  const query = state.query.toLowerCase();
  return values.some((value) => String(value || '').toLowerCase().includes(query));
}

function matchesQuery(item) {
  if (!state.query) return true;
  return item.search_text.includes(state.query.toLowerCase()) || (item.arabic_normalized || '').includes(state.query);
}

function visibleEntries({ appendix = false, includeCollectionOnly = false } = {}) {
  const entries = state.data.entries.filter((item) => appendix ? item.appendix_only : (!item.appendix_only && (includeCollectionOnly || !item.collection_only)));
  return entries.filter(matchesQuery).sort((a, b) => a.sort_rank - b.sort_rank || a.title.localeCompare(b.title));
}

function savedItems() {
  const appItems = state.data.entries
    .filter((item) => isSaved(item.id))
    .map((item) => ({ type: 'app', id: item.id, item, categoryId: savedRecord(item.id).categoryId, updatedAt: savedRecord(item.id).updatedAt, title: item.title }));
  const personalItems = state.userData.customDuas.map((record) => ({ type: 'personal', id: record.id, record, categoryId: record.categoryId, updatedAt: record.updatedAt, title: record.title }));
  const requestedItems = state.userData.requestedDuas.map((record) => ({ type: 'requested', id: record.id, record, categoryId: record.categoryId, updatedAt: record.updatedAt, title: record.title }));
  return [...appItems, ...personalItems, ...requestedItems]
    .filter((entry) => state.savedFilter === 'all' || entry.categoryId === state.savedFilter)
    .filter((entry) => {
      if (entry.type === 'app') return matchesQuery(entry.item);
      return matchesTextQuery([entry.record.title, entry.record.body, entry.record.english, entry.record.transliteration, entry.record.note, entry.record.requestedBy, saveCategoryLabel(entry.categoryId)]);
    })
    .sort((a, b) => {
      const categoryCompare = saveCategoryLabel(a.categoryId).localeCompare(saveCategoryLabel(b.categoryId));
      return categoryCompare || String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.title.localeCompare(b.title);
    });
}

function savedCategoryCounts() {
  const counts = { all: 0 };
  userCategories().forEach((category) => { counts[category.id] = 0; });
  Object.values(state.userData.savedAppDuas).forEach((record) => {
    counts.all += 1;
    counts[record.categoryId] = (counts[record.categoryId] || 0) + 1;
  });
  [...state.userData.customDuas, ...state.userData.requestedDuas].forEach((record) => {
    counts.all += 1;
    counts[record.categoryId] = (counts[record.categoryId] || 0) + 1;
  });
  return counts;
}

function selectedCollection() {
  return state.data.collections.find((collection) => collection.id === state.collection) || state.data.collections[0];
}

function collectionEntries() {
  const collection = selectedCollection();
  const ids = new Set(collection.entry_ids);
  const order = new Map(collection.entry_ids.map((id, index) => [id, index]));
  return state.data.entries
    .filter((item) => ids.has(item.id))
    .filter(matchesQuery)
    .sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999) || a.sort_rank - b.sort_rank || a.title.localeCompare(b.title));
}

function arabicBlock(item) {
  const quranArabic = item.arabic_qpc_hafs || item.dua_arabic || item.arabic;
  const regularArabic = item.dua_arabic || item.arabic;
  const useTajweed = state.tajweed && item.arabic_tajweed_html;
  const arabicText = useTajweed ? item.arabic_tajweed_html : (item.arabic_uthmani ? quranArabic : regularArabic);
  if (!arabicText) return '';
  const arabicClass = item.arabic_uthmani ? 'arabic uthmani' : 'arabic';
  const tajweedClass = useTajweed ? ' tajweed-colors' : '';
  return `<p class="${arabicClass}${tajweedClass}" lang="ar" dir="rtl">${useTajweed ? arabicText : esc(arabicText)}</p>`;
}

function sourceSnapshotFromItem(item) {
  if (!item) return null;
  const isQuran = item.authenticity_tier === 'Qur’an' || Boolean(item.arabic_uthmani);
  return {
    sourceId: item.id,
    title: item.title,
    sourceLabel: item.source_kind || item.authenticity_tier,
    sourceRef: item.sunnah_reference || item.source_ref || '',
    arabic: item.dua_arabic || item.arabic_qpc_hafs || item.arabic || '',
    arabicQpcHafs: item.arabic_qpc_hafs || '',
    arabicTajweedHtml: isQuran ? (item.arabic_tajweed_html || '') : '',
    isQuran,
    transliteration: item.dua_transliteration || item.transliteration || '',
    meaning: item.dua_meaning || item.meaning || '',
    phraseSegments: normalizePhraseSegments(item.phrase_segments || item.phraseSegments || []),
  };
}

function sourceItemForSnapshot(snapshot) {
  if (!snapshot?.sourceId || !state.data?.entries) return null;
  return state.data.entries.find((item) => item.id === snapshot.sourceId) || null;
}

function sliceTextBySelection(text = '', selection = null) {
  const tokens = sourceTokensFromText(text);
  if (!tokens.length) return '';
  const normalized = normalizeProtectedSelection(selection, { arabic: text });
  if (!normalized) return text;
  return tokens.slice(normalized.startToken, normalized.endToken + 1).join(' ');
}

function sourceArabicParts(snapshot, selection = null) {
  const normalized = normalizeSourceSnapshot(snapshot);
  if (!normalized) return null;
  const sourceItem = sourceItemForSnapshot(normalized);
  const isQuran = normalized.isQuran && Boolean(sourceItem?.arabic_tajweed_html || sourceItem?.arabic_uthmani || normalized.arabicQpcHafs);
  const plainArabic = isQuran
    ? (sourceItem?.arabic_qpc_hafs || normalized.arabicQpcHafs || normalized.arabic)
    : (sourceItem?.dua_arabic || normalized.arabic);
  const tajweedHtml = isQuran ? (sourceItem?.arabic_tajweed_html || normalized.arabicTajweedHtml || '') : '';
  const protectedSelection = normalizeProtectedSelection(selection, { ...normalized, arabic: plainArabic, arabicQpcHafs: isQuran ? plainArabic : '' });
  const useTajweed = isQuran && state.tajweed && Boolean(tajweedHtml);
  const arabicText = useTajweed
    ? sliceTextBySelection(tajweedHtml, protectedSelection)
    : sliceTextBySelection(plainArabic, protectedSelection);
  return {
    normalized,
    sourceItem,
    isQuran,
    useTajweed,
    arabicText,
    arabicClass: isQuran ? 'arabic uthmani' : 'arabic',
    tajweedClass: useTajweed ? ' tajweed-colors' : '',
    selection: protectedSelection,
    count: sourceTokensFromText(plainArabic).length,
  };
}

function protectedArabicBlock(snapshot, selection = null, compact = false) {
  const parts = sourceArabicParts(snapshot, selection);
  if (!parts?.arabicText) return '';
  const compactClass = compact ? ' compact-arabic' : '';
  return `<p class="${parts.arabicClass}${parts.tajweedClass}${compactClass}" lang="ar" dir="rtl">${parts.useTajweed ? parts.arabicText : esc(parts.arabicText)}</p>`;
}

function isPersonalisedRecord(record) {
  return Boolean(record?.originalSource || record?.sourceSnapshot);
}

function renderPersonalisedRecord(record, compact = false) {
  const snapshot = normalizeSourceSnapshot(record?.originalSource || record?.sourceSnapshot);
  if (!snapshot) return '';
  const arabicText = String(record?.arabicText || '').trim();
  const englishText = String(record?.englishText || record?.english || record?.body || '').trim();
  return `<section class="source-snapshot personalised-source ${compact ? 'compact' : ''}">
    <p class="card-subtitle">Personal wording</p>
    ${arabicText ? `<p class="arabic custom-arabic" lang="ar" dir="rtl">${esc(arabicText).replace(/\n/g, '<br>')}</p>` : ''}
    ${record.transliteration ? `<p class="translit">${esc(record.transliteration).replace(/\n/g, '<br>')}</p>` : ''}
    ${englishText ? `<p class="meaning source-meaning">${esc(englishText).replace(/\n/g, '<br>')}</p>` : ''}
    <details>
      <summary>Original verified source</summary>
      ${sourceSnapshotBlock(snapshot, true)}
      <p class="custom-meta">The text above is your personal wording. Use the original source here to check verified Qur’an/Sunnah wording when needed.</p>
    </details>
  </section>`;
}

function sourceSnapshotBlock(snapshot, compact = false) {
  const normalized = normalizeSourceSnapshot(snapshot);
  if (!normalized) return '';
  const sourceItem = sourceItemForSnapshot(normalized);
  const isQuran = normalized.isQuran && Boolean(sourceItem?.arabic_tajweed_html || sourceItem?.arabic_uthmani || normalized.arabicQpcHafs);
  const useTajweed = isQuran && state.tajweed && Boolean(sourceItem?.arabic_tajweed_html);
  const arabicText = useTajweed
    ? sourceItem.arabic_tajweed_html
    : (sourceItem?.arabic_qpc_hafs || normalized.arabicQpcHafs || normalized.arabic);
  const arabicClass = isQuran ? 'arabic uthmani' : 'arabic';
  const tajweedClass = useTajweed ? ' tajweed-colors' : '';
  return `<section class="source-snapshot ${compact ? 'compact' : ''}">
    <p class="card-subtitle">Original verified source${normalized.sourceLabel ? ` · ${esc(normalized.sourceLabel)}` : ''}</p>
    ${normalized.title ? `<p class="card-title">${esc(normalized.title)}</p>` : ''}
    ${arabicText ? `<p class="${arabicClass}${tajweedClass}" lang="ar" dir="rtl">${useTajweed ? arabicText : esc(arabicText)}</p>` : ''}
    ${normalized.transliteration ? `<p class="translit">${esc(normalized.transliteration)}</p>` : ''}
    ${normalized.meaning ? `<p class="meaning source-meaning">${esc(normalized.meaning)}</p>` : ''}
    ${normalized.sourceRef ? `<p class="custom-meta">${esc(normalized.sourceRef)}</p>` : ''}
  </section>`;
}

function textBlock(value, className = 'meaning') {
  if (!value) return '';
  return `<p class="${className}" dir="auto">${esc(value).replace(/\n/g, '<br>')}</p>`;
}

function renderCustomSegments(record) {
  const segments = normalizeBodySegments(record?.segments, record?.body || '');
  if (!segments.length) return '';
  return `<div class="custom-body">${segments.map((segment) => {
    if (segment.type === 'arabic') {
      return `<p class="arabic custom-arabic" lang="ar" dir="rtl">${esc(segment.text).replace(/\n/g, '<br>')}</p>`;
    }
    return `<p class="meaning custom-text" dir="auto">${esc(segment.text).replace(/\n/g, '<br>')}</p>`;
  }).join('')}</div>`;
}

function statusBadges(item) {
  const badges = [
    `<span class="badge ${tierClass(item.authenticity_tier)}">${esc(item.authenticity_tier)}</span>`,
    `<span class="badge">Source: ${esc(item.source_kind || item.authenticity_tier)}</span>`,
  ];
  if (item.fixed_text_status === 'open_dua_moment') badges.push('<span class="badge open">Open dua moment</span>');
  return badges.join('');
}

function card(item) {
  const saved = isSaved(item.id);
  const record = savedRecord(item.id);
  const savedCategory = record?.categoryId;
  const tags = [item.category, item.hajj_moment, ...(item.tags || []), ...(item.collections || []).map((id) => state.data.collections.find((collection) => collection.id === id)?.title).filter(Boolean)].filter(Boolean);
  const transliteration = item.dua_transliteration || item.transliteration;
  const meaning = item.dua_meaning || item.meaning;
  const pageText = item.source_pdf_page ? ` · p. ${esc(item.source_pdf_page)}` : '';
  const sourceLabel = item.source_kind || item.authenticity_tier;
  const saveAction = `<button class="save ${saved ? 'saved' : ''}" data-save="${esc(item.id)}" type="button" aria-label="${saved ? 'Change saved category' : 'Save dua'}">${saved ? `Saved: ${esc(saveCategoryLabel(savedCategory))}` : 'Save'}</button>`;
  const removeAction = `<button class="remove-saved" data-remove-saved="${esc(item.id)}" type="button">Remove from Saved</button>`;
  const personaliseAction = `<button class="quiet-button secondary-action" data-personalise="${esc(item.id)}" type="button">Personalise</button>`;
  const actions = state.view === 'saved' && saved
    ? `${removeAction}${personaliseAction}<button class="quiet-button" data-focus="${esc(item.id)}" type="button">Focus</button>`
    : `${saveAction}${personaliseAction}<button class="quiet-button" data-focus="${esc(item.id)}" type="button">Focus</button>`;
  return `<article class="dua-card" data-id="${esc(item.id)}" data-reading-id="${esc(item.id)}">
    <div class="card-head">
      <div>
        <p class="card-title">${esc(item.title)}</p>
        <p class="card-subtitle">${esc(sourceLabel)}${saved ? ` · Saved in ${esc(saveCategoryLabel(savedCategory))}` : ''}</p>
      </div>
      <div class="badges">${statusBadges(item)}</div>
    </div>
    ${item.fixed_text_status === 'open_dua_moment' ? '<p class="open-note">Open dua moment: no fixed wording is being prescribed here.</p>' : ''}
    ${arabicBlock(item)}
    ${item.arabic_omitted_note ? `<p class="omitted-note">${esc(item.arabic_omitted_note)}</p>` : ''}
    ${transliteration ? `<p class="translit">${esc(transliteration)}</p>` : ''}
    <p class="meaning">${esc(meaning)}</p>
    ${item.narration_context ? `<details><summary>Narration/context</summary><p class="context">${esc(item.narration_context)}</p></details>` : ''}
    <details>
      <summary>Source and tags</summary>
      <div class="source-lines">
      <p>${esc(item.source_ref)}</p>
      ${item.sunnah_reference ? `<p>Sunnah reference: ${esc(item.sunnah_reference)}</p>` : ''}
      <p>${esc(item.source_document)} · ${esc(item.source_section)}${pageText}</p>
      <p>Arabic source: ${esc(item.arabic_source)}</p>
      </div>
      <div class="tag-list">${tags.map((tag) => `<span class="badge">${esc(tag)}</span>`).join('')}</div>
    </details>
    <div class="card-actions">${actions}</div>
  </article>`;
}

function customSavedCard(entry) {
  const record = entry.record;
  const isRequested = entry.type === 'requested';
  const personalised = isPersonalisedRecord(record);
  return `<article class="dua-card custom-card" data-custom-id="${esc(record.id)}" data-reading-id="${esc(entry.type)}:${esc(record.id)}">
    <div class="card-head">
      <p class="card-title">${esc(record.title)}</p>
      <div class="badges"><span class="badge guidance">${isRequested ? 'Requested dua' : 'Personal dua'}</span></div>
    </div>
    <div class="badges">
      <span class="badge">Saved in: ${esc(saveCategoryLabel(record.categoryId))}</span>
    </div>
    ${isRequested && record.requestedBy ? `<p class="custom-meta"><strong>Requested by:</strong> ${esc(record.requestedBy)}</p>` : ''}
    ${personalised ? renderPersonalisedRecord(record) : (record.sourceSnapshot ? sourceSnapshotBlock(record.sourceSnapshot) : '')}
    ${personalised ? '' : renderCustomSegments(record)}
    ${record.note ? `<details><summary>Personal note</summary>${textBlock(record.note, 'context')}</details>` : ''}
    <div class="card-actions">
      <button class="remove-saved" data-custom-delete="${esc(entry.type)}:${esc(record.id)}" type="button">${isRequested ? 'Delete requested dua' : 'Delete personal dua'}</button>
      <button class="quiet-button" data-custom-edit="${esc(entry.type)}:${esc(record.id)}" type="button">Edit</button>
    </div>
  </article>`;
}

function renderList(target, items) {
  const emptyText = state.view === 'hajj'
    ? 'No fixed wording found in the verified main data for this moment. Keep making personal dua and dhikr.'
    : 'No duas found.';
  $(target).innerHTML = items.length ? items.map((item) => card(item)).join('') : `<p class="empty">${emptyText}</p>`;
}

function renderMoments() {
  const entries = visibleEntries();
  $('momentGrid').innerHTML = state.data.hajj_moments.map((moment) => {
    const count = entries.filter((item) => item.hajj_moment === moment).length;
    return `<button class="moment ${state.moment === moment ? 'active' : ''}" data-moment="${esc(moment)}" type="button">
      <strong>${esc(moment)}</strong><span>${count} duas</span>
    </button>`;
  }).join('');
}

function renderHajj() {
  renderMoments();
  $('viewTitle').textContent = state.moment;
  const items = visibleEntries().filter((item) => item.hajj_moment === state.moment);
  renderList('hajjList', items);
}

function renderLibrary() {
  let items = visibleEntries();
  if (state.category !== 'All') items = items.filter((item) => item.category === state.category);
  if (state.tier !== 'All') items = items.filter((item) => item.authenticity_tier === state.tier);
  renderList('libraryList', items);
}

function renderCollections() {
  $('collectionGrid').innerHTML = state.data.collections.map((collection) => {
    const ids = new Set(collection.entry_ids);
    const count = state.data.entries.filter((item) => ids.has(item.id) && matchesQuery(item)).length;
    return `<button class="collection-card ${state.collection === collection.id ? 'active' : ''}" data-collection="${esc(collection.id)}" type="button">
      <strong>${esc(collection.title)}</strong><span>${count} duas</span>
    </button>`;
  }).join('');
  const collection = selectedCollection();
  $('collectionTitle').textContent = collection.title;
  renderList('collectionList', collectionEntries());
}

function renderSavedFilters() {
  const counts = savedCategoryCounts();
  const options = [
    { id: 'all', title: 'All saved', count: counts.all },
    ...userCategories().map((category) => ({ id: category.id, title: category.title, count: counts[category.id] || 0 })),
  ];
  if (!options.some((option) => option.id === state.savedFilter)) state.savedFilter = 'all';
  $('savedCategoryFilters').innerHTML = options.map((option) => `
    <button class="saved-filter ${state.savedFilter === option.id ? 'active' : ''}" data-saved-filter="${esc(option.id)}" type="button">
      <strong>${esc(option.title)}</strong><span>${option.count} saved</span>
    </button>
  `).join('');
}

function renderCategoryManager() {
  $('categoryManager').innerHTML = userCategories().map((category) => {
    if (category.protected) {
      return `<div class="category-row protected">
        <span class="category-row-title"><strong>${esc(category.title)}</strong><span>${esc(category.description)} Protected category.</span></span>
      </div>`;
    }
    return `<div class="category-row" data-category-row="${esc(category.id)}">
      <input data-category-title="${esc(category.id)}" type="text" value="${esc(category.title)}" aria-label="Category name">
      <button data-category-move="${esc(category.id)}:up" type="button" aria-label="Move category up">Up</button>
      <button data-category-move="${esc(category.id)}:down" type="button" aria-label="Move category down">Down</button>
      <button data-category-update="${esc(category.id)}" type="button">Rename</button>
      <button class="danger-button" data-category-delete="${esc(category.id)}" type="button">Remove</button>
    </div>`;
  }).join('');
  setStorageNotice(state.storageNotice);
}

function renderSaved() {
  renderSavedFilters();
  renderCategoryManager();
  const entries = savedItems();
  $('savedList').innerHTML = entries.length
    ? entries.map((entry) => entry.type === 'app' ? card(entry.item) : customSavedCard(entry)).join('')
    : '<p class="empty">No saved duas yet. Save duas from the app or add your own personal/requested dua.</p>';
}

function renderAppendix() {
  renderList('appendixList', visibleEntries({ appendix: true }));
}

function render(options = {}) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === state.view));
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active-view'));
  $(`${state.view}View`).classList.add('active-view');
  if ($('categoryFilter')) $('categoryFilter').value = state.category;
  if ($('tierFilter')) $('tierFilter').value = state.tier;
  renderHajj();
  renderCollections();
  renderLibrary();
  renderSaved();
  renderAppendix();
  renderContinuePrompt();
  if (options.restore) restoreReadingForCurrentContext();
}

function openFocus(id) {
  const lists = {
    hajj: visibleEntries().filter((item) => item.hajj_moment === state.moment),
    collections: collectionEntries(),
    library: visibleEntries().filter((item) => (state.category === 'All' || item.category === state.category) && (state.tier === 'All' || item.authenticity_tier === state.tier)),
    saved: savedItems().filter((entry) => entry.type === 'app').map((entry) => entry.item),
    more: visibleEntries({ appendix: true }),
  };
  state.focusItems = lists[state.view] || [];
  state.focusIndex = Math.max(0, state.focusItems.findIndex((item) => item.id === id));
  renderFocus();
  $('focusDialog').showModal();
}

function renderFocus() {
  const item = state.focusItems[state.focusIndex];
  if (!item) return;
  const transliteration = item.dua_transliteration || item.transliteration;
  const meaning = item.dua_meaning || item.meaning;
  const record = savedRecord(item.id);
  const savedCategory = record?.categoryId;
  $('focusSave').textContent = savedCategory ? `Saved: ${saveCategoryLabel(savedCategory)}` : 'Save';
  $('focusContent').innerHTML = `
    <div>
      <p class="card-title">${esc(item.title)}</p>
      <p class="card-subtitle">${esc(item.source_kind || item.authenticity_tier)}${savedCategory ? ` · Saved in ${esc(saveCategoryLabel(savedCategory))}` : ''}</p>
    </div>
    <div class="badges">${statusBadges(item)}</div>
    ${item.fixed_text_status === 'open_dua_moment' ? '<p class="open-note">Open dua moment: no fixed wording is being prescribed here.</p>' : ''}
    ${arabicBlock(item)}
    ${item.arabic_omitted_note ? `<p class="omitted-note">${esc(item.arabic_omitted_note)}</p>` : ''}
    ${transliteration ? `<p class="translit">${esc(transliteration)}</p>` : ''}
    <p class="meaning">${esc(meaning)}</p>
    ${item.narration_context ? `<details><summary>Narration/context</summary><p class="context">${esc(item.narration_context)}</p></details>` : ''}
    <p class="card-title">${esc(item.sunnah_reference || item.source_ref)}</p>`;
}

function openSaveDialog(id) {
  const item = state.data.entries.find((entry) => entry.id === id);
  if (!item) return;
  state.pendingSaveId = id;
  state.pendingSaveCategory = savedRecord(id)?.categoryId || userCategories().find((category) => !category.protected)?.id || REQUESTED_CATEGORY;
  $('saveDialogTitle').textContent = item.title;
  renderSaveDialogCategories();
  $('saveDialog').showModal();
}

function renderSaveDialogCategories() {
  $('saveCategoryGrid').innerHTML = userCategories().map((category) => `
    <button class="save-category ${state.pendingSaveCategory === category.id ? 'active' : ''}" data-save-category="${esc(category.id)}" type="button">
      <strong>${esc(category.title)}</strong><span>${esc(category.description)}</span>
    </button>
  `).join('');
  $('saveConfirm').disabled = !state.pendingSaveCategory;
  $('saveConfirm').textContent = state.pendingSaveCategory
    ? `Save in ${saveCategoryLabel(state.pendingSaveCategory)}`
    : 'Save to category';
}

function savePendingDua() {
  if (!state.pendingSaveId || !state.pendingSaveCategory) return;
  const existing = savedRecord(state.pendingSaveId);
  state.userData.savedAppDuas[state.pendingSaveId] = {
    categoryId: state.pendingSaveCategory,
    savedAt: existing?.savedAt || nowIso(),
    updatedAt: nowIso(),
  };
  state.pendingSaveId = '';
  state.pendingSaveCategory = '';
  saveState();
  $('saveDialog').close();
  render();
  if ($('focusDialog').open) renderFocus();
}

function removeSaved(id) {
  delete state.userData.savedAppDuas[id];
  saveState();
  render();
  if ($('focusDialog').open) renderFocus();
}

function addCategory() {
  const title = $('newCategoryTitle').value.trim();
  if (!title) return;
  state.userData.categories.splice(Math.max(0, state.userData.categories.length - 2), 0, {
    id: uniqueCategoryId(title),
    title,
    description: 'Custom saved category.',
    protected: false,
    system: false,
  });
  $('newCategoryTitle').value = '';
  saveState();
  renderSaved();
}

function updateCategory(id) {
  const category = saveCategoryById(id);
  if (!category || category.protected) return;
  const row = [...document.querySelectorAll('[data-category-row]')].find((element) => element.dataset.categoryRow === id);
  const input = row?.querySelector('input');
  const title = input?.value.trim();
  if (!title) return;
  category.title = title;
  category.description = category.description || 'Custom saved category.';
  saveState();
  renderSaved();
}

function moveItemsToNeedsCategory(categoryId) {
  Object.values(state.userData.savedAppDuas).forEach((record) => {
    if (record.categoryId === categoryId) {
      record.categoryId = NEEDS_CATEGORY;
      record.updatedAt = nowIso();
    }
  });
  [...state.userData.customDuas, ...state.userData.requestedDuas].forEach((record) => {
    if (record.categoryId === categoryId) {
      record.categoryId = NEEDS_CATEGORY;
      record.updatedAt = nowIso();
    }
  });
}

function deleteCategory(id) {
  const category = saveCategoryById(id);
  if (!category || category.protected) return;
  const ok = window.confirm(`Remove "${category.title}"? Saved duas in this category will move to Needs category.`);
  if (!ok) return;
  moveItemsToNeedsCategory(id);
  state.userData.categories = state.userData.categories.filter((item) => item.id !== id);
  if (state.savedFilter === id) state.savedFilter = NEEDS_CATEGORY;
  saveState();
  renderSaved();
}

function moveCategory(id, direction) {
  const index = state.userData.categories.findIndex((category) => category.id === id);
  const category = state.userData.categories[index];
  if (index < 0 || category.protected) return;
  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  const swap = state.userData.categories[nextIndex];
  if (!swap || swap.protected) return;
  state.userData.categories.splice(index, 1);
  state.userData.categories.splice(nextIndex, 0, category);
  saveState();
  renderSaved();
}

function renderCustomCategoryOptions(selectedId) {
  $('customDuaCategory').innerHTML = userCategories().map((category) => `<option value="${esc(category.id)}" ${category.id === selectedId ? 'selected' : ''}>${esc(category.title)}</option>`).join('');
}

function findCustom(kind, id) {
  const list = kind === 'requested' ? state.userData.requestedDuas : state.userData.customDuas;
  return list.find((record) => record.id === id);
}

function phraseSegmentsForSnapshot(snapshot = state.pendingCustomSourceSnapshot) {
  return normalizeSourceSnapshot(snapshot)?.phraseSegments || [];
}

function hasPhraseSegments(snapshot = state.pendingCustomSourceSnapshot) {
  return phraseSegmentsForSnapshot(snapshot).length > 0;
}

function defaultPhraseSegmentIds(snapshot = state.pendingCustomSourceSnapshot) {
  const segments = phraseSegmentsForSnapshot(snapshot);
  const duaSegments = segments.filter((segment) => segment.role !== 'context');
  return (duaSegments.length ? duaSegments : segments).map((segment) => segment.id);
}

function normalizePhraseSegmentIds(ids = [], snapshot = state.pendingCustomSourceSnapshot) {
  const segments = phraseSegmentsForSnapshot(snapshot);
  const validIds = new Set(segments.map((segment) => segment.id));
  const selected = ids.filter((id) => validIds.has(id));
  if (!selected.length) return defaultPhraseSegmentIds(snapshot);
  const indexes = selected.map((id) => segments.findIndex((segment) => segment.id === id)).filter((index) => index >= 0);
  const min = Math.min(...indexes);
  const max = Math.max(...indexes);
  return segments.slice(min, max + 1).map((segment) => segment.id);
}

function selectedPhraseSegments(ids = state.pendingPhraseSegmentIds, snapshot = state.pendingCustomSourceSnapshot) {
  const normalizedIds = normalizePhraseSegmentIds(ids, snapshot);
  const idSet = new Set(normalizedIds);
  return phraseSegmentsForSnapshot(snapshot).filter((segment) => idSet.has(segment.id));
}

function selectionFromPhraseSegmentIds(ids = state.pendingPhraseSegmentIds, snapshot = state.pendingCustomSourceSnapshot) {
  const selected = selectedPhraseSegments(ids, snapshot);
  if (!selected.length) return null;
  return normalizeProtectedSelection({
    startToken: Math.min(...selected.map((segment) => segment.startToken)),
    endToken: Math.max(...selected.map((segment) => segment.endToken)),
  }, snapshot);
}

function suggestedEnglishFromPhraseIds(ids = state.pendingPhraseSegmentIds, snapshot = state.pendingCustomSourceSnapshot) {
  return selectedPhraseSegments(ids, snapshot).map((segment) => segment.english).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function suggestedTransliterationFromPhraseIds(ids = state.pendingPhraseSegmentIds, snapshot = state.pendingCustomSourceSnapshot) {
  return selectedPhraseSegments(ids, snapshot).map((segment) => segment.transliteration).filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
}

function setEnglishValue(value, markEdited = false) {
  state.suppressEnglishEdit = true;
  $('customEnglish').value = value || '';
  state.suppressEnglishEdit = false;
  state.pendingEnglishEdited = markEdited;
}

function currentProtectedSelection() {
  const snapshot = state.pendingCustomSourceSnapshot;
  if (!snapshot) return null;
  if (hasPhraseSegments(snapshot)) return selectionFromPhraseSegmentIds(state.pendingPhraseSegmentIds, snapshot);
  const count = sourceTokenCount(snapshot);
  if (!count) return null;
  let startToken = Number($('sourceStart').value || 0);
  let endToken = Number($('sourceEnd').value || count - 1);
  if (startToken > endToken) endToken = startToken;
  return normalizeProtectedSelection({ startToken, endToken }, snapshot);
}

function setProtectedSourceMode(enabled) {
  $('verifiedPersonaliseFields').hidden = !enabled;
  $('verifiedPersonaliseFields').setAttribute('aria-hidden', String(!enabled));
  $('freeBodyField').hidden = enabled;
  $('customDuaBody').disabled = enabled;
  $('customArabic').disabled = !enabled;
  $('customEnglish').disabled = !enabled;
  $('customTransliteration').disabled = !enabled;
}

function renderProtectedSourceControls(snapshot, selection = null) {
  const phraseMode = hasPhraseSegments(snapshot);
  $('sourcePhrasePanel').hidden = !phraseMode;
  $('wordTrimControls').hidden = phraseMode;
  if (phraseMode) {
    state.pendingPhraseSegmentIds = normalizePhraseSegmentIds(state.pendingPhraseSegmentIds.length ? state.pendingPhraseSegmentIds : defaultPhraseSegmentIds(snapshot), snapshot);
    renderPhraseGrid();
    applySuggestedEnglishIfAllowed(true);
    updatePersonalisePreview();
    return;
  }
  const count = sourceTokenCount(snapshot);
  const normalized = normalizeProtectedSelection(selection, snapshot);
  const max = Math.max(0, count - 1);
  ['sourceStart', 'sourceEnd'].forEach((id) => {
    $(id).min = '0';
    $(id).max = String(max);
    $(id).disabled = count <= 1;
  });
  $('sourceStart').value = String(normalized?.startToken || 0);
  $('sourceEnd').value = String(normalized?.endToken ?? max);
  updatePersonalisePreview();
}

function renderPhraseGrid() {
  const segments = phraseSegmentsForSnapshot();
  const selected = new Set(normalizePhraseSegmentIds(state.pendingPhraseSegmentIds));
  $('sourcePhraseGrid').innerHTML = segments.map((segment) => `
    <button class="phrase-chip ${selected.has(segment.id) ? 'active' : ''} ${segment.role === 'context' ? 'context' : ''}" data-phrase-id="${esc(segment.id)}" type="button">
      ${esc(segment.label)}
    </button>
  `).join('');
}

function togglePhraseSegment(id) {
  const segments = phraseSegmentsForSnapshot();
  const index = segments.findIndex((segment) => segment.id === id);
  if (index < 0) return;
  const selectedIndexes = state.pendingPhraseSegmentIds
    .map((selectedId) => segments.findIndex((segment) => segment.id === selectedId))
    .filter((selectedIndex) => selectedIndex >= 0);
  let min = selectedIndexes.length ? Math.min(...selectedIndexes) : index;
  let max = selectedIndexes.length ? Math.max(...selectedIndexes) : index;
  if (index < min) min = index;
  else if (index > max) max = index;
  else if (index === min && min < max) min += 1;
  else if (index === max && min < max) max -= 1;
  else {
    min = index;
    max = index;
  }
  state.pendingPhraseSegmentIds = segments.slice(min, max + 1).map((segment) => segment.id);
  renderPhraseGrid();
  applySuggestedEnglishIfAllowed();
  updatePersonalisePreview();
}

function applySuggestedEnglishIfAllowed(force = false) {
  if (!hasPhraseSegments()) return;
  const suggested = suggestedEnglishFromPhraseIds();
  state.pendingAutoEnglish = suggested;
  if (force || !state.pendingEnglishEdited || !$('customEnglish').value.trim()) {
    setEnglishValue(suggested, false);
  }
  const transliteration = suggestedTransliterationFromPhraseIds();
  if (transliteration && (!$('customTransliteration').value.trim() || force)) $('customTransliteration').value = transliteration;
}

function resetProtectedSourceSelection() {
  if (hasPhraseSegments()) {
    state.pendingPhraseSegmentIds = defaultPhraseSegmentIds();
    state.pendingEnglishEdited = false;
    renderPhraseGrid();
    applySuggestedEnglishIfAllowed(true);
    updatePersonalisePreview();
    return;
  }
  renderProtectedSourceControls(state.pendingCustomSourceSnapshot);
}

function useSuggestedEnglish() {
  if (hasPhraseSegments()) {
    state.pendingEnglishEdited = false;
    applySuggestedEnglishIfAllowed(true);
    updatePersonalisePreview();
    return;
  }
  setEnglishValue(normalizeSourceSnapshot(state.pendingCustomSourceSnapshot)?.meaning || '', false);
  updatePersonalisePreview();
}

function syncProtectedSelection(changedId = '') {
  const count = sourceTokenCount(state.pendingCustomSourceSnapshot);
  if (!count) return;
  let startToken = Number($('sourceStart').value || 0);
  let endToken = Number($('sourceEnd').value || count - 1);
  if (startToken > endToken) {
    if (changedId === 'sourceEnd') startToken = endToken;
    else endToken = startToken;
  }
  state.pendingProtectedSelection = normalizeProtectedSelection({ startToken, endToken }, state.pendingCustomSourceSnapshot);
  $('sourceStart').value = String(state.pendingProtectedSelection.startToken);
  $('sourceEnd').value = String(state.pendingProtectedSelection.endToken);
  updatePersonalisePreview();
}

function updatePersonalisePreview() {
  const preview = $('personalisePreview');
  if (!state.pendingCustomSourceSnapshot || !preview) return;
  preview.innerHTML = renderPersonalisedRecord({
    title: $('customDuaTitle').value.trim() || 'Personalised dua',
    sourceSnapshot: state.pendingCustomSourceSnapshot,
    originalSource: state.pendingCustomSourceSnapshot,
    arabicText: $('customArabic').value.trim(),
    english: $('customEnglish').value.trim(),
    englishText: $('customEnglish').value.trim(),
    transliteration: $('customTransliteration').value.trim(),
  }, true);
}

function openPersonaliseDialog(id) {
  const item = state.data.entries.find((entry) => entry.id === id);
  if (!item) return;
  saveReadingPosition(id);
  const returnPosition = {
    ...currentContextSnapshot(),
    contextKey: readingContextKey(),
    targetId: id,
    scrollY: Math.max(0, window.scrollY || 0),
    updatedAt: nowIso(),
  };
  if ($('focusDialog')?.open) $('focusDialog').close();
  openCustomDuaDialog('personal', '', {
    sourceSnapshot: sourceSnapshotFromItem(item),
    returnTo: returnPosition,
    title: `My dua - ${item.title}`,
    english: item.dua_meaning || item.meaning || '',
    transliteration: item.dua_transliteration || item.transliteration || '',
  });
  $('customDuaDialogTitle').textContent = 'Create personal version';
}

function openCustomDuaDialog(kind, id = '', options = {}) {
  const record = id ? findCustom(kind, id) : null;
  const sourceSnapshot = normalizeSourceSnapshot(options.sourceSnapshot || record?.originalSource || record?.sourceSnapshot);
  const hasSource = kind === 'personal' && Boolean(sourceSnapshot);
  state.pendingCustomKind = kind;
  state.pendingCustomId = id;
  state.pendingCustomSourceSnapshot = hasSource ? sourceSnapshot : null;
  state.pendingPhraseSegmentIds = hasSource ? (record?.phraseSegmentIds || options.phraseSegmentIds || []) : [];
  state.pendingProtectedSelection = hasSource ? normalizeProtectedSelection(record?.protectedSelection || options.protectedSelection, sourceSnapshot) : null;
  state.pendingAutoEnglish = hasSource ? String(record?.autoEnglish || '').trim() : '';
  state.pendingEnglishEdited = Boolean(record?.englishEdited);
  state.pendingReturnAfterCustom = options.returnTo || null;
  const isRequested = kind === 'requested';
  $('customDuaDialogTitle').textContent = hasSource
    ? (record ? 'Edit personal version' : 'Create personal version')
    : (record ? (isRequested ? 'Edit requested dua' : 'Edit personal dua') : (isRequested ? 'Add requested dua' : 'Add personal dua'));
  $('customDuaBodyLabel').textContent = isRequested ? 'Requested dua / details' : 'Dua / reminder';
  $('requestedByField').hidden = !isRequested;
  $('requestedByField').setAttribute('aria-hidden', String(!isRequested));
  $('requestedBy').disabled = !isRequested;
  $('customDuaTitle').value = record?.title || options.title || '';
  $('requestedBy').value = isRequested ? (record?.requestedBy || '') : '';
  const fallbackArabic = hasSource ? sliceTextBySelection(sourcePlainArabicFromSnapshot(sourceSnapshot), state.pendingProtectedSelection) : '';
  $('customArabic').value = hasSource ? (record?.arabicText || options.arabic || fallbackArabic || sourcePlainArabicFromSnapshot(sourceSnapshot) || '') : '';
  $('customDuaBody').value = hasSource ? '' : (record?.body || options.body || '');
  setEnglishValue(hasSource ? (record?.englishText || record?.english || options.english || options.body || sourceSnapshot?.meaning || '') : '', false);
  $('customTransliteration').value = hasSource ? (record?.transliteration || options.transliteration || sourceSnapshot?.transliteration || '') : '';
  $('customDuaNote').value = record?.note || options.note || '';
  $('customDuaDelete').hidden = !record;
  const defaultCategory = isRequested ? REQUESTED_CATEGORY : (userCategories().find((category) => !category.protected)?.id || NEEDS_CATEGORY);
  renderCustomCategoryOptions(record?.categoryId || defaultCategory);
  setProtectedSourceMode(hasSource);
  const preview = $('customSourcePreview');
  preview.hidden = true;
  preview.innerHTML = '';
  if (hasSource) updatePersonalisePreview();
  else $('personalisePreview').innerHTML = '';
  $('customDuaDialog').showModal();
}

function saveCustomDua() {
  const kind = state.pendingCustomKind;
  const isRequested = kind === 'requested';
  const list = isRequested ? state.userData.requestedDuas : state.userData.customDuas;
  const existing = state.pendingCustomId ? list.find((record) => record.id === state.pendingCustomId) : null;
  const hasSource = !isRequested && Boolean(state.pendingCustomSourceSnapshot);
  const arabicText = hasSource ? $('customArabic').value.trim() : '';
  const englishText = hasSource ? $('customEnglish').value.trim() : '';
  const body = hasSource ? (englishText || arabicText) : $('customDuaBody').value.trim();
  if (!hasSource && !body) {
    setStorageNotice(isRequested ? 'Please enter the requested dua/details before saving.' : 'Please enter the dua/reminder before saving.', true);
    return;
  }
  if (hasSource && !arabicText && !englishText && !$('customTransliteration').value.trim()) {
    setStorageNotice('Please keep at least Arabic, transliteration, or English wording before saving.', true);
    return;
  }
  const requestedBy = $('requestedBy').value.trim();
  const title = $('customDuaTitle').value.trim() || (isRequested && requestedBy ? `Request from ${requestedBy}` : (isRequested ? 'Requested dua' : 'Personal dua'));
  const record = {
    id: existing?.id || makeId(kind),
    kind,
    title,
    body,
    segments: hasSource ? [] : bodySegmentsFromText(body),
    arabicText,
    englishText: hasSource ? englishText : '',
    english: hasSource ? englishText : '',
    transliteration: hasSource ? $('customTransliteration').value.trim() : '',
    protectedSelection: hasSource ? (existing?.protectedSelection || state.pendingProtectedSelection || null) : null,
    phraseSegmentIds: hasSource ? (existing?.phraseSegmentIds || state.pendingPhraseSegmentIds || []) : [],
    autoEnglish: hasSource ? (existing?.autoEnglish || state.pendingAutoEnglish || '') : '',
    englishEdited: hasSource ? Boolean(existing?.englishEdited) : false,
    note: $('customDuaNote').value.trim(),
    requestedBy: isRequested ? requestedBy : '',
    categoryId: $('customDuaCategory').value || (isRequested ? REQUESTED_CATEGORY : NEEDS_CATEGORY),
    sourceSnapshot: hasSource ? normalizeSourceSnapshot(state.pendingCustomSourceSnapshot || existing?.sourceSnapshot || existing?.originalSource) : null,
    originalSource: hasSource ? normalizeSourceSnapshot(state.pendingCustomSourceSnapshot || existing?.originalSource || existing?.sourceSnapshot) : null,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  if (existing) Object.assign(existing, record);
  else list.unshift(record);
  saveState();
  $('customDuaDialog').close();
  const returnPosition = state.pendingReturnAfterCustom;
  state.pendingCustomSourceSnapshot = null;
  state.pendingReturnAfterCustom = null;
  state.pendingProtectedSelection = null;
  state.pendingPhraseSegmentIds = [];
  state.pendingAutoEnglish = '';
  state.pendingEnglishEdited = false;
  if (returnPosition) {
    applyReadingContext(returnPosition);
    render({ restore: false });
    scrollToReadingPosition(returnPosition, false);
  } else {
    state.view = 'saved';
    state.savedFilter = record.categoryId;
    render({ restore: true });
  }
}

function deleteCustomDua(kind, id) {
  const record = findCustom(kind, id);
  if (!record) return;
  const ok = window.confirm(`Delete "${record.title}"?`);
  if (!ok) return;
  const listName = kind === 'requested' ? 'requestedDuas' : 'customDuas';
  state.userData[listName] = state.userData[listName].filter((item) => item.id !== id);
  saveState();
  if ($('customDuaDialog').open) $('customDuaDialog').close();
  render();
}

function exportBackup() {
  const backup = {
    app: 'Hajj Dua Companion',
    exportVersion: 1,
    exportedAt: nowIso(),
    userData: state.userData,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hajj-dua-companion-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStorageNotice('Backup export prepared.');
}

function newerRecord(current, incoming) {
  if (!current) return incoming;
  return String(incoming.updatedAt || '').localeCompare(String(current.updatedAt || '')) >= 0 ? incoming : current;
}

function mergeImportedUserData(imported) {
  const categoryMap = new Map(state.userData.categories.map((category) => [category.id, category]));
  imported.categories.forEach((category) => {
    const current = categoryMap.get(category.id);
    if (!current) categoryMap.set(category.id, category);
    else if (!current.protected) categoryMap.set(category.id, { ...current, ...category, protected: false });
  });
  protectedCategories().forEach((category) => categoryMap.set(category.id, normalizeCategory(category)));
  state.userData.categories = Array.from(categoryMap.values());
  Object.entries(imported.savedAppDuas).forEach(([id, record]) => {
    state.userData.savedAppDuas[id] = newerRecord(state.userData.savedAppDuas[id], record);
  });
  ['customDuas', 'requestedDuas'].forEach((listName) => {
    const map = new Map(state.userData[listName].map((record) => [record.id, record]));
    imported[listName].forEach((record) => map.set(record.id, newerRecord(map.get(record.id), record)));
    state.userData[listName] = Array.from(map.values());
  });
  state.userData.settings = imported.settings || state.userData.settings;
  state.fontScale = state.userData.settings.fontScale;
  state.tajweed = state.userData.settings.tajweed;
  applyFontScale();
  $('tajweedToggle').checked = state.tajweed;
}

async function importBackupFile(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const imported = normalizeUserData(parsed.userData || parsed);
    mergeImportedUserData(imported);
    saveState();
    setStorageNotice('Backup imported and merged on this device.');
    render();
  } catch (error) {
    console.error('Import failed', error);
    setStorageNotice('Backup import failed. Please check that the file is a Hajj Dua Companion backup JSON.', true);
  } finally {
    $('backupFile').value = '';
  }
}

function populateFilters() {
  $('categoryFilter').innerHTML = ['All', ...state.data.categories].map((cat) => `<option value="${esc(cat)}">${esc(cat)}</option>`).join('');
  $('tierFilter').innerHTML = ['All', 'Qur’an', 'Sahih/Hasan Sunnah', 'Companion report / Athar', 'Practical guidance'].map((tier) => `<option value="${esc(tier)}">${esc(tier)}</option>`).join('');
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.view) {
    saveReadingPosition();
    state.view = target.dataset.view;
    render({ restore: true });
    return;
  }
  if (target.dataset.moment) {
    saveReadingPosition();
    state.moment = target.dataset.moment;
    render({ restore: true });
    return;
  }
  if (target.dataset.collection) {
    saveReadingPosition();
    state.collection = target.dataset.collection;
    render({ restore: true });
    return;
  }
  if (target.dataset.savedFilter) {
    saveReadingPosition();
    state.savedFilter = target.dataset.savedFilter;
    renderSaved();
    restoreReadingForCurrentContext();
    renderContinuePrompt();
    return;
  }
  if (target.dataset.save) { saveReadingPosition(target.dataset.save); openSaveDialog(target.dataset.save); return; }
  if (target.dataset.saveCategory) { state.pendingSaveCategory = target.dataset.saveCategory; renderSaveDialogCategories(); return; }
  if (target.dataset.removeSaved) { removeSaved(target.dataset.removeSaved); return; }
  if (target.dataset.personalise) { openPersonaliseDialog(target.dataset.personalise); return; }
  if (target.dataset.focus) { saveReadingPosition(target.dataset.focus); openFocus(target.dataset.focus); return; }
  if (target.dataset.categoryUpdate) { updateCategory(target.dataset.categoryUpdate); return; }
  if (target.dataset.categoryDelete) { deleteCategory(target.dataset.categoryDelete); return; }
  if (target.dataset.categoryMove) {
    const [id, direction] = target.dataset.categoryMove.split(':');
    moveCategory(id, direction);
    return;
  }
  if (target.dataset.customEdit) {
    const [kind, id] = target.dataset.customEdit.split(':');
    openCustomDuaDialog(kind, id);
    return;
  }
  if (target.dataset.customDelete) {
    const [kind, id] = target.dataset.customDelete.split(':');
    deleteCustomDua(kind, id);
  }
});

$('settingsOpen').addEventListener('click', () => {
  saveReadingPosition();
  state.view = 'more';
  render({ restore: false });
  $('readingSettings').open = true;
  window.setTimeout(() => $('readingSettings').scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
});
$('searchToggle').addEventListener('click', () => {
  const band = document.querySelector('.search-band');
  const open = !band.classList.contains('search-open');
  band.classList.toggle('search-open', open);
  $('searchToggle').setAttribute('aria-expanded', String(open));
  if (open) window.setTimeout(() => $('searchInput').focus(), 0);
});
$('searchInput').addEventListener('input', (event) => {
  state.query = event.target.value.trim();
  const band = document.querySelector('.search-band');
  if (state.query) {
    band.classList.add('search-open');
    $('searchToggle').setAttribute('aria-expanded', 'true');
  }
  render();
});
$('categoryFilter').addEventListener('change', (event) => { state.category = event.target.value; renderLibrary(); });
$('tierFilter').addEventListener('change', (event) => { state.tier = event.target.value; renderLibrary(); });
$('fontUp').addEventListener('click', () => { state.fontScale = Math.min(1.35, state.fontScale + .08); applyFontScale(); saveState(); });
$('fontDown').addEventListener('click', () => { state.fontScale = Math.max(.82, state.fontScale - .08); applyFontScale(); saveState(); });
$('tajweedToggle').addEventListener('change', (event) => { state.tajweed = event.target.checked; saveState(); render(); });
$('focusFirst').addEventListener('click', () => {
  const first = visibleEntries().find((item) => item.hajj_moment === state.moment);
  if (first) openFocus(first.id);
});
$('collectionFocusFirst').addEventListener('click', () => {
  const first = collectionEntries()[0];
  if (first) openFocus(first.id);
});
$('focusClose').addEventListener('click', () => $('focusDialog').close());
$('focusSave').addEventListener('click', () => openSaveDialog(state.focusItems[state.focusIndex].id));
$('focusPersonalise').addEventListener('click', () => openPersonaliseDialog(state.focusItems[state.focusIndex].id));
$('focusPrev').addEventListener('click', () => { state.focusIndex = Math.max(0, state.focusIndex - 1); renderFocus(); });
$('focusNext').addEventListener('click', () => { state.focusIndex = Math.min(state.focusItems.length - 1, state.focusIndex + 1); renderFocus(); });
$('saveDialogClose').addEventListener('click', () => $('saveDialog').close());
$('saveConfirm').addEventListener('click', savePendingDua);
$('addPersonalDua').addEventListener('click', () => openCustomDuaDialog('personal'));
$('addRequestedDua').addEventListener('click', () => openCustomDuaDialog('requested'));
$('addCategory').addEventListener('click', addCategory);
$('newCategoryTitle').addEventListener('keydown', (event) => { if (event.key === 'Enter') addCategory(); });
$('customDuaClose').addEventListener('click', () => $('customDuaDialog').close());
$('customDuaSave').addEventListener('click', saveCustomDua);
$('customDuaDelete').addEventListener('click', () => deleteCustomDua(state.pendingCustomKind, state.pendingCustomId));
$('sourceStart').addEventListener('input', () => syncProtectedSelection('sourceStart'));
$('sourceEnd').addEventListener('input', () => syncProtectedSelection('sourceEnd'));
$('sourceReset').addEventListener('click', resetProtectedSourceSelection);
$('sourceUseSuggested').addEventListener('click', useSuggestedEnglish);
$('sourcePhraseGrid').addEventListener('click', (event) => {
  const target = event.target.closest('[data-phrase-id]');
  if (target) togglePhraseSegment(target.dataset.phraseId);
});
$('customDuaTitle').addEventListener('input', updatePersonalisePreview);
$('customArabic').addEventListener('input', updatePersonalisePreview);
$('customEnglish').addEventListener('input', updatePersonalisePreview);
$('customTransliteration').addEventListener('input', updatePersonalisePreview);
$('exportBackup').addEventListener('click', exportBackup);
$('importBackup').addEventListener('click', () => $('backupFile').click());
$('backupFile').addEventListener('change', (event) => importBackupFile(event.target.files[0]));
$('showVersionNotes').addEventListener('click', openVersionNotes);
$('refreshAppFiles').addEventListener('click', refreshAppFiles);
$('versionNotesOk').addEventListener('click', closeVersionNotes);
$('continueButton').addEventListener('click', continueLastReading);
window.addEventListener('scroll', () => scheduleReadingCapture(), { passive: true });

async function init() {
  const response = await fetch('data/duas.json');
  state.data = await response.json();
  loadUserData();
  state.fontScale = state.userData.settings.fontScale;
  state.tajweed = state.userData.settings.tajweed;
  restoreLastReadingContext();
  applyFontScale();
  $('tajweedToggle').checked = state.tajweed;
  populateFilters();
  render({ restore: true });
  maybeShowVersionNotes();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(() => navigator.serviceWorker.ready)
      .then(updateAppMetadata)
      .catch(() => updateAppMetadata());
    navigator.serviceWorker.addEventListener('controllerchange', updateAppMetadata);
  } else {
    updateAppMetadata();
  }
}
init();
