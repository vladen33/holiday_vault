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
    viewSwitch: document.querySelector('[data-view-switch]'),
    modeButtons: Array.prototype.slice.call(document.querySelectorAll('[data-mode]')),
    filters: document.querySelector('[data-filters]'),
    search: document.querySelector('[data-search]'),
    cuisineSelect: document.querySelector('[data-cuisine-filter]'),
    categorySelect: document.querySelector('[data-category-filter]'),
    clearSelection: document.querySelector('[data-clear-selection]'),
    dialogSelect: document.querySelector('.dialog-select'),
    selectedBadge: document.querySelector('[data-selected-badge]'),
    shareButton: document.querySelector('[data-share]'),
    shareCount: document.querySelector('[data-share-count]'),
    toast: document.querySelector('[data-toast]'),
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
    cuisine: 'all',
    total: 0,
    allIds: [],
    selected: Object.create(null),
    code: '',
    lastFocus: null
  };

  var resets = Array.prototype.slice.call(document.querySelectorAll('[data-reset]'));
  var year = document.querySelector('[data-year]');
  var toastTimer = null;

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  if (!refs.grid || !refs.dialog || !refs.filters
      || !refs.cuisineSelect || !refs.categorySelect) {
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

    buildFilters();
    bindEvents();

    setMode('all', true);
    refs.filters.hidden = false;
    refs.viewSwitch.hidden = false;

    applyCodeFromUrl();
    openFromHash();
  }

  function fail(error) {
    refs.filters.hidden = true;
    refs.viewSwitch.hidden = true;
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
  }

  function buildFilters() {
    var categoryCounts = RecipeStore.countByCategory();
    var cuisineCounts = RecipeStore.countByCuisine();

    refs.categorySelect.textContent = '';
    refs.categorySelect.appendChild(option('all', 'Все типы блюд'));
    RecipeStore.categories().forEach(function (category) {
      var count = categoryCounts[category.id] || 0;
      if (count) {
        refs.categorySelect.appendChild(
          option(category.id, category.title + ' · ' + count)
        );
      }
    });
    refs.categorySelect.value = state.category;

    refs.cuisineSelect.textContent = '';
    refs.cuisineSelect.appendChild(option('all', 'Все кухни'));
    RecipeStore.cuisines().forEach(function (cuisine) {
      var count = cuisineCounts[cuisine.id] || 0;
      if (count) {
        var label = cuisine.title.replace(/\s+кухня$/i, '');
        refs.cuisineSelect.appendChild(option(cuisine.id, label + ' · ' + count));
      }
    });
    refs.cuisineSelect.value = state.cuisine;
  }

  function option(value, label) {
    var node = el('option', '', label);
    node.value = value;
    return node;
  }

  function updateFilterControls() {
    if (refs.categorySelect) {
      refs.categorySelect.value = state.category;
    }
    if (refs.cuisineSelect) {
      refs.cuisineSelect.value = state.cuisine;
    }
  }

  function render() {
    var filtered = state.query.trim() !== ''
      || state.category !== 'all'
      || state.cuisine !== 'all';
    var list;

    if (state.mode === 'all') {
      list = RecipeStore.query({
        query: state.query,
        category: state.category,
        cuisine: state.cuisine
      });
      renderCards(list);
      setText(refs.resultsTitle, 'Все рецепты');
      updateCount(list.length, filtered, false);
      showEmpty(list.length === 0, false, filtered);
    } else {
      list = RecipeStore.query({
        query: state.query,
        category: state.category,
        cuisine: state.cuisine
      }).filter(function (recipe) {
        return state.selected[recipe.id] === true;
      });
      renderCards(list);
      setText(refs.resultsTitle, 'Выбранные рецепты');
      updateCount(list.length, filtered, true);
      showEmpty(list.length === 0, true, filtered);
    }

    updateBadge();
    updateSelectionControls();
    updateFilterControls();
    updateResets(filtered);
  }

  function updateCount(shown, filtered, selectedMode) {
    if (!refs.count) {
      return;
    }
    if (selectedMode) {
      var totalSelected = selectedCount();
      if (!totalSelected) {
        refs.count.textContent = 'Выбрано 0 из ' + state.total;
      } else if (filtered) {
        refs.count.textContent = 'Показано ' + shown + ' из ' + totalSelected + ' выбранных';
      } else {
        refs.count.textContent = 'Выбрано ' + totalSelected + ' из ' + state.total;
      }
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
    if (selectedMode) {
      if (!selectedCount()) {
        setText(
          refs.emptyText,
          'Пока ничего не выбрано. Нажмите на звезду на карточке рецепта — он появится здесь.'
        );
        hide(refs.emptyReset, true);
      } else {
        setText(
          refs.emptyText,
          'Среди выбранных нет блюд по этим фильтрам. Сбросьте фильтры, чтобы увидеть всю подборку.'
        );
        hide(refs.emptyReset, false);
      }
      return;
    }
    setText(
      refs.emptyText,
      'Ничего не найдено. Попробуйте другое слово или сбросьте фильтры.'
    );
    hide(refs.emptyReset, !filtered);
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
    var count = selectedCount();
    setText(refs.selectedBadge, String(count));
    if (refs.clearSelection) {
      refs.clearSelection.hidden = count === 0;
    }
    if (refs.shareButton) {
      refs.shareButton.disabled = count === 0;
      refs.shareButton.setAttribute(
        'aria-label',
        count
          ? 'Поделиться выбранными: ' + count + ' '
            + RecipeStore.plural(count, ['блюдо', 'блюда', 'блюд'])
          : 'Поделиться выбранными'
      );
    }
    if (refs.shareCount) {
      refs.shareCount.textContent = String(count);
      refs.shareCount.hidden = count === 0;
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

  function starIcon() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'star-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z');
    svg.appendChild(path);
    return svg;
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

    var select = el('button', 'recipe-select');
    select.type = 'button';
    select.setAttribute('data-select-recipe', recipe.id);
    select.appendChild(starIcon());
    setSelectionButtonState(select, recipe.id);
    item.appendChild(select);

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

    if (refs.dialogSelect) {
      refs.dialogSelect.setAttribute('data-select-recipe', recipe.id);
      setSelectionButtonState(refs.dialogSelect, recipe.id);
    }

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
    if (focus && focus.isConnected === false) {
      focus = null;
    }
    if (!focus && refs.resultsTitle) {
      refs.resultsTitle.setAttribute('tabindex', '-1');
      focus = refs.resultsTitle;
    }
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

  function setSelectionButtonState(button, id) {
    var selected = state.selected[id] === true;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.setAttribute(
      'aria-label',
      selected ? 'Убрать из выбранных' : 'Добавить в выбранные'
    );
    button.setAttribute(
      'title',
      selected ? 'Убрать из выбранных' : 'Добавить в выбранные'
    );
    var label = button.querySelector('[data-select-label]');
    if (label) {
      label.textContent = selected ? 'Выбрано' : 'Выбрать';
    }
  }

  function updateSelectionControls() {
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-select-recipe]'),
      function (button) {
        var id = button.getAttribute('data-select-recipe');
        if (id) {
          setSelectionButtonState(button, id);
        }
      }
    );
  }

  function toggleSelected(id) {
    if (!id) {
      return;
    }
    if (state.selected[id]) {
      delete state.selected[id];
    } else {
      state.selected[id] = true;
    }
    updateSelectionState();
  }

  function updateSelectionState() {
    updateBadge();
    updateSelectionControls();
    syncCodeState(false);

    if (state.mode === 'selected') {
      render();
      if (!refs.dialog.open) {
        var next = refs.grid.querySelector('[data-select-recipe]');
        if (next) {
          next.focus();
        } else if (refs.resultsTitle) {
          refs.resultsTitle.setAttribute('tabindex', '-1');
          refs.resultsTitle.focus();
        }
      }
    }
  }

  function clearSelection() {
    var restoreFocus = refs.clearSelection
      && document.activeElement === refs.clearSelection;
    state.selected = Object.create(null);
    updateSelectionState();
    if (restoreFocus && refs.resultsTitle) {
      refs.resultsTitle.setAttribute('tabindex', '-1');
      refs.resultsTitle.focus();
    }
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
    if (!skipUrl) {
      writeCodeToUrl(code);
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
      showToast('Модуль кодов не загрузился — обновите страницу.', true);
      return false;
    }

    var result = SelectionCode.decode(raw, state.allIds);
    if (!result.ok) {
      showToast(codeErrorText(result.error), true);
      return false;
    }

    state.selected = Object.create(null);
    result.ids.forEach(function (id) {
      state.selected[id] = true;
    });
    state.query = '';
    state.category = 'all';
    state.cuisine = 'all';
    if (refs.search) {
      refs.search.value = '';
    }
    state.mode = 'selected';
    updateModeUI();
    render();
    syncCodeState(source === 'url');

    var message = 'Подборка загружена: ' + result.ids.length + ' '
      + RecipeStore.plural(result.ids.length, ['рецепт', 'рецепта', 'рецептов']) + '.';
    if (result.missing) {
      message += ' ' + result.missing + ' '
        + RecipeStore.plural(result.missing, ['рецепт', 'рецепта', 'рецептов'])
        + ' из кода не найдено в базе.';
    }
    showToast(message, false);
    return true;
  }

  function applyCodeFromUrl() {
    var code = '';
    try {
      code = new URLSearchParams(location.search).get('code') || '';
    } catch (error) {
      code = '';
    }
    if (code) {
      applyCode(code, 'url');
    }
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

  function showToast(message, isError) {
    if (!refs.toast) {
      return;
    }
    if (toastTimer) {
      window.clearTimeout(toastTimer);
    }
    refs.toast.textContent = message;
    refs.toast.classList.toggle('is-error', !!isError);
    refs.toast.hidden = false;
    refs.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(function () {
      refs.toast.classList.remove('is-visible');
      refs.toast.hidden = true;
    }, 3500);
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

  function isMobileViewport() {
    if (window.matchMedia) {
      if (window.matchMedia('(max-width: 768px)').matches) {
        return true;
      }
      if (window.matchMedia('(pointer: coarse)').matches) {
        return true;
      }
    }
    return window.innerWidth <= 768;
  }

  function buildShareLink(code) {
    try {
      var url = new URL(location.href);
      url.searchParams.set('code', code);
      url.hash = '';
      return url.toString();
    } catch (error) {
      return location.href.split('#')[0].split('?')[0]
        + '?code=' + encodeURIComponent(code);
    }
  }

  function shareSelection() {
    var code = state.code || encodeSelection();
    if (!code) {
      showToast('Сначала выберите рецепты.', true);
      return;
    }

    var link = buildShareLink(code);
    var copyPromise = copyText(link);
    var shareData = {
      title: 'Праздники события — выбранные рецепты',
      text: 'Моя подборка рецептов',
      url: link
    };

    if (isMobileViewport() && window.navigator
        && typeof window.navigator.share === 'function') {
      try {
        var result = window.navigator.share(shareData);
        if (result && result.catch) {
          result.catch(function (error) {
            if (error && error.name === 'AbortError') {
              return;
            }
            copyPromise.then(function (ok) {
              showToast(
                ok ? 'Ссылка скопирована в буфер обмена.' : 'Не удалось скопировать ссылку.',
                !ok
              );
            });
          });
        }
      } catch (error) {
        copyPromise.then(function (ok) {
          showToast(
            ok ? 'Ссылка скопирована в буфер обмена.' : 'Не удалось скопировать ссылку.',
            !ok
          );
        });
      }
      return;
    }

    copyPromise.then(function (ok) {
      showToast(
        ok ? 'Ссылка скопирована в буфер обмена.' : 'Не удалось скопировать ссылку.',
        !ok
      );
    });
  }

  function bindEvents() {
    refs.grid.addEventListener('click', function (event) {
      var target = event.target;
      var select = target && target.closest
        ? target.closest('[data-select-recipe]')
        : null;
      if (select) {
        toggleSelected(select.getAttribute('data-select-recipe'));
        return;
      }
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

    if (refs.categorySelect) {
      refs.categorySelect.addEventListener('change', function () {
        state.category = refs.categorySelect.value || 'all';
        render();
      });
    }

    if (refs.cuisineSelect) {
      refs.cuisineSelect.addEventListener('change', function () {
        state.cuisine = refs.cuisineSelect.value || 'all';
        render();
      });
    }

    refs.modeButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setMode(button.getAttribute('data-mode'), false);
      });
    });

    if (refs.dialogSelect) {
      refs.dialogSelect.addEventListener('click', function () {
        toggleSelected(refs.dialogSelect.getAttribute('data-select-recipe'));
      });
    }

    if (refs.clearSelection) {
      refs.clearSelection.addEventListener('click', clearSelection);
    }

    if (refs.shareButton) {
      refs.shareButton.addEventListener('click', shareSelection);
    }

    resets.forEach(function (button) {
      button.addEventListener('click', function () {
        if (refs.search) {
          refs.search.value = '';
        }
        state.query = '';
        state.category = 'all';
        state.cuisine = 'all';
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
