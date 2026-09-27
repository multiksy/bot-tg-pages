// =========================================================
// data.js — ВСЕ РЕДАКТИРУЕМЫЕ ДАННЫЕ ПРИЛОЖЕНИЯ В ОДНОМ МЕСТЕ.
// Тексты и цифры взяты из brief.md и research.md.
// Когда появится реальный бэкенд/бот — этот файл заменяется
// на запросы к API, структура объектов (CONFIG, TARIFFS, ...)
// остаётся такой же. Подробности — в tg-app/CLAUDE.md.
// =========================================================

// ---- Общие настройки, которые почти наверняка понадобится поменять первыми ----
const CONFIG = {
  // Юзернейм бота-плейсхолдер из brief.md. Заменить на реальный, когда бот будет зарегистрирован.
  BOT_USERNAME: 'reels_bot',
  // Юзернейм чата поддержки — тоже плейсхолдер.
  SUPPORT_USERNAME: 'reels_bot_support',
};

// ---- Текст оффера на главном экране (раздел 2 и 4 brief.md) ----
const OFFER = {
  title: 'Видео → готовый Reels за 60 сек',
  subtitle: 'Пришли видео — получи клип с субтитрами. Первый — бесплатно.',
};

// ---- Этапы обработки видео (раздел 4, шаг [4] brief.md) ----
// Порядок важен: именно такая последовательность указана в ТЗ.
const PROCESSING_STAGES = [
  { percent: 30, label: 'Ищу лучшие моменты…' },
  { percent: 65, label: 'Добавляю субтитры…' },
  { percent: 90, label: 'Собираю клип…' },
  { percent: 100, label: 'Готово!' },
];

// ---- Варианты стиля субтитров и музыки (плитки «Стиль»/«Музыка» на экране результата) ----
const SUBTITLE_STYLES = ['Классика', 'Karaoke', 'Неон', 'Минимал'];
const MUSIC_STYLES = ['Без музыки', 'Энергично', 'Лёгкий бит', 'Кинематографично'];

// ---- Тарифы (раздел 7 brief.md) ----
const TARIFFS = [
  { id: 'free', name: 'Бесплатный', clips: 3, price: 0, priceLabel: 'Бесплатно', watermark: true },
  { id: 'start', name: 'Старт', clips: 5, price: 299, priceLabel: '299 ₽/мес', watermark: false },
  { id: 'pro', name: 'Про', clips: 30, price: 990, priceLabel: '990 ₽/мес', watermark: false, note: 'приоритет обработки' },
  { id: 'agency', name: 'Агентство', clips: 150, price: 2990, priceLabel: '2990 ₽/мес', watermark: false, note: 'брендинг под клиента' },
];

// ---- История клипов (мок для экрана «Мои клипы») ----
// duration* — как в примере из brief.md: «из 12 минут — клип 34 сек».
// gradient — CSS-градиент вместо реальной превьюшки видео (см. CLAUDE.md).
const HISTORY_SEED = [
  {
    id: 'clip-1',
    date: '27 сент',
    sourceMinutes: 12,
    resultSeconds: 34,
    subtitleStyle: 'Классика',
    musicStyle: 'Без музыки',
    gradient: 'linear-gradient(160deg, #e8a9bf 0%, #2a1a26 55%, #050e1d 100%)',
  },
];

// ---- Состояние пользователя по умолчанию ----
// В реальном приложении приходит с backend по initData.user.id.
// Здесь — старт «с нуля»: 1 клип уже сделан (см. HISTORY_SEED), бесплатных остаётся 2 из 3.
const DEFAULT_USER_STATE = {
  tariffId: 'free',
  clipsUsed: 1,
  totalClipsMade: 1,
  tariffRenewsAt: null, // для бесплатного тарифа не применяется
  history: HISTORY_SEED,
};

function getTariffById(id) {
  return TARIFFS.find((t) => t.id === id) || TARIFFS[0];
}
