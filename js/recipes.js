/* ==========================================================================
   recipes.js — страница «Рецепты праздничного стола»

   Два режима:
   - «Все рецепты» — обычный список с поиском и категориями;
   - «Выбранные» — чекбоксы и подборка, для которой формируется код.

   Код кодирует набор рецептов в самодостаточную строку HV1-...
   и дублируется в адресе ?code=... — ссылку можно отправить другому.
   ========================================================================== */

(function () {
  'use strict';

  var refs = {
    codePanel: document.querySelector('.code-panel'),
    codeForm: document.querySelector('[data-code-form]'),
    codeInput: document.querySelector('[data-code-input]'),
    codeStatus: document.querySelector('[data-code-status]'),
    viewSwitch: document.querySelector('[data-view-switch]'),
    modeButtons: Array.prototype.slice.call(document.querySelectorAll('[data-mode]')),
    filters: document.querySelector('[data-filters]'),
    search: document.querySelector('[data-search]'),
    chips: document.querySelector('[data-chips]'),
    picker: document.querySelector('[data-picker]'),
    pickerList: document.querySelector('[data-picker-list]'),
    pickerCount: document.querySelector('[data-picker-count]'),
    selectedBadge: document.querySelector('[data-selected-badge]'),
    codeBox: document.querySelector('[data-code-box]'),
    codeOutput: document.querySelector('[data-code-output]'),
    copyCode: document.querySelector('[data-copy-code]'),
    copyLink: document.querySelector('[data-copy-link]'),
    copyStatus: document.querySelector('[data-copy-status]'),
    resultsTitle: document.querySelector('[data-results-title]'),
    grid: document.querySelector('[data-grid]'),
    count: document.querySelector('[data-count]'),
    empty: document.querySelector('[data-empty]'),
    emptyText: document.querySelector('[data-empty-text]'),
    emptyReset: document.querySelector('[data-reset-empty]'),
    error: document.querySelector('[data-error]'),
    dialog: document.querySelector('[data-dialog]'),
    dialogCategory: document.querySelector('[data-dialog-category]'),
    dialogTitle: document.querySelector('[data-dialog-title]'),
    dialogDesc: document.querySelector('[data-dialog-desc]'),
    dialogMeta: document.querySelector('[data-dialog-meta]'),
    dialogIngredients: document.querySelector('[data-dialog-ingredients]'),
    dialogSteps: document.querySelector('[data-dialog-steps]'),
    dialogTip: document.querySelector('[data-dialog-tip]'),
    dialogStorage: document.querySelector('[data-dialog-storage]'),
    dialogAllergens: document.querySelector('[data-dialog-allergens]')
  };

  var state = {
    mode: 'all',
    query: '',
    category: 'all',
    total: 0,
    allIds: [],
    selected: Object.create(null),
    code: '',
    lastFocus: null
  };

  var resets = Array.prototype.slice.call(document.querySelectorAll('[data-reset]'));
  var year = document.querySelector('[data-year]');
  var copyTimer = null;

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  if (!refs.grid || !refs.dialog || !refs.filters || !refs.picker) {
    return;
  }

  RecipeStore.load().then(start).catch(fail);

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text != null) {
      node.textContent = text;
    }
    return node;
  }

  function setText(node, text) {
    if (node) {
      node.textContent = text == null ? '' : text;
    }
  }

  function hide(node, hidden) {
    if (node) {
      node.hidden = hidden;
    }
  }

  function normalize(value) {
    return RecipeStore.normalize(value);
  }

  function plural(number) {
    return RecipeStore.plural(number, ['рецепт', 'рецепта', 'рецептов']);
  }

  function selectedIds() {
    return state.allIds.filter(function (id) {
      return state.selected[id] === true;
    });
  }

  function selectedCount() {
    return selectedIds().length;
  }

  function selectedRecipes() {
    return selectedIds().map(function (id) {
      return RecipeStore.get(id);
    }).filter(Boolean);
  }

  function start() {
    state.total = RecipeStore.all().length;
    state.allIds = RecipeStore.all().map(function (recipe) {
      return recipe.id;
    });

    buildChips();
    buildPicker();
    bindEvents();

    setMode('all', true);
    refs.codePanel.hidden = false;
    refs.filters.hidden = false;
    refs.viewSwitch.hidden = false;

    applyCodeFromUrl();
    openFromHash();
  }

  function fail(error) {
    refs.filters.hidden = true;
    refs.viewSwitch.hidden = true;
    refs.picker.hidden = true;
    refs.codeBox.hidden = true;
    hide(refs.codePanel, true);
    refs.grid.textContent = '';
    hide(refs.empty, true);
    hide(refs.count, false);
    setText(refs.count, '');
    if (refs.error) {
      refs.error.hidden = false;
      refs.error.textContent = window.location.protocol === 'file:'
        ? 'Не удалось загрузить базу рецептов: не найден data/recipes.bundle.js. '
          + 'Пересоберите его командой python3 tools/sync_recipes.py.'
        : 'Не удалось загрузить data/recipes.json (' + (error && error.message) + '). '
          + 'Проверьте, что файл лежит на месте.';
    }
  }

  function setMode(mode, skipUrl) {
    state.mode = mode === 'selected' ? 'selected' : 'all';
    updateModeUI();
    render();
    syncCodeState(!!skipUrl);
  }

  function updateModeUI() {
    refs.modeButtons.forEach(function (button) {
      var active = button.getAttribute('data-mode') === state.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    refs.picker.hidden = state.mode !== 'selected';
    refs.codeBox.hidden = state.mode !== 'selected' || !state.code;
  }

  function buildChips() {
    var counts = RecipeStore.countByCategory();
    var fragment = document.createDocumentFragment();

    fragment.appendChild(chipButton('all', 'Все', state.total));
    RecipeStore.categories().forEach(function (category) {
      var count = counts[category.id] || 0;
      if (count) {
        fragment.appendChild(chipButton(category.id, category.title, count));
      }
    });

    refs.chips.textContent = '';
    refs.chips.appendChild(fragment);
  }

  function chipButton(id, title, count) {
    var button = el('button', 'chip-filter', title + ' · ' + count);
    button.type = 'button';
    button.setAttribute('data-category', id);
    button.setAttribute('aria-pressed', id === state.category ? 'true' : 'false');
    return button;
  }

  function buildPicker() {
    var counts = RecipeStore.countByCategory();
    var recipes = RecipeStore.all();
    var fragment = document.createDocumentFragment();

    RecipeStore.categories().forEach(function (category) {
      var count = counts[category.id] || 0;
      if (!count) {
        return;
      }

      var group = el('div', 'picker-group');
      group.setAttribute('data-pick-group', category.id);

      var heading = el('h3', 'picker-group-title');
      heading.appendChild(document.createTextNode(category.title + ' '));
      heading.appendChild(el('span', 'picker-group-count', String(count)));
      group.appendChild(heading);

      var list = el('ul', 'picker-items');
      recipes.forEach(function (recipe) {
        if (recipe.category !== category.id) {
          return;
        }

        var item = el('li', 'picker-item');
        item.setAttribute('data-pick-row', recipe.id);
        item.setAttribute('data-category', category.id);
        item.setAttribute('data-search', RecipeStore.searchText(recipe));

        var label = el('label', 'picker-label');
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('data-pick', recipe.id);
        input.value = recipe.id;

        var text = el('span', 'picker-text');
        text.appendChild(el('span', 'picker-title', recipe.title));

        var cuisine = RecipeStore.cuisineById(recipe.cuisine);
        var meta = [
          recipe.servings + ' ' + RecipeStore.plural(recipe.servings, ['порция', 'порции', 'порций']),
          recipe.yield,
          cuisine ? cuisine.title : ''
        ].filter(Boolean).join(' · ');
        text.appendChild(el('span', 'picker-meta', meta));

        label.appendChild(input);
        label.appendChild(text);
        item.appendChild(label);
        list.appendChild(item);
      });

      group.appendChild(list);
      fragment.appendChild(group);
    });

    refs.pickerList.textContent = '';
    refs.pickerList.appendChild(fragment);
  }

  function render() {
    var filtered = state.query.trim() !== '' || state.category !== 'all';
    var list;

    if (state.mode === 'all') {
      list = RecipeStore.query({ query: state.query, category: state.category });
      renderCards(list);
      setText(refs.resultsTitle, 'Все рецепты');
      updateCount(list.length, filtered, false);
      showEmpty(list.length === 0, false, filtered);
    } else {
      list = selectedRecipes();
      renderCards(list);
      setText(refs.resultsTitle, 'Выбранные рецепты');
      updateCount(list.length, filtered, true);
      showEmpty(list.length === 0, true, filtered);
      filterPicker();
    }

    updateBadge();
    updateResets(filtered);
    updateChips();
  }

  function updateCount(shown, filtered, selectedMode) {
    if (!refs.count) {
      return;
    }
    if (selectedMode) {
      refs.count.textContent = 'Выбрано ' + shown + ' из ' + state.total;
      return;
    }
    if (filtered) {
      refs.count.textContent = 'Найдено ' + shown + ' из ' + state.total;
      return;
    }
    refs.count.textContent = state.total + ' ' + plural(state.total);
  }

  function showEmpty(isEmpty, selectedMode, filtered) {
    hide(refs.empty, !isEmpty);
    if (!isEmpty) {
      return;
    }
    setText(
      refs.emptyText,
      selectedMode
        ? 'Пока ничего не выбрано. Отметьте блюда в списке выше — они появятся здесь.'
        : 'Ничего не найдено. Попробуйте другое слово или сбросьте фильтры.'
    );
    hide(refs.emptyReset, selectedMode || !filtered);
  }

  function updateResets(filtered) {
    resets.forEach(function (button) {
      if (button.hasAttribute('data-reset-empty')) {
        return;
      }
      button.hidden = !filtered;
    });
  }

  function updateBadge() {
    setText(refs.selectedBadge, String(selectedCount()));
  }

  function updateChips() {
    var chips = refs.chips.querySelectorAll('[data-category]');
    Array.prototype.forEach.call(chips, function (chip) {
      var active = chip.getAttribute('data-category') === state.category;
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function filterPicker() {
    var query = normalize(state.query);
    var visible = 0;

    Array.prototype.forEach.call(
      refs.pickerList.querySelectorAll('[data-pick-row]'),
      function (row) {
        var category = row.getAttribute('data-category');
        var text = row.getAttribute('data-search') || '';
        var matches = (state.category === 'all' || category === state.category)
          && (!query || text.indexOf(query) !== -1);
        row.hidden = !matches;
        if (matches) {
          visible += 1;
        }
      }
    );

    Array.prototype.forEach.call(
      refs.pickerList.querySelectorAll('[data-pick-group]'),
      function (group) {
        var hasVisible = false;
        Array.prototype.forEach.call(
          group.querySelectorAll('[data-pick-row]'),
          function (row) {
            if (!row.hidden) {
              hasVisible = true;
            }
          }
        );
        group.hidden = !hasVisible;
      }
    );

    if (!refs.pickerCount) {
      return;
    }
    if (!visible) {
      refs.pickerCount.textContent = 'Ничего не найдено — измените фильтр.';
    } else if (visible === state.total) {
      refs.pickerCount.textContent = 'Все ' + state.total + ' ' + plural(state.total)
        + ' · отметьте нужные блюда.';
    } else {
      refs.pickerCount.textContent = 'Показано ' + visible + ' из ' + state.total
        + ' · отметьте нужные блюда.';
    }
  }

  function renderCards(list) {
    refs.grid.textContent = '';
    var fragment = document.createDocumentFragment();
    list.forEach(function (recipe) {
      fragment.appendChild(buildCard(recipe));
    });
    refs.grid.appendChild(fragment);
  }

  function buildCard(recipe) {
    var item = el('li', 'recipe-item');
    var button = el('button', 'recipe-card');
    button.type = 'button';
    button.setAttribute('data-recipe', recipe.id);
    button.setAttribute('aria-haspopup', 'dialog');

    var category = RecipeStore.categoryById(recipe.category);
    var icon = el('span', 'recipe-icon', category && category.icon ? category.icon : '🍽');
    icon.setAttribute('aria-hidden', 'true');

    var body = el('span', 'recipe-body');
    body.appendChild(el('span', 'recipe-title', recipe.title));
    body.appendChild(el('span', 'recipe-desc', recipe.description));
    body.appendChild(el('span', 'recipe-meta', cardMeta(recipe)));

    var tags = el('span', 'recipe-tags');
    (recipe.tags || []).slice(0, 3).forEach(function (tag) {
      tags.appendChild(el('span', 'tag tag-sage', tag));
    });
    if (tags.childNodes.length) {
      body.appendChild(tags);
    }

    button.appendChild(icon);
    button.appendChild(body);
    item.appendChild(button);
    return item;
  }

  function cardMeta(recipe) {
    var servings = recipe.servings + ' '
      + RecipeStore.plural(recipe.servings, ['порция', 'порции', 'порций']);
    var parts = [servings];
    if (recipe.yield) {
      parts.push(recipe.yield);
    }
    parts.push(RecipeStore.formatTime(RecipeStore.totalTime(recipe)));
    var difficulty = RecipeStore.difficultyLabel(recipe.difficulty);
    if (difficulty) {
      parts.push(difficulty);
    }
    return parts.join(' · ');
  }

  function fillDialog(recipe) {
    var category = RecipeStore.categoryById(recipe.category);
    var cuisine = RecipeStore.cuisineById(recipe.cuisine);
    var holidays = (recipe.holidays || []).map(function (id) {
      var holiday = RecipeStore.holidayById(id);
      return holiday ? holiday.title : id;
    });
    var kicker = [
      category ? category.title : '',
      cuisine ? cuisine.title : '',
      holidays.join(', ')
    ].filter(Boolean).join(' · ');

    setText(refs.dialogCategory, kicker);
    setText(refs.dialogTitle, recipe.title);
    setText(refs.dialogDesc, recipe.description);

    fillMeta(recipe);
    fillIngredients(recipe.ingredients || []);
    fillSteps(recipe.steps || []);

    var tip = recipe.tips || '';
    setText(refs.dialogTip, tip);
    hide(refs.dialogTip, !tip);

    var storage = recipe.storage ? 'Хранение: ' + recipe.storage : '';
    setText(refs.dialogStorage, storage);
    hide(refs.dialogStorage, !storage);

    var allergens = (recipe.allergens || []).join(', ');
    setText(refs.dialogAllergens, allergens ? 'Аллергены: ' + allergens : '');
    hide(refs.dialogAllergens, !allergens);

    var body = refs.dialog.querySelector('.dialog-body');
    if (body) {
      body.scrollTop = 0;
    }
  }

  function fillMeta(recipe) {
    var time = recipe.time || {};
    var rows = [
      ['Порции', recipe.servings + ' '
        + RecipeStore.plural(recipe.servings, ['порция', 'порции', 'порций'])],
      ['Подготовка', RecipeStore.formatTime(time.prep)]
    ];

    if (time.cook) {
      rows.push(['Готовка', RecipeStore.formatTime(time.cook)]);
    }
    rows.push(['Всего', RecipeStore.formatTime(RecipeStore.totalTime(recipe))]);

    if (recipe.yield) {
      rows.push(['Выход', recipe.yield]);
    }
    var difficulty = RecipeStore.difficultyLabel(recipe.difficulty);
    if (difficulty) {
      rows.push(['Сложность', difficulty]);
    }

    refs.dialogMeta.textContent = '';
    rows.forEach(function (row) {
      var item = el('div', 'dialog-meta-item');
      item.appendChild(el('dt', '', row[0]));
      item.appendChild(el('dd', '', row[1]));
      refs.dialogMeta.appendChild(item);
    });
  }

  function fillIngredients(ingredients) {
    refs.dialogIngredients.textContent = '';
    ingredients.forEach(function (ingredient) {
      var row = document.createElement('tr');
      var name = document.createElement('th');
      name.scope = 'row';
      name.appendChild(document.createTextNode(ingredient.name));
      if (ingredient.note && ingredient.amount != null) {
        name.appendChild(document.createTextNode(' '));
        name.appendChild(el('span', 'ing-note', ingredient.note));
      }
      row.appendChild(name);
      row.appendChild(el('td', 'ing-amount', RecipeStore.formatAmount(ingredient)));
      refs.dialogIngredients.appendChild(row);
    });
  }

  function fillSteps(steps) {
    refs.dialogSteps.textContent = '';
    steps.forEach(function (step) {
      refs.dialogSteps.appendChild(el('li', '', step));
    });
  }

  function openRecipe(id, trigger) {
    var recipe = RecipeStore.get(id);
    if (!recipe) {
      return;
    }

    fillDialog(recipe);
    state.lastFocus = trigger || document.activeElement;

    if (typeof refs.dialog.showModal === 'function') {
      if (!refs.dialog.open) {
        refs.dialog.showModal();
      }
    } else {
      refs.dialog.setAttribute('open', '');
    }

    document.body.classList.add('has-dialog');
    setHash(recipe.id);
  }

  function closeRecipe() {
    if (typeof refs.dialog.close === 'function' && refs.dialog.open) {
      refs.dialog.close();
    } else {
      refs.dialog.removeAttribute('open');
      cleanupDialog();
    }
    clearHash();
  }

  function cleanupDialog() {
    document.body.classList.remove('has-dialog');
    var focus = state.lastFocus;
    state.lastFocus = null;
    if (focus && typeof focus.focus === 'function') {
      focus.focus();
    }
  }

  function setHash(id) {
    try {
      history.replaceState(null, '', location.pathname + location.search + '#' + id);
    } catch (error) {
      location.hash = id;
    }
  }

  function clearHash() {
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (error) {
      /* на file:// replaceState может быть запрещён — оставляем адрес как есть */
    }
  }

  function openFromHash() {
    var raw = (location.hash || '').replace(/^#/, '');
    if (!raw) {
      return;
    }
    var id = raw;
    try {
      id = decodeURIComponent(raw);
    } catch (error) {
      id = raw;
    }
    if (RecipeStore.get(id)) {
      openRecipe(id, null);
    }
  }

  function onPickChange(event) {
    var input = event.target;
    if (!input || !input.matches || !input.matches('[data-pick]')) {
      return;
    }
    var id = input.getAttribute('data-pick');
    if (input.checked) {
      state.selected[id] = true;
    } else {
      delete state.selected[id];
    }
    updateSelectionState();
  }

  function updateSelectionState() {
    updateBadge();
    syncCodeState(false);
    render();
  }

  function setPick(input, checked) {
    var id = input.getAttribute('data-pick');
    input.checked = checked;
    if (checked) {
      state.selected[id] = true;
    } else {
      delete state.selected[id];
    }
  }

  function selectVisible() {
    Array.prototype.forEach.call(
      refs.pickerList.querySelectorAll('[data-pick-row]'),
      function (row) {
        if (row.hidden) {
          return;
        }
        var input = row.querySelector('[data-pick]');
        if (input) {
          setPick(input, true);
        }
      }
    );
    updateSelectionState();
  }

  function clearSelection() {
    Array.prototype.forEach.call(
      refs.pickerList.querySelectorAll('[data-pick]'),
      function (input) {
        setPick(input, false);
      }
    );
    updateSelectionState();
  }

  function syncPickerChecks() {
    Array.prototype.forEach.call(
      refs.pickerList.querySelectorAll('[data-pick]'),
      function (input) {
        input.checked = state.selected[input.getAttribute('data-pick')] === true;
      }
    );
  }

  function encodeSelection() {
    if (!window.SelectionCode) {
      return '';
    }
    return SelectionCode.encode(selectedIds(), state.allIds);
  }

  function syncCodeState(skipUrl) {
    var code = encodeSelection();
    state.code = code;
    if (refs.codeOutput) {
      refs.codeOutput.value = code;
    }
    refs.codeBox.hidden = state.mode !== 'selected' || !code;
    if (!skipUrl) {
      writeCodeToUrl(state.mode === 'selected' ? code : '');
    }
  }

  function writeCodeToUrl(code) {
    try {
      var url = new URL(location.href);
      if (code) {
        url.searchParams.set('code', code);
      } else {
        url.searchParams.delete('code');
      }
      var next = url.pathname + url.search + url.hash;
      var current = location.pathname + location.search + location.hash;
      if (next !== current) {
        history.replaceState(null, '', next);
      }
    } catch (error) {
      /* replaceState может быть недоступен на file:// */
    }
  }

  function applyCode(raw, source) {
    if (!window.SelectionCode) {
      showCodeStatus('Модуль кодов не загрузился — обновите страницу.', true);
      return false;
    }

    var result = SelectionCode.decode(raw, state.allIds);
    if (!result.ok) {
      showCodeStatus(codeErrorText(result.error), true);
      return false;
    }

    state.selected = Object.create(null);
    result.ids.forEach(function (id) {
      state.selected[id] = true;
    });
    state.query = '';
    state.category = 'all';
    if (refs.search) {
      refs.search.value = '';
    }
    state.mode = 'selected';
    updateModeUI();
    syncPickerChecks();
    render();
    syncCodeState(source === 'url');
    refs.codeInput.value = String(raw || '').trim();

    var message = 'Код применён: ' + result.ids.length + ' '
      + RecipeStore.plural(result.ids.length, ['рецепт', 'рецепта', 'рецептов']) + '.';
    if (result.missing) {
      message += ' ' + result.missing + ' '
        + RecipeStore.plural(result.missing, ['рецепт', 'рецепта', 'рецептов'])
        + ' из кода не найдено в базе.';
    }
    showCodeStatus(message, false);
    return true;
  }

  function applyCodeFromUrl() {
    var code = '';
    try {
      code = new URLSearchParams(location.search).get('code') || '';
    } catch (error) {
      code = '';
    }
    if (!code) {
      return;
    }
    refs.codeInput.value = code;
    applyCode(code, 'url');
  }

  function codeErrorText(error) {
    var messages = {
      empty: 'Введите код подборки.',
      format: 'Код не распознан. Проверьте, что он начинается с HV1- и скопирован полностью.',
      checksum: 'В коде опечатка: контрольная сумма не совпадает. Скопируйте его ещё раз.',
      'missing-all': 'В коде только рецепты, которых больше нет в базе.'
    };
    return messages[error] || 'Не удалось применить код.';
  }

  function showCodeStatus(message, isError) {
    if (!refs.codeStatus) {
      return;
    }
    refs.codeStatus.textContent = message;
    refs.codeStatus.classList.toggle('is-error', !!isError);
    refs.codeStatus.classList.toggle('is-ok', !isError && !!message);
  }

  function showCopyStatus(message, isError) {
    if (!refs.copyStatus) {
      return;
    }
    if (copyTimer) {
      window.clearTimeout(copyTimer);
    }
    refs.copyStatus.textContent = message;
    refs.copyStatus.classList.toggle('is-error', !!isError);
    refs.copyStatus.classList.toggle('is-ok', !isError);
    copyTimer = window.setTimeout(function () {
      refs.copyStatus.textContent = '';
      refs.copyStatus.classList.remove('is-error', 'is-ok');
    }, 4000);
  }

  function legacyCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (error) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }

  function copyText(text) {
    var clipboard = window.navigator && window.navigator.clipboard;
    if (clipboard && window.isSecureContext) {
      return clipboard.writeText(text).then(
        function () {
          return true;
        },
        function () {
          return legacyCopy(text);
        }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  function copyCode() {
    var code = (refs.codeOutput && refs.codeOutput.value) || state.code;
    if (!code) {
      showCopyStatus('Сначала выберите рецепты.', true);
      return;
    }
    copyText(code).then(function (ok) {
      showCopyStatus(ok ? 'Код скопирован.' : 'Не удалось скопировать код.', !ok);
      if (!ok && refs.codeOutput) {
        refs.codeOutput.focus();
        refs.codeOutput.select();
      }
    });
  }

  function copyLink() {
    var code = state.code || encodeSelection();
    if (!code) {
      showCopyStatus('Сначала выберите рецепты.', true);
      return;
    }

    var link;
    try {
      var url = new URL(location.href);
      url.searchParams.set('code', code);
      url.hash = '';
      link = url.toString();
    } catch (error) {
      link = location.href.split('#')[0].split('?')[0] + '?code=' + encodeURIComponent(code);
    }

    copyText(link).then(function (ok) {
      showCopyStatus(ok ? 'Ссылка скопирована.' : 'Не удалось скопировать ссылку.', !ok);
      if (!ok && refs.codeOutput) {
        refs.codeOutput.focus();
        refs.codeOutput.select();
      }
    });
  }

  function bindEvents() {
    refs.grid.addEventListener('click', function (event) {
      var target = event.target;
      var button = target && target.closest ? target.closest('[data-recipe]') : null;
      if (button) {
        openRecipe(button.getAttribute('data-recipe'), button);
      }
    });

    if (refs.search) {
      refs.search.addEventListener('input', function () {
        state.query = refs.search.value;
        render();
      });
    }

    refs.chips.addEventListener('click', function (event) {
      var chip = event.target.closest ? event.target.closest('[data-category]') : null;
      if (!chip) {
        return;
      }
      state.category = chip.getAttribute('data-category') || 'all';
      render();
    });

    refs.modeButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setMode(button.getAttribute('data-mode'), false);
      });
    });

    refs.pickerList.addEventListener('change', onPickChange);

    var selectVisibleButton = document.querySelector('[data-select-visible]');
    if (selectVisibleButton) {
      selectVisibleButton.addEventListener('click', selectVisible);
    }

    var clearButton = document.querySelector('[data-clear-selection]');
    if (clearButton) {
      clearButton.addEventListener('click', clearSelection);
    }

    if (refs.codeForm) {
      refs.codeForm.addEventListener('submit', function (event) {
        event.preventDefault();
        applyCode(refs.codeInput.value, 'form');
      });
    }

    if (refs.codeInput) {
      refs.codeInput.addEventListener('input', function () {
        showCodeStatus('', false);
      });
    }

    if (refs.copyCode) {
      refs.copyCode.addEventListener('click', copyCode);
    }
    if (refs.copyLink) {
      refs.copyLink.addEventListener('click', copyLink);
    }

    if (refs.codeOutput) {
      refs.codeOutput.addEventListener('focus', function () {
        refs.codeOutput.select();
      });
    }

    resets.forEach(function (button) {
      button.addEventListener('click', function () {
        if (refs.search) {
          refs.search.value = '';
        }
        state.query = '';
        state.category = 'all';
        if (state.mode === 'selected' && !selectedCount()) {
          setMode('all', false);
        } else {
          render();
        }
        if (refs.search) {
          refs.search.focus();
        }
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (button) {
      button.addEventListener('click', closeRecipe);
    });

    refs.dialog.addEventListener('click', function (event) {
      if (event.target !== refs.dialog) {
        return;
      }
      var rect = refs.dialog.getBoundingClientRect();
      var inside = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) {
        closeRecipe();
      }
    });

    refs.dialog.addEventListener('close', function () {
      cleanupDialog();
      clearHash();
    });

    var printButton = document.querySelector('[data-print]');
    if (printButton) {
      printButton.addEventListener('click', function () {
        document.body.classList.add('is-printing');
        window.print();
      });
    }

    window.addEventListener('afterprint', function () {
      document.body.classList.remove('is-printing');
    });

    document.addEventListener('keydown', function (event) {
      var typing = refs.search && refs.search.value !== '';
      if (event.key === 'Escape' && !refs.dialog.open && typing) {
        refs.search.value = '';
        state.query = '';
        render();
      }
    });

    window.addEventListener('hashchange', function () {
      var raw = (location.hash || '').replace(/^#/, '');
      if (!raw) {
        if (refs.dialog.open) {
          closeRecipe();
        }
        return;
      }
      var id = raw;
      try {
        id = decodeURIComponent(raw);
      } catch (error) {
        id = raw;
      }
      if (RecipeStore.get(id)) {
        openRecipe(id, null);
      }
    });
  }
}());
