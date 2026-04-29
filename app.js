const state = {
  data: null,
  view: 'hajj',
  moment: 'Arafah',
  collection: 'quranic-rabbana',
  query: '',
  category: 'All',
  tier: 'All',
  fontScale: Number(localStorage.getItem('fontScale') || '1'),
  tajweed: localStorage.getItem('tajweedColours') === '1',
  focusItems: [],
  focusIndex: 0,
  saved: new Set(JSON.parse(localStorage.getItem('savedDuas') || '[]')),
};

const $ = (id) => document.getElementById(id);
const esc = (value = '') => String(value).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function tierClass(tier) {
  if (tier === 'Qur’an') return 'quran';
  if (tier === 'Companion report / Athar') return 'athar';
  if (tier === 'Needs verification') return 'needs';
  if (tier === 'Devotional/appendix') return 'appendix';
  return '';
}

function saveState() {
  localStorage.setItem('savedDuas', JSON.stringify([...state.saved]));
  localStorage.setItem('fontScale', String(state.fontScale));
  localStorage.setItem('tajweedColours', state.tajweed ? '1' : '0');
}

function applyFontScale() {
  document.documentElement.style.setProperty('--arabic-scale', state.fontScale.toFixed(2));
}

function matchesQuery(item) {
  if (!state.query) return true;
  return item.search_text.includes(state.query.toLowerCase()) || (item.arabic_normalized || '').includes(state.query);
}

function visibleEntries({ appendix = false, saved = false, includeCollectionOnly = false } = {}) {
  let entries = state.data.entries.filter((item) => appendix ? item.appendix_only : (!item.appendix_only && (includeCollectionOnly || !item.collection_only)));
  if (saved) entries = state.data.entries.filter((item) => state.saved.has(item.id));
  return entries.filter(matchesQuery).sort((a, b) => a.sort_rank - b.sort_rank || a.title.localeCompare(b.title));
}

function selectedCollection() {
  return state.data.collections.find((collection) => collection.id === state.collection) || state.data.collections[0];
}

function collectionEntries() {
  const collection = selectedCollection();
  const ids = new Set(collection.entry_ids);
  return state.data.entries
    .filter((item) => ids.has(item.id))
    .filter(matchesQuery)
    .sort((a, b) => a.sort_rank - b.sort_rank || a.source_ref.localeCompare(b.source_ref));
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

function statusBadges(item) {
  const badges = [
    `<span class="badge ${tierClass(item.authenticity_tier)}">${esc(item.authenticity_tier)}</span>`,
    `<span class="badge">Source: ${esc(item.source_kind || item.authenticity_tier)}</span>`,
  ];
  if (item.fixed_text_status === 'open_dua_moment') badges.push('<span class="badge open">Open dua moment</span>');
  return badges.join('');
}

function card(item, focusList) {
  const saved = state.saved.has(item.id);
  const tags = [item.category, item.hajj_moment, ...item.tags, ...(item.collections || []).map((id) => state.data.collections.find((collection) => collection.id === id)?.title).filter(Boolean)].filter(Boolean);
  const transliteration = item.dua_transliteration || item.transliteration;
  const meaning = item.dua_meaning || item.meaning;
  const pageText = item.source_pdf_page ? ` · p. ${esc(item.source_pdf_page)}` : '';
  return `<article class="dua-card" data-id="${esc(item.id)}">
    <div class="card-head">
      <p class="card-title">${esc(item.title)}</p>
      <button class="save ${saved ? 'saved' : ''}" data-save="${esc(item.id)}" type="button" aria-label="Save dua">${saved ? 'Saved' : 'Save'}</button>
    </div>
    <div class="badges">
      ${statusBadges(item)}
      ${tags.slice(0, 4).map((tag) => `<span class="badge">${esc(tag)}</span>`).join('')}
    </div>
    ${item.fixed_text_status === 'open_dua_moment' ? '<p class="open-note">Open dua moment: no fixed wording is being prescribed here.</p>' : ''}
    ${arabicBlock(item)}
    ${item.arabic_omitted_note ? `<p class="omitted-note">${esc(item.arabic_omitted_note)}</p>` : ''}
    ${transliteration ? `<p class="translit">${esc(transliteration)}</p>` : ''}
    <p class="meaning">${esc(meaning)}</p>
    ${item.narration_context ? `<details><summary>Narration/context</summary><p class="context">${esc(item.narration_context)}</p></details>` : ''}
    <details>
      <summary>Source</summary>
      <p>${esc(item.source_ref)}</p>
      ${item.sunnah_reference ? `<p>Sunnah reference: ${esc(item.sunnah_reference)}</p>` : ''}
      <p>${esc(item.source_document)} · ${esc(item.source_section)}${pageText}</p>
      <p>Arabic source: ${esc(item.arabic_source)}</p>
    </details>
    <button class="quiet-button" data-focus="${esc(item.id)}" type="button">Focus</button>
  </article>`;
}

function renderList(target, items) {
  const emptyText = state.view === 'hajj'
    ? 'No fixed wording found in the verified main data for this moment. Keep making personal dua and dhikr.'
    : 'No duas found.';
  $(target).innerHTML = items.length ? items.map((item) => card(item, items)).join('') : `<p class="empty">${emptyText}</p>`;
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

function renderSaved() {
  renderList('savedList', visibleEntries({ saved: true }));
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
    saved: visibleEntries({ saved: true }),
    appendix: visibleEntries({ appendix: true }),
  };
  state.focusItems = lists[state.view];
  state.focusIndex = Math.max(0, state.focusItems.findIndex((item) => item.id === id));
  renderFocus();
  $('focusDialog').showModal();
}

function renderFocus() {
  const item = state.focusItems[state.focusIndex];
  if (!item) return;
  const transliteration = item.dua_transliteration || item.transliteration;
  const meaning = item.dua_meaning || item.meaning;
  $('focusSave').textContent = state.saved.has(item.id) ? 'Saved' : 'Save';
  $('focusContent').innerHTML = `
    <div class="badges">${statusBadges(item)}<span class="badge">${esc(item.category)}</span></div>
    ${item.fixed_text_status === 'open_dua_moment' ? '<p class="open-note">Open dua moment: no fixed wording is being prescribed here.</p>' : ''}
    ${arabicBlock(item)}
    ${item.arabic_omitted_note ? `<p class="omitted-note">${esc(item.arabic_omitted_note)}</p>` : ''}
    ${transliteration ? `<p class="translit">${esc(transliteration)}</p>` : ''}
    <p class="meaning">${esc(meaning)}</p>
    ${item.narration_context ? `<details><summary>Narration/context</summary><p class="context">${esc(item.narration_context)}</p></details>` : ''}
    <p class="card-title">${esc(item.sunnah_reference || item.source_ref)}</p>`;
}

function toggleSaved(id) {
  state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
  saveState();
  render();
  if ($('focusDialog').open) renderFocus();
}

function populateFilters() {
  $('categoryFilter').innerHTML = ['All', ...state.data.categories].map((cat) => `<option value="${esc(cat)}">${esc(cat)}</option>`).join('');
  $('tierFilter').innerHTML = ['All', 'Qur’an', 'Sahih/Hasan Sunnah', 'Companion report / Athar'].map((tier) => `<option value="${esc(tier)}">${esc(tier)}</option>`).join('');
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.view) { state.view = target.dataset.view; render(); }
  if (target.dataset.moment) { state.moment = target.dataset.moment; render(); }
  if (target.dataset.collection) { state.collection = target.dataset.collection; render(); }
  if (target.dataset.save) toggleSaved(target.dataset.save);
  if (target.dataset.focus) openFocus(target.dataset.focus);
});

$('searchInput').addEventListener('input', (event) => { state.query = event.target.value.trim(); render(); });
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
$('focusSave').addEventListener('click', () => toggleSaved(state.focusItems[state.focusIndex].id));
$('focusPrev').addEventListener('click', () => { state.focusIndex = Math.max(0, state.focusIndex - 1); renderFocus(); });
$('focusNext').addEventListener('click', () => { state.focusIndex = Math.min(state.focusItems.length - 1, state.focusIndex + 1); renderFocus(); });

async function init() {
  applyFontScale();
  $('tajweedToggle').checked = state.tajweed;
  const response = await fetch('data/duas.json');
  state.data = await response.json();
  populateFilters();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
}
init();
