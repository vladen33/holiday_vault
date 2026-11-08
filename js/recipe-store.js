/* ==========================================================================
   recipe-store.js — слой доступа к базе рецептов

   Единственный источник данных для страниц проекта: сейчас — страница
   «Рецепты», позже — разделы праздников (new_year и другие).

   Загрузка:
   - file://  → window.RECIPE_DB из data/recipes.bundle.js (fetch там запрещён);
   - http(s)  → fetch('data/recipes.json'), то есть GitHub Pages и локальный сервер.

   API после load():
     RecipeStore.all() / get(id) / byIds([...]),
     RecipeStore.categories() / categoryById(id) / holidays() / holidayById(id),
     RecipeStore.query({ query, category, holiday }),
     RecipeStore.formatAmount(ingredient) / formatTime(min) / totalTime(recipe),
     RecipeStore.plural(n, ['рецепт', 'рецепта', 'рецептов']),
     RecipeStore.difficultyLabel(value)
   ========================================================================== */

(function (global) {
  'use strict';

  var db = null;
  var pending = null;
  var script = document.currentScript;
  var baseUrl = '';

  if (script && script.src) {
    baseUrl = script.src.replace(/[^/]*$/, '').replace(/js\/$/, '');
  }

  function normalize(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function load() {
    if (db) {
      return Promise.resolve(db);
    }
    if (pending) {
      return pending;
    }
    if (global.RECIPE_DB) {
      db = global.RECIPE_DB;
      return Promise.resolve(db);
    }
    if (!global.fetch || (global.location && global.location.protocol === 'file:')) {
      return Promise.reject(new Error('bundle-missing'));
    }

    pending = global
      .fetch(baseUrl + 'data/recipes.json', { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(
        function (data) {
          db = data;
          pending = null;
          return data;
        },
        function (error) {
          pending = null;
          throw error;
        }
      );

    return pending;
  }

  function current() {
    if (!db) {
      throw new Error('RecipeStore: сначала вызовите load()');
    }
    return db;
  }

  function all() {
    return (current().recipes || []).slice();
  }

  function byOrder(left, right) {
    return (left.order || 0) - (right.order || 0);
  }

  function categories() {
    return (current().categories || []).slice().sort(byOrder);
  }

  function categoryById(id) {
    var list = current().categories || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) {
        return list[i];
      }
    }
    return null;
  }

  function holidays() {
    return (current().holidays || []).slice();
  }

  function holidayById(id) {
    var list = current().holidays || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) {
        return list[i];
      }
    }
    return null;
  }

  function get(id) {
    var list = current().recipes || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) {
        return list[i];
      }
    }
    return null;
  }

  function byIds(ids) {
    return (ids || []).map(get).filter(Boolean);
  }

  function searchText(recipe) {
    var parts = [recipe.title, recipe.description];
    var category = categoryById(recipe.category);
    if (category) {
      parts.push(category.title);
    }
    (recipe.tags || []).forEach(function (tag) {
      parts.push(tag);
    });
    (recipe.ingredients || []).forEach(function (ingredient) {
      parts.push(ingredient.name, ingredient.note);
    });
    (recipe.holidays || []).forEach(function (id) {
      var holiday = holidayById(id);
      if (holiday) {
        parts.push(holiday.title);
      }
    });
    return normalize(parts.join(' '));
  }

  function query(options) {
    var opts = options || {};
    var category = opts.category || 'all';
    var holiday = opts.holiday || 'all';
    var text = normalize(opts.query);

    return all().filter(function (recipe) {
      if (category !== 'all' && recipe.category !== category) {
        return false;
      }
      if (holiday !== 'all' && (recipe.holidays || []).indexOf(holiday) === -1) {
        return false;
      }
      return !text || searchText(recipe).indexOf(text) !== -1;
    });
  }

  function countByCategory() {
    var counts = {};
    all().forEach(function (recipe) {
      counts[recipe.category] = (counts[recipe.category] || 0) + 1;
    });
    return counts;
  }

  function formatAmount(ingredient) {
    if (!ingredient) {
      return '';
    }
    if (ingredient.amount == null) {
      return ingredient.note || 'по вкусу';
    }
    var amount = String(ingredient.amount).replace('.', ',');
    return ingredient.unit ? amount + ' ' + ingredient.unit : amount;
  }

  function totalTime(recipe) {
    var time = (recipe && recipe.time) || {};
    return (time.prep || 0) + (time.cook || 0);
  }

  function formatTime(minutes) {
    var value = Number(minutes) || 0;
    if (value < 60) {
      return value + ' мин';
    }
    var hours = Math.floor(value / 60);
    var rest = value % 60;
    return hours + ' ч' + (rest ? ' ' + rest + ' мин' : '');
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

  function difficultyLabel(value) {
    var labels = { easy: 'просто', medium: 'средне', hard: 'сложно' };
    return labels[value] || '';
  }

  global.RecipeStore = {
    load: load,
    all: all,
    get: get,
    byIds: byIds,
    categories: categories,
    categoryById: categoryById,
    countByCategory: countByCategory,
    holidays: holidays,
    holidayById: holidayById,
    query: query,
    searchText: searchText,
    normalize: normalize,
    formatAmount: formatAmount,
    formatTime: formatTime,
    totalTime: totalTime,
    plural: plural,
    difficultyLabel: difficultyLabel
  };
}(window));
