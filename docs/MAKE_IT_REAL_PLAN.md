# Make-it-real Plan — June 2026

**Контекст.** Продукт работает на уровне engineering, но не вызывает
ощущения полезности. Лендинг обещает «AI-агент, который выполняет с
тобой», а доставляет «AI-сгенерированный чеклист с коучинговой подписью».
Этот документ — план, как закрыть этот gap.

**Источник проблем.** UX-аудит + анализ скриншотов, май-июнь 2026.

**Подход.** Каждая из 7 проблем — отдельная секция с: симптомом,
доказательствами из кода/скриншотов, конкретными изменениями (файлы,
промпты), критерием приёмки. PR-планирование внизу.

---

## Проблема 1 — AI-выход generic и шаблонный

### Симптом
Mission title: *«Define your workout plan: type, duration, and how many
sessions this week.»*
Это **описание задачи**, а не **задача**. Пользователь не получает
действие — получает указание подумать.

### Доказательства
- `frontend/services/ai-v2.js:357-387` (`buildTrackPrompt`) — промпт
  даёт правила («action-verb start, max 80 chars»), но не требует
  использования `currentProject` / `weekGoal` в каждом title. Few-shot
  примеры есть, но «good titles» — generic строки про MVP-builder, не
  про конкретного юзера.
- `frontend/services/ai-v2.js:195-198` (`STEPS_CTX`) — system context
  для agent steps: «No motivational filler. Steps only.» Этого
  недостаточно: модель не предупреждена против meta-шагов
  («open workspace», «decide what to do»), не обязана выдавать output
  per step.
- Промпт не получает onboarding-сигналы кроме goal/category/hours: ни
  experience-level, ни blocker, ни tried-before не влияют на форму
  output'а.

### Что менять

**`frontend/services/ai-v2.js` — `buildTrackPrompt`:**
- Добавить few-shot блок с **3 анти-примерами** («Bad titles») и **3
  good-примерами** для каждой категории (project / fitness / content /
  skill). Это самое сильное воздействие на LLM.
- Жёсткое правило: **каждый `title` обязан содержать ссылку на
  `currentProject` или `weekGoal` или конкретный артефакт** («Write
  the hero section copy» вместо «Work on landing page»).
- Запретить vague verbs: `define`, `plan`, `work on`, `think about`,
  `decide`, `research` (без объекта), `explore`.
- Требовать `successCriteria` в формате «artifact exists + property»:
  «3 exercises listed, days picked, written down» вместо «Plan covers
  type, time of day, and number of sessions».
- Подавать в промпт **все** onboarding-поля, включая `triedBefore` (это
  ключевой сигнал «что не работало раньше → не предлагать снова»).

**`frontend/services/ai-v2.js` — `buildAgentStepsPrompt` (`STEPS_CTX`):**
- Добавить раздел `BAD STEPS` с прямыми анти-примерами:
  ```
  - "Open your workspace and re-read the task" ← META
  - "Decide what's most important" ← VAGUE
  - "Work on the main thing" ← NO OBJECT
  ```
- Требовать от каждого шага: **физическое действие + конкретный output**
  на 10–30 минут.
- Запретить отправлять юзера «в свой workspace» — каждый шаг должен
  иметь смысл сам по себе.
- Требовать, чтобы шаг 1 был **самым низкофрикционным реальным
  действием** (написать 3 строки, открыть 1 конкретный URL, выписать 1
  имя).

**Технически:**
- Поднять `maxTokens` track_generate с 1400 → 2000 (для длинных
  good-examples + всех полей).
- Понизить temperature track_generate явно (например 0.4–0.5), сейчас
  default — модель «креативит» в сторону generic.
- Логировать AI-output (без PII) для калибровки, чтобы видеть, что
  реально возвращает модель.

### Acceptance criteria
- Юзер, указавший в onboarding'е `currentProject: "Notion clone in Next.js"`,
  получает Day 1 title уровня **«Set up Next.js project with TypeScript
  and Tailwind»**, не «Define your tech stack».
- Ни в одном generated track нет slov-trigger'ов: `define`, `plan`,
  `work on`, `think about` в title'ах.
- Если AI всё-таки выдал generic — fallback в `fallbackTrack` тоже
  переписать на конкретику (сейчас он шаблонный).

### Объём
Чисто prompt engineering + fallback refactor. **~150 строк** в
`ai-v2.js`. Без UI-изменений.

---

## Проблема 2 — Agent Mode = форма с textarea, не агент

### Симптом
Шаг 1: *«Open your workspace and re-read the task.»*
Шаг 2: *«Write down the single most important sub-task.»*
Шаг 3: *«Complete that sub-task and record the output.»*

Это мета-инструкции. Хуже того, шаг 1 **отправляет юзера прочь из
приложения** — прямо противоположное обещанию «execute inside the app».

### Доказательства
- `frontend/services/ai-v2.js:223-238` (`generateAgentSteps`) — промпт
  передаёт `STEPS_CTX`, но **не** передаёт `dayPlan.successCriteria`,
  `dayPlan.why`, `userContext` (project, weekGoal). Модели не на чем
  быть конкретной.
- `frontend/ui/pages/agent.js:294-339` (`stepList`) — UI заставляет
  юзера писать output в textarea «What did you do or produce?». Это
  работает, ЕСЛИ шаги конкретные. С нынешними шагами textarea пустая,
  потому что нечего ответить.
- `frontend/ui/pages/agent.js:7-12` (`PATTERN_TIPS`) — подсказки от AI
  фокусируются на блокерах, не на содержании задачи.

### Что менять

**Промпт `agent_steps` (`ai-v2.js`):**
- Передавать в prompt все поля dayPlan: title, why, successCriteria,
  category, estimateMinutes.
- Передавать `user.currentProject`, `user.weekGoal`, `user.experienceLevel`.
- Передавать **отрицательный список**: какие steps были выданы вчера
  (если он подсосётся из истории — потом). На MVP — просто запретить
  meta-формулировки.
- Требовать от каждого step:
  - `text` — конкретное действие с объектом (не «Decide», а «Pick 3
    competitors and list their pricing»)
  - `output` (новое поле) — что должно появиться после шага («a list of
    3 competitor names with prices»)
- Минимум 3, максимум 5 шагов.

**Agent UI (`ui/pages/agent.js`):**
- Textarea label сменить с «What did you do or produce?» на
  `${step.output ? \`Paste: ${step.output}\` : 'Your notes for this step'}`.
- Под текстом шага добавить inline-hint строку из нового `step.hint`
  поля (опциональное в schema), например: «Try copying this template:
  X / Y / Z». Это превращает текстарею из «допиши» в «вставь».
- Убрать любую формулировку «open your workspace» в fallback steps
  (`ai-v2.js:fallbackSteps`).
- Шаг 1 в fallback переписать на **«Write the first 2–3 bullet points
  for ${dayPlan.title}»** — это работает почти для любой задачи.

**Stuck-flow:**
- При нажатии «I'm stuck» сейчас просто редирект на `/blocked`. Можно
  оставить, но добавить промежуточный AI-call `agent_hint` (уже в
  allowlist, не используется). Промпт: «Step is X, user is stuck. Give
  one concrete unblocker in 1 sentence with a specific action.»

### Acceptance criteria
- Для задачи «Set up Next.js project» шаги выглядят как:
  1. «Run `npx create-next-app@latest mynotion --typescript --tailwind`»
  2. «Create folder structure: `app/`, `components/`, `lib/`. Add a
     `README.md` with the project name.»
  3. «Push to a new GitHub repo named `mynotion-clone`.»
- Ни один step **не начинается** с `Open`, `Re-read`, `Decide`, `Think`,
  `Consider`.
- Textarea label адаптируется под `step.output` если он задан.

### Объём
- Промпт: ~80 строк в `ai-v2.js`.
- Schema: добавить optional `output` и `hint` в `stepsSchema()`.
- UI: 5–10 строк в `agent.js` для label switch + hint render.
- Validation: добавить поля в `validateAgentStep()` в `persistence.js`.

---

## Проблема 3 — Roadmap = декорация, не story

### Симптом
7 кружочков с цифрами на кривой. Hover для tooltip. Day 1 выглядит как
Day 7. Никакой narrative weight.

### Доказательства
- `frontend/ui/components/roadmap.js` — все узлы одного размера (кроме
  today), нет concept «role of the day».
- `frontend/services/ai-v2.js` track schema **не запрашивает** у AI
  «role» дня (setup / build / validate / ship / review). Категория
  есть, но она внутренняя.
- `frontend/ui/pages/progress.js` — titles в roadmap обрезаны до 22
  символов, видны только при hover. Юзер не видит свою неделю как
  историю.

### Что менять

**Schema (`ai-v2.js trackSchema`):**
- Добавить enum-поле `role` в каждый день:
  - `setup` — Day 1 обычно
  - `build` — основная работа
  - `validate` — получить обратную связь
  - `ship` — выпустить
  - `recover` — облегчённый день (если у юзера blocker = `motivation` /
    `overwhelmed`)
  - `review` — оглянуться
- AI должен возвращать roles такие, чтобы неделя имела arc:
  `[setup, build, build, validate, build, ship, review]` или подобный.

**Roadmap (`components/roadmap.js`):**
- Визуально дифференцировать узлы по role:
  - Размер: setup/review чуть меньше, ship чуть больше
  - Иконка внутри узла вместо цифры (одна на role): • / ▲ / ◆ / ★ / ✓
  - Цвет акцента: ship-day подсвечен другим цветом
- Под каждым узлом — **короткий ярлык по умолчанию (не hover)**: 1–2
  слова. Не полный title — а **тип дня** («Day 1 · setup», «Day 7 ·
  ship»).
- На `/today` (compact) — оставить только нумерацию + role-icon, без
  лейблов.
- На `/progress` (full) — показать titles на 2 строки (без обрезки до
  22 символов, переносить).

**Storytelling-line на /plan-preview:**
- Перед списком дней — одно предложение: «Your week: 2 days of setup,
  3 days of building, 1 day of validation, 1 day of shipping.»
- Динамически собирается из roles.

### Acceptance criteria
- На скриншоте `/plan-preview` видно структуру недели, а не плоский
  список.
- Узлы roadmap визуально различимы — юзер понимает, что Day 7 «другой».
- В `/progress` roadmap читается без hover.

### Объём
- Schema + prompt: 40 строк в `ai-v2.js`.
- Roadmap component rewrite: 60–80 строк (умеренный рефактор).
- Plan-preview одна строка-summary: 20 строк.
- Validation: добавить `role` в `validateDayPlan`.

---

## Проблема 4 — Нет артефактов после выполнения дня

### Симптом
Юзер сделал Day 1. Что у него в продукте осталось? Зелёный узел в
roadmap. И всё. Никакой карточки, ничего, что можно открыть и
посмотреть «а что я там написал».

### Доказательства
- `frontend/ui/pages/progress.js:79-98` (`renderDayCard`) — показывает
  title и status, но **не показывает proof.value**, не показывает
  agentSession output, ничего из того, что юзер реально ввёл.
- `frontend/core/state-model.js` — `today.proof.value` хранится, но
  нигде не отображается после submission.
- `frontend/domain/today-engine.js` — `rolloverIfNeeded` сохраняет день
  в history, но не строит read-only «snapshot» для просмотра.

### Что менять

**Day artifact concept:**
Каждый завершённый день имеет **artifact** — структура:
```
{
  dayNumber, title, role, completedAt,
  proof: { type, value },
  agentSession: { steps: [{text, output}], proofNote },
  reflection: optional 1-liner от AI
}
```
Эти данные **уже есть** в state. Нужен только UI.

**`/progress` day card:**
- Клик на день → раскрывается inline-блок (или модалка): proof,
  agent-output, дата завершения.
- Сделать day-card visually clickable (cursor, hover, focus ring).

**Day artifact card visual:**
- Простая HTML-карточка (без canvas) с фирменным дизайном:
  bracket-corners, monospace day-number, title, proof excerpt, дата.
- Это первая итерация. Image generation (mechanic 2 strategy doc) —
  потом.

**Recap (`/recap`):**
- Сейчас показывает только stats + reflection. Добавить **timeline из
  artifact-cards** — 7 штук в ряд (или вертикально на mobile). Это
  превращает recap в «вот, что я сделал».

### Acceptance criteria
- В `/progress` клик на любую завершённую day card открывает details
  с proof и agent output.
- В `/recap` юзер видит 7 artifact-cards в один взгляд.
- Если юзер пропустил день — карточка статуса (skipped/missed)
  отображается тоже, не прячется.

### Объём
- ~120 строк HTML/JS в `progress.js` (expandable card).
- ~80 строк в `recap.js` (artifact timeline).
- CSS для artifact card: ~40 строк.
- Без новых AI-вызовов.

---

## Проблема 5 — Внутренняя таксономия течёт в UI

### Симптом
- `60 min · write`
- `PENDING` / `BLOCKED` / `RESCUED` (uppercase бейджи)
- `DAY 1 OF 7` (uppercase везде)
- `Done means: …`

Звучит как админ-софт.

### Доказательства
- `frontend/ui/pages/today.js:253` — `${dayPlan.category}` напрямую
  показывается. Категории из `ai-v2.js`: `research | build | outreach
  | review | test | write | practice | other`.
- `frontend/ui/pages/today.js:14-22` (`STATUS_LABEL`) — статусы
  человекочитаемые, но всё равно показываются как бейджи рядом с
  заголовком, что усиливает «system»-ощущение.
- `frontend/style.css` — uppercase + letter-spacing на множестве
  классов: `.v2-kicker`, `.v2-section-label`, `.v2-today-action`.
- `frontend/ui/pages/today.js:234` — `<div class="v2-today-action">
  Today's mission</div>` — это шапка, ОК, но в сочетании со всеми
  остальными uppercase'ами создаёт перегруз.

### Что менять

**Категории:**
- Убрать `category` из mission meta line. Оставить только время.
- Если оставлять — мэппить на human label: `write` → «writing», `build`
  → «build», `research` → «research and notes», `outreach` →
  «reaching out». Но проще убрать.

**Status badges:**
- На `/today` убрать бейдж `PENDING` совсем. Если день не done, статус
  очевиден из контекста (там показана задача и кнопка «Start»). Это
  чистый noise.
- Оставить badge только в `/progress` для прошлых дней.

**Uppercase pass:**
- `.v2-kicker` (DAY 1 OF 7) — оставить uppercase, но letter-spacing
  уменьшить.
- `.v2-today-action` («Today's mission») — убрать uppercase и
  letter-spacing полностью. Сделать обычным italic или просто muted
  small. Сейчас читается как `// TODO comment in code`.
- `.v2-section-label` — на 3 экранах убрать вовсе (заменить на
  обычный `<h3>`), оставить только в settings/danger zone where it
  signals «admin» semantics — и это OK.

**Done means:**
- Переформулировать в продукте: вместо «Done means: X» →
  «You're done when X». Промпт в `track_generate` уже выдаёт
  successCriteria — нужно поменять рендер.

### Acceptance criteria
- На скриншоте `/today` нет ни одного uppercase-блока, кроме «DAY 1 OF
  7» в шапке.
- Категория не показана.
- Бейдж `PENDING` не показан.
- «Done means: …» переписан в «You're done when …».

### Объём
- ~30 строк правок copy + CSS.
- Без AI-изменений.

---

## Проблема 6 — Продукт не знает юзера, хотя имеет всю инфу

### Симптом
Юзер указал project, weekGoal, why, blocker — продукт нигде об этом не
вспоминает (кроме одной генерации трека). Mission card говорит «the
plan», не «your fitness plan».

### Доказательства
- `frontend/domain/morning-brief.js` (только что добавлен) — единственное
  место, где `user.currentProject` используется кроме AI-промпта.
- `frontend/ui/pages/today.js`, `recap.js`, `progress.js` — нет ссылок
  на `user.weekGoal`, `user.whyItMatters`, `user.triedBefore`.
- `frontend/services/ai-v2.js` agent_steps prompt не получает user
  context — только day и track (см. проблему 2).

### Что менять

**Везде ссылаться на проект, не на абстракцию:**
- Mission title: AI должен выдавать с привязкой (см. проблема 1). На
  UI-уровне дополнительно добавить под title — **«for your ${truncate
  (user.weekGoal, 40)}»** мелким шрифтом, если weekGoal есть.
- В `/progress` headline сейчас `${track.goal}` — добавить ниже
  «By Day 7: ${user.weekGoal}» как reminder.
- В `/recap` first card: «${user.whyItMatters}» как цитата вверху —
  напоминаем зачем юзер это делал.
- В `agent.js` context-panel: вместо «Day X of 7 / track.goal» —
  «Working on: ${user.currentProject || track.goal}».

**Yesterday-callback:**
- На `/today` под mission card добавить мини-блок «Yesterday: ${prev.
  taskTitle}» с status icon. Это уже есть в morning brief, но
  визуально проявить — сильно дёшево, сильный эффект.

**Telegram messages:**
- В `backend/server.js` шаблоны Telegram-pings включают `userName` уже,
  но не `weekGoal` / `currentProject`. Добавить.

### Acceptance criteria
- На `/today` юзер видит ссылку на свой проект минимум в 2 местах
  (mission area + yesterday callback).
- На `/recap` whyItMatters процитирован сверху.
- В Agent Mode контекст-панель показывает project name, а не абстрактный
  track.goal.

### Объём
- ~60 строк правок в 4 файлах: today, recap, progress, agent.
- Backend Telegram: ~20 строк в `server.js`.

---

## Проблема 7 — Нет ни одного момента, ради которого открывают

### Симптом
Нажал «Done» — перешло. Нажал «Complete Step» — перешло. Завершил день
— перешло. Никакой реакции, никакой эмоции.

### Доказательства
- `frontend/ui/pages/today.js` — все `onClick` навигируют без
  feedback.
- `frontend/ui/pages/agent.js:114-120` (`#ag-complete`) — `btn.textContent
  = 'Saving…'` и редирект. Никакой анимации, ничего.
- `frontend/ui/components/roadmap.js` — статичная SVG, без transitions
  при переходе узла из pending в done.

### Что менять

**Один signature moment — «day completion ritual»:**

Когда юзер успешно завершает день (после verdict='met' в agent или
proof verdict 'met'):

1. Roadmap-узел заполняется цветом с CSS animation (200ms ease-out
   scale 1.0 → 1.2 → 1.0 + fill).
2. Внизу экрана появляется **inline reflection card** на 3 секунды:
   - AI-цитата дня (одна строка) — генерится дешёвым промптом или
     берётся из шаблонов (на MVP — шаблоны)
   - Day number + role icon
   - Кнопка «Save to my week» (на Day 7 → «Continue to Recap»)
3. Тихий звук «click» опционально (Web Audio, можно toggle в Settings).

Это всё. Один момент. Узнаваемый. Повторяется 7 раз за неделю + Recap
финал.

**Recap moment:**
- При первом открытии `/recap` reflection auto-load (уже сделано).
- Добавить sequential reveal: stats → patterns → reflection → CTAs с
  delay 400ms между блоками. Это даёт ощущение «momentum».

**Animations CSS:**
- Один файл `frontend/style.css` секция «animations»:
  - `@keyframes node-complete`
  - `@keyframes card-reveal`
  - Reusable `.v2-animate-in` class
- Без motion-library. Чистый CSS.

### Acceptance criteria
- Завершение дня вызывает visible visual change в roadmap (не
  мгновенный refresh).
- На `/recap` блоки появляются последовательно, не одновременно.
- Юзер запоминает «момент завершения дня» как distinct experience.

### Объём
- ~50 строк CSS animations.
- ~30 строк JS в today.js / agent.js для триггера.
- Без новых AI-вызовов на MVP (использовать шаблоны для quote-of-the-day).

---

## Приоритизация и PR-план

### PR #A — AI quality (Проблемы 1 + 2)
**Самый важный.** Без качественного AI-output остальное косметика.
- Переписать `track_generate` промпт + few-shot
- Переписать `agent_steps` промпт + передать user context
- Schema: добавить `output` в step, `role` в day
- Fallback functions переписать
- ~250 строк изменений, всё в `ai-v2.js` + 2 schema-файлах
- **Без UI изменений.** Можно мерджить и сразу видеть разницу.

### PR #B — Storytelling roadmap + artifact view (Проблемы 3 + 4)
**Зависит от PR #A** (нужно `role` в day schema).
- Roadmap component переработка под roles
- Plan-preview week summary line
- Progress: expandable day card с artifact
- Recap: artifact timeline
- ~300 строк
- **UI-only.**

### PR #C — Personalization + taxonomy cleanup (Проблемы 5 + 6)
**Независимый, можно параллельно.**
- Везде ссылки на user.currentProject / weekGoal / whyItMatters
- Убрать `PENDING` badge с today
- Uppercase pass — снизить шум
- «Done means» → «You're done when»
- ~100 строк
- **Чисто UI/copy.**

### PR #D — Day completion ritual (Проблема 7)
**Финальный, делает feel.**
- CSS animations
- Trigger в today/agent на success verdict
- Sequential reveal в recap
- ~80 строк
- **UI + CSS only.**

### Порядок мерджа
1. PR #A — фундамент качества
2. PR #C — параллельно с #A, не зависит
3. PR #B — после #A (нужен `role`)
4. PR #D — последний, polish

---

## Что НЕ в плане (умышленно)

- **Day artifact image generation** (canvas-based shareable cards) —
  отдельный effort, после того как text-artifacts заработают.
- **Agent Mode focus session с таймером** — мощная фича, но не починит
  главное (AI quality). Делать после.
- **Image-based onboarding / иллюстрации** — отдельная дизайн-итерация.
- **Mobile media-queries pass** — нужен, но не блокирует «feel».
- **Audio feedback** — упомянут в #D, но opt-in, не блокирующий.
- **Day 7 documentary scroll** — Phase 2 из стратегии. Сначала надо
  чтобы текущий recap работал.

---

## Критерий «всё получилось»

После всех 4 PR'ов:

1. **Реальный юзер с fitness goal** в onboarding'е получает Day 1:
   *«Pick 3 exercises (1 push, 1 pull, 1 legs). Set rep schemes. Choose
   3 specific days this week. Write it down.»*
   Не: «Define your workout plan.»

2. **Agent шаги** не содержат `open`, `decide`, `think`. Каждый шаг —
   действие с output'ом.

3. **На `/today`** юзер видит свой `currentProject` и `weekGoal` — не
   абстракцию.

4. **На `/progress`** юзер может кликнуть на завершённый день и увидеть,
   что он там реально сделал.

5. **Roadmap** выглядит как arc недели, не как метро-карта.

6. **Завершение дня** даёт visible visual момент.

7. **Recap** на Day 7 показывает 7 artifact-cards как timeline.

Если каждый из этих пунктов выполнен — продукт «реально полезный».

---

**Документы для cross-reference:**
- `docs/UX_IMPROVEMENTS_PLAN.md` — предыдущий план UX-исправлений
- `docs/OUTSTANDING_PHASE1_PLAN.md` — Phase 1 (morning brief, streak,
  soft return, audit fixes)
- `docs/STRIVEAI_V2_AI_ACTIONS.md` — текущие AI-actions specs (надо
  обновить при изменении промптов)
