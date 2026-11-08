/* ==========================================================================
   recipes.js — страница «Рецепты праздничного стола»
   Данные берутся из RecipeStore (js/recipe-store.js), вёрстка рецептов
   в HTML не дублируется: всё строится по JSON.
   ========================================================================== */

(function () {
  'use strict';

  var refs = {
    filters: document.querySelector('[data-filters]'),
    search: document.querySelector('[data-search]'),
    select: document.querySelector('[data-select]'),
    chips: document.querySelector('[data-chips]'),
    grid: document.querySelector('[data-grid]'),
    count: document.querySelector('[data-count]'),
    empty: document.querySelector('[data-empty]'),
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

  var state = { query: '', category: 'all', total: 0, lastFocus: null };
  var resets = Array.prototype.slice.call(document.querySelectorAll('[data-reset]'));
  var year = document.querySelector('[data-year]');

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  if (!refs.grid || !refs.dialog || !refs.filters) {
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

  function start() {
    state.total = RecipeStore.all().length;
    buildChips();
    buildSelect();
    bindEvents();
    render();
    refs.filters.hidden = false;
    openFromHash();
  }

  function fail(error) {
    refs.filters.hidden = true;
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

  function buildSelect() {
    var select = refs.select;
    if (!select) {
      return;
    }

    select.textContent = '';
    var placeholder = el('option', '', '— выберите блюдо —');
    placeholder.value = '';
    select.appendChild(placeholder);

    var counts = RecipeStore.countByCategory();
    var recipes = RecipeStore.all();

    RecipeStore.categories().forEach(function (category) {
      var count = counts[category.id] || 0;
      if (!count) {
        return;
      }
      var group = document.createElement('optgroup');
      group.label = category.title + ' · ' + count;
      recipes.forEach(function (recipe) {
        if (recipe.category !== category.id) {
          return;
        }
        var option = el('option', '', recipe.title);
        option.value = recipe.id;
        group.appendChild(option);
      });
      select.appendChild(group);
    });
  }

  function render() {
    var list = RecipeStore.query({ query: state.query, category: state.category });

    renderCards(list);
    updateCount(list.length);
    hide(refs.empty, list.length !== 0);

    var filtered = state.query !== '' || state.category !== 'all';
    resets.forEach(function (button) {
      button.hidden = !filtered;
    });
    updateChips();
  }

  function updateCount(shown) {
    if (!refs.count) {
      return;
    }
    var filtered = state.query !== '' || state.category !== 'all';
    if (filtered) {
      refs.count.textContent = 'Найдено ' + shown + ' из ' + state.total;
      return;
    }
    refs.count.textContent = state.total + ' '
      + RecipeStore.plural(state.total, ['рецепт', 'рецепта', 'рецептов']);
  }

  function updateChips() {
    var chips = refs.chips.querySelectorAll('[data-category]');
    Array.prototype.forEach.call(chips, function (chip) {
      var active = chip.getAttribute('data-category') === state.category;
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
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
    var parts = [servings, RecipeStore.formatTime(RecipeStore.totalTime(recipe))];
    var difficulty = RecipeStore.difficultyLabel(recipe.difficulty);
    if (difficulty) {
      parts.push(difficulty);
    }
    return parts.join(' · ');
  }

  function fillDialog(recipe) {
    var category = RecipeStore.categoryById(recipe.category);
    var holidays = (recipe.holidays || []).map(function (id) {
      var holiday = RecipeStore.holidayById(id);
      return holiday ? holiday.title : id;
    });
    var kicker = [category ? category.title : '', holidays.join(', ')]
      .filter(Boolean)
      .join(' · ');

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
      history.replaceState(null, '', '#' + id);
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

    if (refs.select) {
      refs.select.addEventListener('change', function () {
        var id = refs.select.value;
        refs.select.value = '';
        if (id) {
          openRecipe(id, refs.select);
        }
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

    resets.forEach(function (button) {
      button.addEventListener('click', function () {
        if (refs.search) {
          refs.search.value = '';
        }
        state.query = '';
        state.category = 'all';
        render();
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

    refs.dialog.addEventListener('close', cleanupDialog);

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
      var typing = false;
      if (refs.search) {
        typing = refs.search.value !== '';
      }
      if (event.key === 'Escape' && !refs.dialog.open && typing) {
        refs.search.value = '';
        state.query = '';
        render();
      }
    });

    window.addEventListener('hashchange', function () {
      var raw = (location.hash || '').replace(/^#/, '');
      if (!raw && refs.dialog.open) {
        closeRecipe();
        return;
      }
      if (raw && !refs.dialog.open) {
        openFromHash();
      }
    });
  }
}());
