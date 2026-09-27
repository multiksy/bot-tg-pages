// =========================================================
// app.js — маршрутизация между экранами и вся интерактивная логика.
//
// Реальный бэкенд (bot/, Python+aiogram) уже существует и реально обрабатывает
// видео — но мост «бэкенд → это Mini App» ещё не построен (бот пока не умеет
// открывать Mini App заново на экране результата с id настоящей задачи).
// Поэтому здесь ВАЖНОЕ ПРАВИЛО: ничего в интерфейсе не должно СИМУЛИРОВАТЬ
// завершённую генерацию и не должно списывать клип из лимита — до тех пор,
// пока это не подтверждено реальным бэкендом. Экраны «Обработка»/«Результат»
// (startProcessing/onProcessingComplete/showResult) — это готовая вёрстка
// для будущего реального моста, просто пока её никто не вызывает из UI.
// Оплата (handlePay) остаётся мок — она про Telegram Stars, ещё не сделана.
// =========================================================

const CIRCUMFERENCE = 327; // длина окружности прогресс-кольца, совпадает со style.css

const state = {
  currentScreen: 'home',
  user: null, // заполняется в loadState()
  selectedTariffId: null,
  resultReturnScreen: 'home', // куда вести Back Button с экрана результата
  pricingReturnScreen: 'home', // куда вести Back Button с экрана тарифов
  viewingHistoryId: null, // если результат открыт из «Мои клипы»
  processingTimer: null,
};

// ---------- Утилиты ----------

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
function formatShortDate(date) {
  return `${date.getDate()} ${MONTHS_RU[date.getMonth()]}`;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function showToast(message, duration = 2200) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => { toast.hidden = true; }, 200);
  }, duration);
}

// ---------- Состояние пользователя (localStorage — только для демо-персистентности) ----------

// Версия схемы состояния. Бампнуть при изменениях, которые делают старые сохранённые
// данные некорректными (как сейчас: убрали фейковое списание клипов из UI — у тех,
// кто уже натестировал счётчик до нуля через старую версию, состояние сбросится один раз).
const STATE_SCHEMA_VERSION = 2;

function loadState() {
  let saved = null;
  try {
    const raw = localStorage.getItem('reels_app_state');
    if (raw) saved = JSON.parse(raw);
  } catch (e) {
    saved = null; // приватный режим/заблокированное хранилище — просто начинаем с чистого состояния
  }

  if (saved && saved.schemaVersion === STATE_SCHEMA_VERSION) {
    state.user = saved;
    return;
  }

  // Свежий старт (или сброс из-за смены схемы, см. STATE_SCHEMA_VERSION выше):
  // копируем дефолт из data.js и подставляем настоящую сегодняшнюю дату клипу-примеру.
  state.user = JSON.parse(JSON.stringify(DEFAULT_USER_STATE));
  state.user.history = state.user.history.map((item) => ({ ...item, date: formatShortDate(new Date()) }));
  state.user.schemaVersion = STATE_SCHEMA_VERSION;
  persistState();
}

function persistState() {
  try {
    localStorage.setItem('reels_app_state', JSON.stringify(state.user));
  } catch (e) {
    // тихо игнорируем — это некритичная демо-персистентность
  }
}

function currentTariff() {
  return getTariffById(state.user.tariffId);
}
function remainingClips() {
  return Math.max(currentTariff().clips - state.user.clipsUsed, 0);
}
function limitReached() {
  return remainingClips() <= 0;
}
function limitBadgeText() {
  const t = currentTariff();
  if (t.id === 'free') return `Бесплатно: ${remainingClips()} из ${t.clips}`;
  return `Тариф «${t.name}» · ${remainingClips()} из ${t.clips}`;
}

// ---------- Роутер ----------

function showScreen(name, transition = 'forward') {
  const screensEl = document.getElementById('screens');
  screensEl.classList.remove('transition-fade', 'transition-forward', 'transition-back');
  // небольшая задержка нужна, чтобы браузер точно перезапустил CSS-анимацию при повторном показе экрана
  screensEl.classList.add(`transition-${transition}`);

  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('is-active'));
  const target = document.getElementById(`screen-${name}`);
  target.classList.add('is-active');

  state.currentScreen = name;
  updateTabBar(name);
  updateNativeButtons(name);

  // Предупреждение о закрытии приложения нужно только во время активной обработки видео.
  if (name === 'processing') Native.enableClosingConfirmation();
  else Native.disableClosingConfirmation();
}

function updateTabBar(name) {
  const tabs = ['home', 'history', 'profile'];
  document.querySelectorAll('.tab-bar__item').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.tab === name);
  });
  document.getElementById('tab-bar').hidden = false;
}

function updateNativeButtons(name) {
  const btnHome = document.getElementById('home-cta');
  const btnUpload = document.getElementById('upload-cta');
  const btnResult = document.getElementById('result-share');
  const btnPricing = document.getElementById('pricing-pay');

  [btnHome, btnUpload, btnResult, btnPricing].forEach((btn) => Native.hideMainButton(btn));
  Native.hideBackButton();

  if (name === 'home') {
    Native.useMainButton(btnHome, 'Загрузить видео', handleWantNewClip);
  } else if (name === 'upload') {
    Native.useMainButton(btnUpload, 'Открыть чат и прислать видео', handleUploadCta);
    Native.useBackButton(() => showScreen('home', 'back'));
  } else if (name === 'processing') {
    Native.useBackButton(() => showScreen('home', 'back'));
  } else if (name === 'result') {
    Native.useMainButton(btnResult, 'Скачать / Переслать', handleShare);
    Native.useBackButton(() => showScreen(state.resultReturnScreen, 'back'));
  } else if (name === 'pricing') {
    renderPricingButton();
    Native.useBackButton(() => showScreen(state.pricingReturnScreen, 'back'));
  }
  // history и profile — только таб-бар, без Main/Back Button (это «домашние» экраны вкладок)
}

// ---------- [1] Главная ----------

function renderHome() {
  document.getElementById('home-limit-badge').textContent = limitBadgeText();
}

function handleWantNewClip() {
  if (limitReached()) {
    Native.haptic('medium');
    state.pricingReturnScreen = 'home';
    renderPricing();
    showScreen('pricing', 'forward');
    showToast('Бесплатные клипы закончились на этот месяц');
    return;
  }
  showScreen('upload', 'forward');
}

// ---------- [2] Загрузка видео ----------

// Mini App всегда открыт из кнопки меню ВНУТРИ чата с ботом (BotFather → Menu Button,
// см. CLAUDE.md). Открыть ссылку САМ НА СЕБЯ Telegram не даёт (openTelegramLink молча
// ничего не делает) — правильный способ «вернуться к боту» в этом случае — закрыть
// Mini App, тогда под ним снова окажется тот же чат. Если username — другой чат
// (например отдельная поддержка, не тот же бот), открываем его как обычно.
function openBotChatOrClose(username) {
  if (Native.isInsideTelegram && username === CONFIG.BOT_USERNAME) {
    Native.closeApp();
  } else {
    Native.openTelegramLink(username);
  }
}

function handleUploadCta() {
  Native.haptic('light');
  if (Native.isInsideTelegram) {
    // Внутри Telegram эта функция обычно закрывает Mini App (см. openBotChatOrClose) —
    // дальше пользователь уже в чате с ботом и присылает видео сам.
    openBotChatOrClose(CONFIG.BOT_USERNAME);
    return;
  }
  // Вне Telegram (браузер, разработка) — открыть чат некуда закрываться, просто откроем
  // ссылку в новой вкладке и вернёмся на Главную для продолжения тестирования интерфейса.
  Native.openTelegramLink(CONFIG.BOT_USERNAME);
  showToast('Открыт чат с ботом — пришли туда видео');
  showScreen('home', 'back');
}

// ---------- [3] Обработка ----------

function startProcessing(overrides = {}) {
  showScreen('processing', 'forward');
  const ring = document.getElementById('processing-ring-value');
  const percentEl = document.getElementById('processing-percent');
  const stageEl = document.getElementById('processing-stage');

  ring.style.strokeDashoffset = CIRCUMFERENCE;
  percentEl.textContent = '0%';
  stageEl.textContent = PROCESSING_STAGES[0].label;

  let stepIndex = 0;
  clearTimeout(state.processingTimer);

  const runStep = () => {
    const step = PROCESSING_STAGES[stepIndex];
    const offset = CIRCUMFERENCE * (1 - step.percent / 100);
    ring.style.strokeDashoffset = String(offset);
    percentEl.textContent = `${step.percent}%`;
    stageEl.textContent = step.label;

    stepIndex += 1;
    if (stepIndex < PROCESSING_STAGES.length) {
      state.processingTimer = setTimeout(runStep, 900);
    } else {
      state.processingTimer = setTimeout(() => onProcessingComplete(overrides), 500);
    }
  };
  runStep();
}

function onProcessingComplete(overrides) {
  const entry = {
    id: `clip-${Date.now()}`,
    date: formatShortDate(new Date()),
    sourceMinutes: overrides.sourceMinutes || randomFrom([8, 12, 15, 20, 25]),
    resultSeconds: overrides.resultSeconds || randomFrom([28, 34, 41, 45]),
    subtitleStyle: overrides.subtitleStyle || (state.user.history[0] && state.user.history[0].subtitleStyle) || SUBTITLE_STYLES[0],
    musicStyle: overrides.musicStyle || MUSIC_STYLES[0],
    gradient: 'linear-gradient(160deg, #e8a9bf 0%, #2a1a26 55%, #050e1d 100%)',
  };

  state.user.history.unshift(entry);
  state.user.clipsUsed += 1;
  state.user.totalClipsMade += 1;
  persistState();
  renderHistory();
  renderHome();
  renderProfile();

  Native.hapticSuccess();

  if (state.currentScreen === 'processing') {
    state.resultReturnScreen = 'home';
    showResult(entry);
  } else {
    showToast('Клип готов! Загляни в «Мои клипы»');
  }
}

// ---------- [4] Результат ----------

function showResult(entry, fromHistory = false) {
  state.viewingHistoryId = entry.id;
  state.resultReturnScreen = fromHistory ? 'history' : 'home';

  document.getElementById('result-stats').textContent =
    `Из ${entry.sourceMinutes} мин — клип ${entry.resultSeconds} сек`;

  const limitBadge = document.getElementById('result-limit-badge');
  if (limitReached()) {
    limitBadge.hidden = false;
    limitBadge.textContent = 'Бесплатные клипы закончились';
  } else {
    limitBadge.hidden = true;
  }

  showScreen('result', 'forward');
}

function handleShare() {
  Native.haptic('light');
  const shared = Native.shareClip('https://t.me/share/example-clip', 'Смотри, что получилось в Reels-боте!');
  if (!shared) showToast('Демо: здесь откроется нативный шаринг Telegram');
}

function handleResultAgain() {
  if (limitReached()) {
    state.pricingReturnScreen = 'result';
    renderPricing();
    showScreen('pricing', 'forward');
    showToast('Бесплатные клипы закончились на этот месяц');
    return;
  }
  showScreen('upload', 'forward');
}

// Текущий просматриваемый клип — источник для «пересобрать тот же ролик с другим стилем/музыкой».
function viewedEntry() {
  return state.user.history.find((item) => item.id === state.viewingHistoryId) || state.user.history[0];
}

function handleResultStyle() {
  // Выбор стиля субтитров бэкенд пока не поддерживает (MVP — только авто-субтитры +
  // кадрирование, см. brief.md). Показываем интерфейс выбора как задел на будущее,
  // но НЕ запускаем фейковую пересборку и не трогаем лимит.
  openSheet('Стиль субтитров', SUBTITLE_STYLES, () => {
    showToast('Выбор стиля пока не подключён к боту — скоро будет');
  });
}

function handleResultMusic() {
  openSheet('Музыка', MUSIC_STYLES, () => {
    showToast('Добавление музыки пока не подключено к боту — скоро будет');
  });
}

// ---------- [5] Мои клипы ----------

function renderHistory() {
  const grid = document.getElementById('history-grid');
  const empty = document.getElementById('history-empty');
  grid.innerHTML = '';

  if (!state.user.history.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  state.user.history.forEach((item) => {
    const tile = document.createElement('button');
    tile.className = 'history-item';
    tile.style.background = item.gradient;
    tile.innerHTML = `<span class="history-item__date">${item.date}</span>`;
    tile.addEventListener('click', () => showResult(item, true));
    grid.appendChild(tile);
  });
}

// ---------- [6] Тарифы ----------

function renderPricing() {
  const list = document.getElementById('pricing-list');
  list.innerHTML = '';

  TARIFFS.forEach((tariff) => {
    const isCurrent = tariff.id === state.user.tariffId;
    const card = document.createElement('button');
    card.className = 'pricing-card';
    if (isCurrent) card.classList.add('is-current');
    if (state.selectedTariffId === tariff.id) card.classList.add('is-selected');
    card.innerHTML = `
      <div>
        <p class="pricing-card__name">${tariff.name}${isCurrent ? ' · сейчас' : ''}</p>
        <p class="pricing-card__meta">${tariff.clips} клипов/мес${tariff.note ? ' · ' + tariff.note : ''}</p>
      </div>
      <p class="pricing-card__price">${tariff.priceLabel}</p>
    `;
    card.addEventListener('click', () => {
      state.selectedTariffId = tariff.id;
      renderPricing();
      renderPricingButton();
      Native.haptic('light');
    });
    list.appendChild(card);
  });
}

function renderPricingButton() {
  const btn = document.getElementById('pricing-pay');
  const selected = state.selectedTariffId ? getTariffById(state.selectedTariffId) : null;

  if (!selected) {
    Native.useMainButton(btn, 'Выбери тариф', () => {});
    Native.setMainButtonEnabled(btn, false);
    return;
  }
  if (selected.id === state.user.tariffId) {
    Native.useMainButton(btn, 'Уже активен', () => {});
    Native.setMainButtonEnabled(btn, false);
    return;
  }
  Native.useMainButton(btn, `Оплатить ${selected.priceLabel}`, handlePay);
  Native.setMainButtonEnabled(btn, true);
}

function handlePay() {
  const tariff = getTariffById(state.selectedTariffId);
  if (!tariff) return;

  Native.haptic('medium');
  showToast('Открываю оплату Telegram Stars… (демо)');

  // Имитация нативного инвойса Telegram Stars — реальная интеграция описана в CLAUDE.md.
  setTimeout(() => {
    state.user.tariffId = tariff.id;
    state.user.clipsUsed = 0;
    state.user.tariffRenewsAt = formatShortDate(addDays(new Date(), 30));
    state.selectedTariffId = null;
    persistState();

    Native.hapticSuccess();
    showToast(`Тариф «${tariff.name}» активирован ✅`);

    renderHome();
    renderProfile();
    renderPricing();

    if (state.pricingReturnScreen === 'result') {
      // Возвращаемся на тот же клип, но с уже обновлённым (снятым) лимитом.
      showResult(viewedEntry(), state.resultReturnScreen === 'history');
    } else {
      showScreen(state.pricingReturnScreen, 'back');
    }
  }, 900);
}

// ---------- [7] Профиль ----------

function renderProfile() {
  const tgUser = Native.getUser();
  const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || 'Пользователь';
  document.getElementById('profile-name').textContent = name;

  const avatar = document.getElementById('profile-avatar');
  if (tgUser.photo_url) {
    avatar.src = tgUser.photo_url;
  } else {
    // Без фото — аватар-заглушка с первой буквой имени, нарисованная inline-SVG (без внешних файлов).
    const letter = (name[0] || '?').toUpperCase();
    avatar.src =
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" rx="28" fill="#e8a9bf"/><text x="28" y="34" font-size="22" font-family="sans-serif" fill="#1a1118" text-anchor="middle">${letter}</text></svg>`
      );
  }

  const tariff = currentTariff();
  const tariffLine =
    tariff.id === 'free'
      ? `Бесплатный · ${remainingClips()} из ${tariff.clips} клипов`
      : `${tariff.name} · ${remainingClips()} из ${tariff.clips} клипов${state.user.tariffRenewsAt ? ' · до ' + state.user.tariffRenewsAt : ''}`;
  document.getElementById('profile-tariff').textContent = tariffLine;
  document.getElementById('profile-total').textContent = `Сделано клипов всего: ${state.user.totalClipsMade}`;
}

// ---------- Нижняя шторка (выбор стиля/музыки) ----------

let sheetSelectHandler = null;

function openSheet(title, options, onSelect) {
  document.getElementById('sheet-title').textContent = title;
  const optionsEl = document.getElementById('sheet-options');
  optionsEl.innerHTML = '';
  options.forEach((option) => {
    const btn = document.createElement('button');
    btn.className = 'sheet__option';
    btn.textContent = option;
    btn.addEventListener('click', () => {
      closeSheet();
      onSelect(option);
    });
    optionsEl.appendChild(btn);
  });
  sheetSelectHandler = onSelect;

  const overlay = document.getElementById('sheet-overlay');
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('is-open'));
}

function closeSheet() {
  const overlay = document.getElementById('sheet-overlay');
  overlay.classList.remove('is-open');
  setTimeout(() => { overlay.hidden = true; }, 260);
}

// ---------- Тактильный отклик на касания (запасной вариант к CSS :active) ----------

function wireTouchFeedback() {
  const selector = '.main-button, .tile, .sheet__option, .pricing-card, .history-item, .tab-bar__item, .profile-tariff';
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(selector);
    if (el) el.classList.add('is-pressed');
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
    document.addEventListener(type, (e) => {
      const el = e.target.closest(selector);
      if (el) el.classList.remove('is-pressed');
    });
  });
}

// ---------- Разводка событий ----------

function wireEvents() {
  document.querySelectorAll('.tab-bar__item').forEach((btn) => {
    btn.addEventListener('click', () => {
      Native.haptic('light');
      const tab = btn.dataset.tab;
      if (tab === 'history') renderHistory();
      if (tab === 'profile') renderProfile();
      if (tab === 'home') renderHome();
      showScreen(tab, 'fade');
    });
  });

  document.getElementById('home-cta').addEventListener('click', handleWantNewClip);
  document.getElementById('upload-cta').addEventListener('click', handleUploadCta);

  document.getElementById('result-share').addEventListener('click', handleShare);
  document.getElementById('result-again').addEventListener('click', handleResultAgain);
  document.getElementById('result-style').addEventListener('click', handleResultStyle);
  document.getElementById('result-music').addEventListener('click', handleResultMusic);
  document.getElementById('result-limit-badge').addEventListener('click', () => {
    state.pricingReturnScreen = 'result';
    renderPricing();
    showScreen('pricing', 'forward');
  });

  document.getElementById('sheet-cancel').addEventListener('click', closeSheet);
  document.getElementById('sheet-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'sheet-overlay') closeSheet();
  });

  document.getElementById('profile-tariff').addEventListener('click', () => {
    state.pricingReturnScreen = 'profile';
    renderPricing();
    showScreen('pricing', 'forward');
  });
  document.getElementById('profile-history').addEventListener('click', () => {
    renderHistory();
    showScreen('history', 'forward');
  });
  document.getElementById('profile-invite').addEventListener('click', () => {
    const inviteUrl = `https://t.me/${CONFIG.BOT_USERNAME}?start=ref`;
    const shared = Native.shareClip(inviteUrl, 'Монтирую Reels прямо в Telegram — попробуй тоже');
    if (!shared) showToast('Демо: ссылка-приглашение скопирована бы сюда');
  });
  document.getElementById('profile-support').addEventListener('click', () => {
    openBotChatOrClose(CONFIG.SUPPORT_USERNAME);
  });
}

// ---------- Старт приложения ----------

document.addEventListener('DOMContentLoaded', () => {
  Native.init();
  loadState();
  wireEvents();
  wireTouchFeedback();

  renderHome();
  renderHistory();
  renderPricing();
  renderProfile();

  document.getElementById('screens').hidden = false;
  showScreen('home', 'fade');
});
