# Code Review & Vulnerability Audit Report — Obsidian Request

**Дата проведения аудита:** 3 августа 2026  
**Проект:** Obsidian Request Plugin (`obsidian-request`)  
**Роль:** Senior Software Architect / Lead Code Reviewer  

---

## Executive Summary / Общая оценка

Проведен глубокий статико-динамический аудит кодовой базы плагина `obsidian-request`. Несмотря на то, что текущие базовые модульные тесты проходят (31 test passed), а компилятор `tsc` и базовый `eslint` не выдают фатальных ошибок, в проекте выявлена серия **скрытых архитектурных багов, потенциальных паник (crashes), нарушений immutability в React, утечек данных и логических гонок**, которые вызовут спонтанные глюки и падения плагина у пользователей.

В данном отчете сведены все выявленные проблемы с точными ссылками на исходный код, анализом первопричин (root cause) и рекомендациями по устранению, а также приведен предметный план по ужесточению линтеров (`eslint` и `tsconfig`).

---

## 1. Баги рантайма, паники и неотловленные ошибки (Runtime Crashes)

### 1.1 Небезопасное приведение типов в обработчиках событий Vault
* **Файл:** [`src/main.ts`](file:///home/angus123/project/js/obsidian-request/src/main.ts#L48-L75)
* **Строки:** 48–75
* **Проблема:** В обработчиках `this.app.vault.on('rename')` и `this.app.vault.on('delete')` аргумент `file` кастуется через `file as TFile` без проверки `file instanceof TFile`.
* **Почему это баг:** В Obsidian событие Vault срабатывает как для файлов (`TFile`), так и для папок (`TFolder`). Когда пользователь переименовывает или удаляет папку, `(file as TFile).extension` возвращает `undefined`. Вызов `await this.app.vault.read(tf)` на папке вызывает исключение в Obsidian API и блокирует обработку событий.
* **Решение:** Добавить явную проверку `if (!(file instanceof TFile)) return`.

### 1.2 Необработанные плавающие Promise в процессе рендеринга
* **Файл:** [`src/main.ts`](file:///home/angus123/project/js/obsidian-request/src/main.ts#L94-L105)
* **Строки:** 94–105
* **Проблема:** В `handleCodeBlock` вызов `loadCollection(this.app, pluginDir, collectionName).then(...)` не имеет цепи `.catch(...)`.
* **Почему это баг:** Любая сетевая ошибка или ошибка чтения/парсинга JSON файла коллекции приводит к `Unhandled Promise Rejection`. Ошибка скрыто падает в консоль разработчика Obsidian, а React-компонент остается в неопределенном (пустом) состоянии без информирования пользователя.
* **Решение:** Обернуть в `try-catch` или добавить `.catch((err) => console.error(err))`.

### 1.3 Синхронное падение `new URL()` вне блока `try-catch` при парсинге URL
* **Файл:** [`src/network.ts`](file:///home/angus123/project/js/obsidian-request/src/network.ts#L60)
* **Строки:** 60, 94
* **Проблема:** Вызов `new URL(url)` выполняется ДО общего блока `try-catch` на строке 159.
* **Почему это баг:** Если пользователь ввел невалидный URL (например, с пробелами, незаконченной переменной `{{baseUrl` или спецсимволами), `new URL(url)` выбрасывает синхронное исключение `TypeError: Invalid URL`, которое не перехватывается. Выполнение функции срывается до совершения запроса.
* **Решение:** Перенести конструктор `new URL()` внутрь общего блока `try-catch`.

### 1.4 Краш тач-событий на мобильных устройствах (`touchend`)
* **Файл:** [`src/ui/App.tsx`](file:///home/angus123/project/js/obsidian-request/src/ui/App.tsx#L84-L118)
* **Строки:** 84–118
* **Проблема:** Функция `getClientX` обращается к `e.touches[0]!.clientX`.
* **Почему это баг:** При наступлении события `touchend` массив `e.touches` пуст (`length === 0`), так как палец уже поднят с экрана. Обращение `e.touches[0]!.clientX` вызывает `TypeError: Cannot read properties of undefined (reading 'clientX')` при завершении ресайза сайдбара на тач-экранах (iOS / iPad / Android).
* **Решение:** Проверять `e.changedTouches[0]` для событий типа `touchend`.

### 1.5 Отсутствие обработки ошибок чтения файлов в Node.js стримах
* **Файл:** [`src/network.ts`](file:///home/angus123/project/js/obsidian-request/src/network.ts#L306)
* **Строки:** 306
* **Проблема:** `reqBody.pipe(req)` передает ReadStream файла без подписки на событие `.on('error')`.
* **Почему это баг:** Если при отправке `form-data` или `binary` файл блокируется ОС или пропадают права на чтение, стрим эмитит `error`. Так как обработчик вешается только на `req.on('error')`, ошибка стрима остается необработанной и может обрушить Node процесс Obsidian.
* **Решение:** Добавлять `reqBody.on('error', (err) => resolve({ error: err.message, timeMs: ... }))`.

---

## 2. Нарушения целостности данных и состояния UI (State & Immutability Bugs)

### 2.1 Прямая мутация state в React при Drag & Drop
* **Файл:** [`src/ui/App.tsx`](file:///home/angus123/project/js/obsidian-request/src/ui/App.tsx#L290)
* **Строки:** 290
* **Проблема:** `draggedItem.folderId = newFolderId` напрямую мутирует объект элемента, находящийся в React state.
* **Почему это баг:** В React прямой мутацией нарушается принцип неизменяемости (immutability). Из-за совпадения ссылок на объекты React Virtual DOM может пропустить перерендеринг или некорректно отобразить ветку элементов.
* **Решение:** Клонировать модифицируемый элемент: `const updatedDraggedItem = { ...draggedItem, folderId: newFolderId }`.

### 2.2 Образование бесконечной рекурсивной петли папок (Infinite Folder Loop)
* **Файл:** [`src/ui/App.tsx`](file:///home/angus123/project/js/obsidian-request/src/ui/App.tsx#L263-L275)
* **Строки:** 263–275
* **Проблема:** При перемещении папки (Drag & Drop) отсутствует валидация на попытку перенести родительскую папку внутрь её собственной дочерней папки.
* **Почему это баг:** Если перетащить Папку A внутрь её дочерней Папки B, то `A.folderId` становится равным `B.id`, при этом `B.folderId` равно `A.id`. Образуется зацикленный граф, который приводит к `RangeError: Maximum call stack size exceeded` при рендеринге дерева элементов.
* **Решение:** Реализовать функцию `isDescendant(parentFolderId, targetFolderId)` и блокировать переносы папок в собственных потомков.

### 2.3 Неполное (поверхностное) удаление папок (Orphaned Requests)
* **Файл:** [`src/ui/App.tsx`](file:///home/angus123/project/js/obsidian-request/src/ui/App.tsx#L365)
* **Строки:** 365
* **Проблема:** При удалении папки вычисляется фильтр: `r.id !== reqId && r.folderId !== reqId`.
* **Почему это баг:** Если внутри папки находились другие вложенные папки, то запросы из подпапок не будут удалены, а их `folderId` продолжит ссылаться на несуществующую удаленную папку (осиротевшие данные в JSON).
* **Решение:** Реализовать рекурсивный сбор всех `id` вложенных подпапок и запросов перед удалением.

### 2.4 Потеря структуры папок и ID-коллизии при импорте коллекций
* **Файлы:** [`src/importExport.ts`](file:///home/angus123/project/js/obsidian-request/src/importExport.ts#L43-L134), [`src/ui/App.tsx`](file:///home/angus123/project/js/obsidian-request/src/ui/App.tsx#L415)
* **Строки:** `importExport.ts`: 43, 134; `App.tsx`: 415
* **Проблема 1:** При импорте нативного формата `App.tsx` генерирует новые `id` для элементов, но **не перемапливает** поля `folderId` у запросов, в результате чего все импортированные запросы теряют привязку к своим папкам.
* **Проблема 2:** Генерация уникальных идентификаторов вида `Date.now().toString() + Math.random().toString(36)...` при быстрой генерации массива элементов в одной миллисекунде дает риск коллизий ключей React.
* **Решение:** Реализовать генерацию криптографически стойких UUID (или использовать генератор с инкрементальным счетчиком) и поддерживать `Map<OldFolderId, NewFolderId>` при импорте.

### 2.5 Ошибка парсинга Postman v2.1 URL при строковом представлении URL
* **Файл:** [`src/importExport.ts`](file:///home/angus123/project/js/obsidian-request/src/importExport.ts#L55-L137)
* **Строки:** 55, 137
* **Проблема:** Код рассчитывает, что `req.url` всегда является объектом с полями `raw` и `query`.
* **Почему это баг:** В спецификации Postman Collection v2.1 поле `url` может быть простой строкой (например, `"https://api.example.com/v1"`). При попытке прочитать `req.url.query` вызов упадет с `TypeError: Cannot read properties of undefined (reading 'query')`.
* **Решение:** Проверять `typeof req.url === 'string'` и корректно оборачивать исходную строку.

---

## 3. Глюки сетевого слоя и форматирования (Network & Formatter Bugs)

### 3.1 Сдвиг буфера в Node.js ArrayBuffer (`Buffer.buffer`)
* **Файл:** [`src/network.ts`](file:///home/angus123/project/js/obsidian-request/src/network.ts#L290)
* **Строки:** 290
* **Проблема:** Возврат `arrayBuffer: buffer.buffer` в `executeNodeRequest`.
* **Почему это баг:** В Node.js системный `Buffer` выделяется из общего пула памяти `ArrayBufferPool`. Обращение напрямую к `.buffer` возвращает **весь пул внешней памяти** (который может быть размером 8KB+), а не срез прочитанных данных. Это приводит к бинарному мусору и утечке чужих данных памяти при сохранении бинарных ответов.
* **Решение:** Использовать корректный срез: `buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)`.

### 3.2 Игнорирование настроек редиректов в режиме `executeNodeRequest`
* **Файл:** [`src/network.ts`](file:///home/angus123/project/js/obsidian-request/src/network.ts#L189-L314)
* **Строки:** 189–314
* **Проблема:** Стандартные модули `http` и `https` в Node.js не следуют по редиректам (301, 302, 307, 308).
* **Почему это баг:** Если у запроса установлен флаг `followRedirects: true`, но запрос выполняется через Node (например, при выключенной проверке SSL или загрузке файлов), настройка редиректов игнорируется и клиент возвращает ответ 30x вместо перехода по указанному URL.
* **Решение:** Реализовать цикл обработки заголовка `Location` в `executeNodeRequest` с учетом `maxRedirects`.

### 3.3 Ошибка подсвечивания синтаксиса JSON для строк с двоеточием
* **Файл:** [`src/ui/formatter.ts`](file:///home/angus123/project/js/obsidian-request/src/ui/formatter.ts#L8)
* **Строки:** 8
* **Проблема:** В `highlightJsonText` проверка `if (/:$/.test(match))` определяет, является ли токен ключом JSON.
* **Почему это баг:** Если обычное строковое значение заканчивается на двоеточие (например, `"Protocol:"`, `"http:"`, `"Note:"`), регулярное выражение считает это значение JSON-ключом и раскрашивает его стилем `json-key`.
* **Решение:** Регулярное выражение подсветки должно точнее различать `key:` и `"value"`.

### 3.4 Мутация глобального объекта дефолтной коллекции
* **Файл:** [`src/storage.ts`](file:///home/angus123/project/js/obsidian-request/src/storage.ts#L108)
* **Строки:** 108
* **Проблема:** При ошибке загрузки возвращается синглтон `DEFAULT_COLLECTION_DATA`.
* **Почему это баг:** Если вызывающий код модифицирует полученный объект, изменения сохраняются в глобальной константе `DEFAULT_COLLECTION_DATA` до перезапуска Obsidian.
* **Решение:** Всегда возвращать глубокую копию: `return JSON.parse(JSON.stringify(DEFAULT_COLLECTION_DATA))`.

---

## 4. План ужесточения линтеров и статического анализа

Для защиты кодовой базы от рецидивов указанных проблем требуется усилить правила проверки в `eslint.config.js` и `tsconfig.json`.

### 4.1 Изменения в `eslint.config.js`

1. **Включить строгие правила React Hooks:**
   ```js
   'react-hooks/rules-of-hooks': 'error',
   'react-hooks/exhaustive-deps': 'warn'
   ```
2. **Добавить строгость TypeScript и предотвращение неперехваченных Promise:**
   ```js
   '@typescript-eslint/no-floating-promises': 'error',
   '@typescript-eslint/no-misused-promises': 'error',
   '@typescript-eslint/no-non-null-assertion': 'error',
   '@typescript-eslint/no-unnecessary-condition': 'warn',
   '@typescript-eslint/await-thenable': 'error'
   ```
3. **Ужесточить `no-console`:**
   Изменить `'no-console': 'warn'` на запрет несанкционированных вылогов или замену на логгер плагина.

### 4.2 Изменения в `tsconfig.json`

Включить следующие строго контролирующие флаги компилятора:
```json
{
  "compilerOptions": {
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true
  }
}
```

---

## Чек-лист исправлений

- [ ] `src/main.ts`: добавить `file instanceof TFile` и `.catch()` в `handleCodeBlock`
- [ ] `src/network.ts`: обернуть `new URL` в `try-catch`, исправить `buffer.buffer.slice`, добавить обработку ошибок стримов и редиректов
- [ ] `src/ui/App.tsx`: убрать прямую мутацию `draggedItem.folderId`, добавить проверку `isDescendant`, исправить `touchend` событие
- [ ] `src/importExport.ts`: обработать строковый `req.url` для Postman v2.1, исправить генерацию UUID
- [ ] `src/ui/formatter.ts`: уточнить регулярное выражение определения ключей в `highlightJsonText`
- [ ] `eslint.config.js` & `tsconfig.json`: применить ужесточенные правила линтинга
