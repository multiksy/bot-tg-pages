# Reels Bot — Mini App (деплой)

Это **публичное зеркало** папки `tg-app` из основного (приватного) репозитория `bot-tg` — нужно отдельным репозиторием, чтобы GitHub Pages мог его бесплатно опубликовать (Pages для приватных репо требует платный GitHub Pro).

**Секретов здесь нет и быть не может** — `.env` с токеном бота физически лежит в `bot-tg`, вне папки `tg-app`, и никогда сюда не копируется.

## Как обновлять

Разработка всегда идёт в основном репозитории `bot-tg` → папка `tg-app`. Когда там появляются изменения, которые нужно опубликовать:

```bash
cp -R /Users/ksenia/Documents/vibe-code/bot-tg/tg-app/. /Users/ksenia/Documents/vibe-code/bot-tg-pages/
cd /Users/ksenia/Documents/vibe-code/bot-tg-pages
git add -A && git commit -m "sync from tg-app" && git push
```

Пуш в `main` автоматически запускает публикацию через GitHub Actions (см. `.github/workflows/pages.yml`).

## Настройка (один раз)

После первой публикации репозитория на GitHub: **Settings → Pages → Source → выбрать «GitHub Actions»**. Дальше всё автоматически.
