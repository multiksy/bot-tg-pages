// =========================================================
// telegram.js — тонкая обёртка над Telegram Web App SDK.
//
// Все обращения к window.Telegram.WebApp собраны здесь, чтобы:
//   1) остальной код (app.js) не думал о том, доступен ли SDK;
//   2) приложение нормально открывалось и в обычном браузере
//      (для разработки/скриншотов) — тогда используются
//      безопасные заглушки вместо реального Telegram.WebApp.
// =========================================================

const Native = (() => {
  const webApp = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  // ВАЖНО: telegram-web-app.js создаёт объект Telegram.WebApp даже вне настоящего Telegram —
  // это встроенная заглушка для отладки (видна в консоли как "[Telegram.WebView] > postEvent…").
  // Поэтому простой `!!webApp` всегда true и ломает фолбэк для обычного браузера.
  // Настоящий Telegram-клиент всегда передаёт непустую подписанную initData; заглушка — нет.
  const isInsideTelegram = !!(webApp && webApp.initData);

  // Текущие обработчики нажатий — храним, чтобы каждый раз корректно
  // снимать предыдущий через offClick перед назначением нового
  // (иначе при переключении экранов клики будут накапливаться).
  let currentMainHandler = null;
  let currentBackHandler = null;

  function init() {
    if (!isInsideTelegram) return;
    webApp.ready();
    webApp.expand(); // просим максимальную высоту — без «половинчатого» окна
    applyBrandChrome();
  }

  // ВАЖНО: в отличие от типичного Mini App, здесь мы НЕ подстраиваем цвета под
  // Telegram.WebApp.themeParams (светлую/тёмную тему пользователя) — палитра
  // фиксированная и синхронизирована с сайтом того же автора (см. style.css).
  // Единственное, что синхронизируем с реальным Telegram-клиентом — это цвет
  // его собственного «хрома» (шапка/фон вне веб-вью), чтобы не было светлой
  // рамки вокруг тёмного приложения.
  function applyBrandChrome() {
    if (!isInsideTelegram) return;
    if (webApp.setHeaderColor) webApp.setHeaderColor('#050e1d');
    if (webApp.setBackgroundColor) webApp.setBackgroundColor('#050e1d');
  }

  // Пользователь из initData. Вне Telegram — реалистичный демо-пользователь,
  // чтобы экран профиля не выглядел пустым при тестировании в браузере.
  function getUser() {
    const tgUser = webApp && webApp.initDataUnsafe && webApp.initDataUnsafe.user;
    if (tgUser) return tgUser;
    return { first_name: 'Алекс', last_name: '', username: 'alex_demo', photo_url: '' };
  }

  function haptic(style = 'light') {
    if (!isInsideTelegram || !webApp.HapticFeedback) return;
    if (['light', 'medium', 'heavy', 'rigid', 'soft'].includes(style)) {
      webApp.HapticFeedback.impactOccurred(style);
    }
  }

  function hapticSuccess() {
    if (!isInsideTelegram || !webApp.HapticFeedback) return;
    webApp.HapticFeedback.notificationOccurred('success');
  }

  // Показывает нативную Main Button Telegram, если приложение открыто внутри
  // Telegram-клиента; в браузере вместо неё используется обычная DOM-кнопка
  // .main-button, которая уже лежит в разметке каждого экрана.
  function useMainButton(domButton, text, onClick) {
    if (isInsideTelegram) {
      domButton.hidden = true;
      if (currentMainHandler) webApp.MainButton.offClick(currentMainHandler);
      currentMainHandler = onClick;
      webApp.MainButton.setText(text.toUpperCase());
      webApp.MainButton.setParams({ color: '#e8a9bf', text_color: '#1a1118' });
      webApp.MainButton.show();
      webApp.MainButton.onClick(onClick);
    } else {
      domButton.hidden = false;
      domButton.textContent = text;
      domButton.onclick = onClick;
    }
  }

  function setMainButtonEnabled(domButton, enabled) {
    if (isInsideTelegram) {
      enabled ? webApp.MainButton.enable() : webApp.MainButton.disable();
    } else if (domButton) {
      domButton.disabled = !enabled;
    }
  }

  function hideMainButton(domButton) {
    if (isInsideTelegram) {
      webApp.MainButton.hide();
    } else if (domButton) {
      domButton.hidden = true;
    }
  }

  function useBackButton(onClick) {
    if (!isInsideTelegram) return; // в браузере навигация назад — только через таб-бар/кнопки экрана
    if (currentBackHandler) webApp.BackButton.offClick(currentBackHandler);
    currentBackHandler = onClick;
    webApp.BackButton.show();
    webApp.BackButton.onClick(onClick);
  }

  function hideBackButton() {
    if (!isInsideTelegram) return;
    webApp.BackButton.hide();
  }

  // Закрывает Mini App. Так как этот Mini App всегда открывается из кнопки меню
  // ВНУТРИ чата с ботом, закрытие само по себе возвращает пользователя в этот чат —
  // это и есть правильный способ «вернуться к боту», а не openTelegramLink (см. ниже).
  function closeApp() {
    if (isInsideTelegram) webApp.close();
  }

  // Открывает чат по юзернейму. ВАЖНО: не работает для ссылки на ТОТ ЖЕ чат,
  // откуда открыт этот Mini App (Telegram молча игнорирует такую ссылку) — для
  // этого случая в app.js есть openBotChatOrClose(), который вызывает closeApp().
  // Вне Telegram — просто открывает t.me в новой вкладке, чтобы ссылку можно
  // было проверить и в обычном браузере.
  function openTelegramLink(username) {
    const url = `https://t.me/${username}`;
    if (isInsideTelegram) {
      webApp.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  }

  // Предупреждение о незавершённом действии при попытке закрыть приложение —
  // используется на экране обработки видео.
  function enableClosingConfirmation() {
    if (isInsideTelegram) webApp.enableClosingConfirmation();
  }
  function disableClosingConfirmation() {
    if (isInsideTelegram) webApp.disableClosingConfirmation();
  }

  // Нативный шаринг результата. Вне Telegram — попытка через navigator.share,
  // иначе просто уведомление (см. toast в app.js).
  function shareClip(url, text) {
    if (isInsideTelegram) {
      webApp.switchInlineQuery
        ? webApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`)
        : null;
      return true;
    }
    if (navigator.share) {
      navigator.share({ title: text, url }).catch(() => {});
      return true;
    }
    return false;
  }

  return {
    isInsideTelegram,
    init,
    getUser,
    haptic,
    hapticSuccess,
    useMainButton,
    setMainButtonEnabled,
    hideMainButton,
    useBackButton,
    hideBackButton,
    closeApp,
    openTelegramLink,
    enableClosingConfirmation,
    disableClosingConfirmation,
    shareClip,
  };
})();
