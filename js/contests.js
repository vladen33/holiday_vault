/* ==========================================================================
   contests.js — страница «Конкурсы»

   Данные берутся из ContestStore (js/contest-store.js):
   - по http(s) из data/contests.json;
   - по file:// из data/contests.bundle.js.

   Страница строит фильтры по типу, аудитории и тегам, карточки конкурсов
   и раскрывающиеся правила. Счётчики фильтров считаются с учётом
   остальных фильтров.
   ========================================================================== */

(function () {
  'use strict';

  var refs = {
    filters: document.querySelector('[data-filters]'),
    typeSelect: document.querySelector('[data-type-filter]'),
    audienceSelect: document.querySelector('[data-audience-filter]'),
    tagFilter: document.querySelector('[data-tag-filter]'),
    tagList: document.querySelector('[data-tag-list]'),
    tagReset: document.querySelector('[data-reset-tags]'),
    grid: document.querySelector('[data-grid]'),
    count: document.querySelector('[data-count]'),
    empty: document.querySelector('[data-empty]'),
    emptyText: document.querySelector('[data-empty-text]'),
    error: document.querySelector('[data-error]'),
    year: document.querySelector('[data-year]')
  };

  var state = {
    type: 'all',
    audience: 'all',
    tags: [],
    allTags: [],
    total: 0,
    positions: {}
  };

  var resets = Array.prototype.slice.call(document.querySelectorAll('[data-reset]'));

  if (refs.year) {
    refs.year.textContent = String(new Date().getFullYear());
  }

  if (!refs.filters || !refs.typeSelect || !refs.audienceSelect || !refs.grid) {
    return;
  }

  if (!window.ContestStore) {
    fail(new Error('store-missing'));
    return;
  }

  ContestStore.load().then(start).catch(fail);

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

  function plural(number, forms) {
    var abs = Math.abs(Number(number) || 0) % 100;
    var last = abs % 10;
    if (abs > 10 && abs < 20) {
      return forms[2];
    }
    if (last > 1 && last < 5) {
      return forms[1];
    }
    if (last === 1) {
      return forms[0];
    }
    return forms[2];
  }

  function contestsWord(number) {
    return plural(number, ['конкурс', 'конкурса', 'конкурсов']);
  }

  function start() {
    state.total = ContestStore.all().length;
    state.allTags = ContestStore.allTags();
    ContestStore.all().forEach(function (contest, index) {
      state.positions[contest.id] = index + 1;
    });

    bindEvents();
    refs.filters.hidden = false;
    if (refs.tagFilter) {
      refs.tagFilter.hidden = false;
    }
    render();
  }

  function fail(error) {
    refs.filters.hidden = true;
    if (refs.tagFilter) {
      refs.tagFilter.hidden = true;
    }
    refs.grid.textContent = '';
    hide(refs.empty, true);
    hide(refs.count, true);
    if (refs.error) {
      refs.error.hidden = false;
      refs.error.textContent = window.location.protocol === 'file:'
        ? 'Не удалось загрузить базу конкурсов: не найден data/contests.bundle.js. '
          + 'Пересоберите его командой python3 tools/sync_contests.py.'
        : 'Не удалось загрузить data/contests.json (' + (error && error.message) + '). '
          + 'Проверьте, что файл лежит на месте.';
    }
  }

  function buildFilterOptions() {
    var typeSource = ContestStore.query({
      type: 'all',
      audience: state.audience,
      tags: state.tags
    });
    var typeCounts = {};
    typeSource.forEach(function (contest) {
      typeCounts[contest.type] = (typeCounts[contest.type] || 0) + 1;
    });

    var audienceSource = ContestStore.query({
      type: state.type,
      audience: 'all',
      tags: state.tags
    });
    var audienceCounts = {};
    audienceSource.forEach(function (contest) {
      (contest.audiences || []).forEach(function (audience) {
        audienceCounts[audience] = (audienceCounts[audience] || 0) + 1;
      });
    });

    refs.typeSelect.textContent = '';
    refs.typeSelect.appendChild(
      option('all', 'Все типы · ' + typeSource.length)
    );
    ContestStore.types().forEach(function (type) {
      var count = typeCounts[type.id] || 0;
      refs.typeSelect.appendChild(
        option(type.id, type.title + ' · ' + count, count === 0 && state.type !== type.id)
      );
    });

    refs.audienceSelect.textContent = '';
    refs.audienceSelect.appendChild(
      option('all', 'Все аудитории · ' + audienceSource.length)
    );
    ContestStore.audiences().forEach(function (audience) {
      var count = audienceCounts[audience.id] || 0;
      refs.audienceSelect.appendChild(
        option(
          audience.id,
          audience.title + ' · ' + count,
          count === 0 && state.audience !== audience.id
        )
      );
    });

    refs.typeSelect.value = state.type;
    refs.audienceSelect.value = state.audience;
  }

  function option(value, label, disabled) {
    var node = el('option', '', label);
    node.value = value;
    node.disabled = !!disabled;
    return node;
  }

  function hasContests(type, audience) {
    return ContestStore.query({ type: type, audience: audience }).length > 0;
  }

  function onTypeChange() {
    state.type = refs.typeSelect.value || 'all';
    if (state.type !== 'all' && state.audience !== 'all'
        && !hasContests(state.type, state.audience)) {
      state.audience = 'all';
    }
    normalizeTagSelection();
    render();
  }

  function onAudienceChange() {
    state.audience = refs.audienceSelect.value || 'all';
    if (state.audience !== 'all' && state.type !== 'all'
        && !hasContests(state.type, state.audience)) {
      state.type = 'all';
    }
    normalizeTagSelection();
    render();
  }

  function onTagToggle(tag) {
    var index = state.tags.indexOf(tag);
    if (index !== -1) {
      state.tags.splice(index, 1);
    } else {
      var next = state.tags.concat([tag]);
      if (!ContestStore.query({
        type: state.type,
        audience: state.audience,
        tags: next
      }).length) {
        return;
      }
      state.tags.push(tag);
    }
    render();
    focusTag(tag);
  }

  function normalizeTagSelection() {
    if (!state.tags.length) {
      return;
    }
    if (ContestStore.query({
      type: state.type,
      audience: state.audience,
      tags: state.tags
    }).length) {
      return;
    }
    var kept = state.tags.filter(function (tag) {
      return ContestStore.query({
        type: state.type,
        audience: state.audience,
        tags: [tag]
      }).length > 0;
    });
    if (!ContestStore.query({
      type: state.type,
      audience: state.audience,
      tags: kept
    }).length) {
      kept = [];
    }
    state.tags = kept;
  }

  function focusTag(tag) {
    if (!refs.tagList) {
      return;
    }
    var buttons = refs.tagList.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i += 1) {
      if (buttons[i].getAttribute('data-tag') === tag) {
        buttons[i].focus();
        return;
      }
    }
  }

  function render() {
    var filtered = state.type !== 'all'
      || state.audience !== 'all'
      || state.tags.length > 0;
    var list = ContestStore.query({
      type: state.type,
      audience: state.audience,
      tags: state.tags
    });

    buildFilterOptions();
    buildTagFilter();
    renderCards(list);
    updateCount(list.length, filtered);
    showEmpty(list.length === 0);
    updateResets(filtered);
  }

  function updateCount(shown, filtered) {
    if (!refs.count) {
      return;
    }
    if (filtered) {
      refs.count.textContent = 'Найдено ' + shown + ' из ' + state.total;
    } else {
      refs.count.textContent = state.total + ' ' + contestsWord(state.total);
    }
  }

  function showEmpty(isEmpty) {
    hide(refs.empty, !isEmpty);
    if (isEmpty) {
      setText(
        refs.emptyText,
        'По этим фильтрам конкурсов нет. Попробуйте другой тип, аудиторию или теги.'
      );
    }
  }

  function updateResets(filtered) {
    resets.forEach(function (button) {
      if (button.hasAttribute('data-reset-empty')) {
        button.hidden = !filtered;
        return;
      }
      button.hidden = !filtered;
    });
    if (refs.tagReset) {
      refs.tagReset.hidden = state.tags.length === 0;
    }
  }

  function buildTagFilter() {
    if (!refs.tagList) {
      return;
    }
    refs.tagList.textContent = '';
    state.allTags.forEach(function (tag) {
      var others = state.tags.filter(function (selected) {
        return selected !== tag;
      });
      var count = ContestStore.query({
        type: state.type,
        audience: state.audience,
        tags: others.concat([tag])
      }).length;
      var selected = state.tags.indexOf(tag) !== -1;
      var button = el('button', 'tag-filter-button');
      button.type = 'button';
      button.setAttribute('data-tag', tag);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.setAttribute(
        'aria-label',
        tag + ': ' + count + ' ' + contestsWord(count)
      );
      button.disabled = count === 0 && !selected;
      if (selected) {
        button.classList.add('is-active');
      }
      button.appendChild(el('span', 'tag-filter-label', tag));
      button.appendChild(el('span', 'tag-filter-count', String(count)));
      button.addEventListener('click', function () {
        onTagToggle(tag);
      });
      refs.tagList.appendChild(button);
    });
  }

  function renderCards(list) {
    refs.grid.textContent = '';
    var fragment = document.createDocumentFragment();
    list.forEach(function (contest) {
      fragment.appendChild(buildCard(contest));
    });
    refs.grid.appendChild(fragment);
  }

  function buildCard(contest) {
    var item = el('li', 'contest-item');
    var card = el('article', 'contest-card');
    card.id = contest.id;

    var top = el('div', 'contest-card-top');
    top.appendChild(
      el('span', 'contest-number', String(state.positions[contest.id] || '').padStart(2, '0'))
    );
    var type = ContestStore.typeById(contest.type);
    var badge = el('span', 'contest-type');
    if (type && type.icon) {
      badge.appendChild(el('span', 'contest-type-icon', type.icon));
      badge.appendChild(document.createTextNode(' '));
    }
    badge.appendChild(document.createTextNode(type ? type.title : contest.type));
    top.appendChild(badge);
    card.appendChild(top);

    card.appendChild(el('h3', 'contest-title', contest.title));
    card.appendChild(el('p', 'contest-desc', contest.description));

    var formats = {
      individual: 'индивидуальный',
      team: 'командный',
      pair: 'парный'
    };
    var meta = [
      contest.minAge + '+',
      formatDuration(contest.duration),
      contest.players,
      formats[contest.format] || contest.format
    ].filter(Boolean).join(' · ');
    card.appendChild(el('p', 'contest-meta', meta));

    var audienceTitles = (contest.audiences || []).map(function (id) {
      var audience = ContestStore.audienceById(id);
      return audience ? audience.title : id;
    });
    if (audienceTitles.length) {
      card.appendChild(
        el('p', 'contest-audiences', 'Для кого: ' + audienceTitles.join(', '))
      );
    }

    var tags = el('ul', 'tags');
    (contest.tags || []).forEach(function (tag) {
      tags.appendChild(el('li', 'tag tag-sage', tag));
    });
    card.appendChild(tags);

    var details = el('details', 'contest-rules');
    details.appendChild(el('summary', '', 'Правила и реквизит'));

    var rules = el('ol', 'contest-rules-list');
    (contest.rules || []).forEach(function (rule) {
      rules.appendChild(el('li', '', rule));
    });
    details.appendChild(rules);

    var props = contest.props && contest.props.length
      ? contest.props.join(', ')
      : 'не нужен';
    var propsLine = el('p', 'contest-props');
    propsLine.appendChild(el('strong', '', 'Реквизит: '));
    propsLine.appendChild(document.createTextNode(props));
    details.appendChild(propsLine);

    var tipLine = el('p', 'contest-tip');
    tipLine.appendChild(el('strong', '', 'Совет: '));
    tipLine.appendChild(document.createTextNode(contest.tip));
    details.appendChild(tipLine);

    card.appendChild(details);
    item.appendChild(card);
    return item;
  }

  function formatDuration(minutes) {
    var value = Number(minutes) || 0;
    if (value < 60) {
      return value + ' мин';
    }
    var hours = Math.floor(value / 60);
    var rest = value % 60;
    return hours + ' ч' + (rest ? ' ' + rest + ' мин' : '');
  }

  function bindEvents() {
    refs.typeSelect.addEventListener('change', onTypeChange);
    refs.audienceSelect.addEventListener('change', onAudienceChange);

    resets.forEach(function (button) {
      button.addEventListener('click', function () {
        state.type = 'all';
        state.audience = 'all';
        state.tags = [];
        render();
        refs.typeSelect.focus();
      });
    });

    if (refs.tagReset) {
      refs.tagReset.addEventListener('click', function () {
        if (!state.tags.length) {
          return;
        }
        state.tags = [];
        render();
        refs.typeSelect.focus();
      });
    }
  }
}());
