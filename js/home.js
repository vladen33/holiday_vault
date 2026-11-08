/* ==========================================================================
   home.js — поиск и фильтры каталога праздников
   Обычный (не модульный) скрипт: работает и по file://, и на GitHub Pages.
   Без JS страница остаётся рабочей: панель фильтров скрыта, видны все карточки.
   ========================================================================== */

(function () {
  'use strict';

  var filters = document.querySelector('[data-filters]');
  var form = filters;
  var search = document.querySelector('[data-search]');
  var cards = Array.prototype.slice.call(
    document.querySelectorAll('[data-cards] .card-item')
  );
  var chips = Array.prototype.slice.call(document.querySelectorAll('[data-filter]'));
  var resetButtons = Array.prototype.slice.call(document.querySelectorAll('[data-reset]'));
  var counter = document.querySelector('[data-count]');
  var empty = document.querySelector('[data-empty]');
  var year = document.querySelector('[data-year]');
  var current = 'all';

  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  if (!filters || !search || !cards.length) {
    return;
  }

  filters.hidden = false;

  function normalize(value) {
    return (value || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function plural(number) {
    var mod10 = number % 10;
    var mod100 = number % 100;
    if (mod10 === 1 && mod100 !== 11) {
      return number + ' праздник';
    }
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return number + ' праздника';
    }
    return number + ' праздников';
  }

  function cardText(item) {
    return normalize(item.getAttribute('data-keywords')) + ' ' + normalize(item.textContent);
  }

  function apply() {
    var query = normalize(search.value);
    var shown = 0;

    cards.forEach(function (item) {
      var seasons = (item.getAttribute('data-season') || '').split(/\s+/);
      var seasonMatches = current === 'all' || seasons.indexOf(current) !== -1;
      var queryMatches = query === '' || cardText(item).indexOf(query) !== -1;
      var visible = seasonMatches && queryMatches;

      item.hidden = !visible;

      if (visible) {
        shown += 1;
      }
    });

    if (empty) {
      empty.hidden = shown !== 0;
    }

    if (counter) {
      counter.textContent = plural(shown);
    }

    var isFiltered = current !== 'all' || query !== '';
    resetButtons.forEach(function (button) {
      button.hidden = !isFiltered;
    });
  }

  function setFilter(value) {
    current = value || 'all';
    chips.forEach(function (chip) {
      var pressed = chip.getAttribute('data-filter') === current;
      chip.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
    apply();
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      setFilter(chip.getAttribute('data-filter'));
    });
  });

  search.addEventListener('input', apply);

  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
    });
  }

  resetButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      search.value = '';
      setFilter('all');
      search.focus();
    });
  });

  document.addEventListener('keydown', function (event) {
    var target = event.target;
    var tag = (target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || target.isContentEditable;

    if (event.key === '/' && !typing) {
      event.preventDefault();
      search.focus();
      return;
    }

    if (event.key === 'Escape' && search.value !== '') {
      search.value = '';
      apply();
      if (typing && typeof target.blur === 'function') {
        target.blur();
      }
    }
  });

  apply();
}());
