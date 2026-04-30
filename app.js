const USER_DATA_KEY = 'hajjDuaCompanionUserData';
const USER_DATA_VERSION = 2;
const MIGRATION_BACKUP_KEY = 'hajjDuaCompanionMigrationBackup';
const NEEDS_CATEGORY = 'needs-category';
const REQUESTED_CATEGORY = 'requested-duas';
const VERSION_NOTES_KEY = 'hajjDuaCompanionSeenVersionNotes';
const VERSION_NOTES_ID = '2026.04.30';

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
  storageNotice: '',
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

function maybeShowVersionNotes() {
  if (safeLocalStorageGet(VERSION_NOTES_KEY) === VERSION_NOTES_ID) return;
  const dialog = $('versionNotesDialog');
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeVersionNotes() {
  safeLocalStorageSet(VERSION_NOTES_KEY, VERSION_NOTES_ID);
  const dialog = $('versionNotesDialog');
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
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

function normalizeCustomDua(record, kind) {
  const id = String(record?.id || makeId(kind)).trim();
  return {
    id,
    kind,
    title: String(record?.title || (kind === 'requested' ? 'Requested dua' : 'Personal dua')).trim(),
    body: String(record?.body || record?.requestText || '').trim(),
    note: String(record?.note || '').trim(),
    requestedBy: kind === 'requested' ? String(record?.requestedBy || '').trim() : '',
    categoryId: String(record?.categoryId || (kind === 'requested' ? REQUESTED_CATEGORY : NEEDS_CATEGORY)),
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
    migration: input.migration || {},
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
      const normalized = normalizeUserData(JSON.parse(raw));
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
      return matchesTextQuery([entry.record.title, entry.record.body, entry.record.note, entry.record.requestedBy, saveCategoryLabel(entry.categoryId)]);
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

function textBlock(value, className = 'meaning') {
  if (!value) return '';
  return `<p class="${className}" dir="auto">${esc(value).replace(/\n/g, '<br>')}</p>`;
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
  const actions = state.view === 'saved' && saved
    ? `${removeAction}<button class="quiet-button" data-focus="${esc(item.id)}" type="button">Focus</button>`
    : `${saveAction}<button class="quiet-button" data-focus="${esc(item.id)}" type="button">Focus</button>`;
  return `<article class="dua-card" data-id="${esc(item.id)}">
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
  return `<article class="dua-card custom-card" data-custom-id="${esc(record.id)}">
    <div class="card-head">
      <p class="card-title">${esc(record.title)}</p>
      <div class="badges"><span class="badge guidance">${isRequested ? 'Requested dua' : 'Personal dua'}</span></div>
    </div>
    <div class="badges">
      <span class="badge">Saved in: ${esc(saveCategoryLabel(record.categoryId))}</span>
    </div>
    ${isRequested && record.requestedBy ? `<p class="custom-meta"><strong>Requested by:</strong> ${esc(record.requestedBy)}</p>` : ''}
    ${textBlock(record.body)}
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

function render() {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === state.view));
  document.querySelectorAll('.view').forEach((view) => view.classList.remove('active-view'));
  $(`${state.view}View`).classList.add('active-view');
  renderHajj();
  renderCollections();
  renderLibrary();
  renderSaved();
  renderAppendix();
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

function openCustomDuaDialog(kind, id = '') {
  const record = id ? findCustom(kind, id) : null;
  state.pendingCustomKind = kind;
  state.pendingCustomId = id;
  const isRequested = kind === 'requested';
  $('customDuaDialogTitle').textContent = record ? (isRequested ? 'Edit requested dua' : 'Edit personal dua') : (isRequested ? 'Add requested dua' : 'Add personal dua');
  $('customDuaBodyLabel').textContent = isRequested ? 'Requested dua / details' : 'Dua / reminder';
  $('requestedByField').hidden = !isRequested;
  $('requestedByField').setAttribute('aria-hidden', String(!isRequested));
  $('requestedBy').disabled = !isRequested;
  $('customDuaTitle').value = record?.title || '';
  $('requestedBy').value = isRequested ? (record?.requestedBy || '') : '';
  $('customDuaBody').value = record?.body || '';
  $('customDuaNote').value = record?.note || '';
  $('customDuaDelete').hidden = !record;
  const defaultCategory = isRequested ? REQUESTED_CATEGORY : (userCategories().find((category) => !category.protected)?.id || NEEDS_CATEGORY);
  renderCustomCategoryOptions(record?.categoryId || defaultCategory);
  $('customDuaDialog').showModal();
}

function saveCustomDua() {
  const kind = state.pendingCustomKind;
  const isRequested = kind === 'requested';
  const list = isRequested ? state.userData.requestedDuas : state.userData.customDuas;
  const existing = state.pendingCustomId ? list.find((record) => record.id === state.pendingCustomId) : null;
  const body = $('customDuaBody').value.trim();
  if (!body) {
    setStorageNotice(isRequested ? 'Please enter the requested dua/details before saving.' : 'Please enter the dua/reminder before saving.', true);
    return;
  }
  const requestedBy = $('requestedBy').value.trim();
  const title = $('customDuaTitle').value.trim() || (isRequested && requestedBy ? `Request from ${requestedBy}` : (isRequested ? 'Requested dua' : 'Personal dua'));
  const record = {
    id: existing?.id || makeId(kind),
    kind,
    title,
    body,
    note: $('customDuaNote').value.trim(),
    requestedBy: isRequested ? requestedBy : '',
    categoryId: $('customDuaCategory').value || (isRequested ? REQUESTED_CATEGORY : NEEDS_CATEGORY),
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  if (existing) Object.assign(existing, record);
  else list.unshift(record);
  saveState();
  $('customDuaDialog').close();
  state.view = 'saved';
  state.savedFilter = record.categoryId;
  render();
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
  if (target.dataset.view) { state.view = target.dataset.view; render(); }
  if (target.dataset.moment) { state.moment = target.dataset.moment; render(); }
  if (target.dataset.collection) { state.collection = target.dataset.collection; render(); }
  if (target.dataset.savedFilter) { state.savedFilter = target.dataset.savedFilter; renderSaved(); }
  if (target.dataset.save) openSaveDialog(target.dataset.save);
  if (target.dataset.saveCategory) { state.pendingSaveCategory = target.dataset.saveCategory; renderSaveDialogCategories(); }
  if (target.dataset.removeSaved) removeSaved(target.dataset.removeSaved);
  if (target.dataset.focus) openFocus(target.dataset.focus);
  if (target.dataset.categoryUpdate) updateCategory(target.dataset.categoryUpdate);
  if (target.dataset.categoryDelete) deleteCategory(target.dataset.categoryDelete);
  if (target.dataset.categoryMove) {
    const [id, direction] = target.dataset.categoryMove.split(':');
    moveCategory(id, direction);
  }
  if (target.dataset.customEdit) {
    const [kind, id] = target.dataset.customEdit.split(':');
    openCustomDuaDialog(kind, id);
  }
  if (target.dataset.customDelete) {
    const [kind, id] = target.dataset.customDelete.split(':');
    deleteCustomDua(kind, id);
  }
});

$('settingsOpen').addEventListener('click', () => {
  state.view = 'more';
  render();
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
$('exportBackup').addEventListener('click', exportBackup);
$('importBackup').addEventListener('click', () => $('backupFile').click());
$('backupFile').addEventListener('change', (event) => importBackupFile(event.target.files[0]));
$('versionNotesOk').addEventListener('click', closeVersionNotes);

async function init() {
  const response = await fetch('data/duas.json');
  state.data = await response.json();
  loadUserData();
  state.fontScale = state.userData.settings.fontScale;
  state.tajweed = state.userData.settings.tajweed;
  applyFontScale();
  $('tajweedToggle').checked = state.tajweed;
  populateFilters();
  render();
  maybeShowVersionNotes();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
}
init();
