/* ==========================================================================
   contest-store.js — слой данных для страницы «Конкурсы»

   Загрузка:
   - file://  → window.CONTEST_DB из data/contests.bundle.js;
   - http(s)  → fetch('data/contests.json').

   API после load():
     ContestStore.all() / get(id),
     ContestStore.types() / typeById(id),
     ContestStore.audiences() / audienceById(id),
     ContestStore.query({ type, audience, tags }),
     ContestStore.allTags(),
     ContestStore.countByType() / countByAudience()
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

  function load() {
    if (db) {
      return Promise.resolve(db);
    }
    if (pending) {
      return pending;
    }
    if (global.CONTEST_DB) {
      db = global.CONTEST_DB;
      return Promise.resolve(db);
    }
    if (!global.fetch || (global.location && global.location.protocol === 'file:')) {
      return Promise.reject(new Error('bundle-missing'));
    }

    pending = global
      .fetch(baseUrl + 'data/contests.json', { cache: 'no-cache' })
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
      throw new Error('ContestStore: сначала вызовите load()');
    }
    return db;
  }

  function byOrder(left, right) {
    return (left.order || 0) - (right.order || 0);
  }

  function all() {
    return (current().contests || []).slice();
  }

  function get(id) {
    var list = current().contests || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) {
        return list[i];
      }
    }
    return null;
  }

  function types() {
    return (current().types || []).slice().sort(byOrder);
  }

  function typeById(id) {
    var list = current().types || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) {
        return list[i];
      }
    }
    return null;
  }

  function audiences() {
    return (current().audiences || []).slice().sort(byOrder);
  }

  function audienceById(id) {
    var list = current().audiences || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === id) {
        return list[i];
      }
    }
    return null;
  }

  function query(options) {
    var opts = options || {};
    var type = opts.type || 'all';
    var audience = opts.audience || 'all';
    var tags = opts.tags || [];

    return all().filter(function (contest) {
      if (type !== 'all' && contest.type !== type) {
        return false;
      }
      if (audience !== 'all'
          && (contest.audiences || []).indexOf(audience) === -1) {
        return false;
      }
      if (tags.length) {
        var contestTags = contest.tags || [];
        for (var i = 0; i < tags.length; i += 1) {
          if (contestTags.indexOf(tags[i]) === -1) {
            return false;
          }
        }
      }
      return true;
    });
  }

  function countByType() {
    var counts = {};
    all().forEach(function (contest) {
      counts[contest.type] = (counts[contest.type] || 0) + 1;
    });
    return counts;
  }

  function countByAudience() {
    var counts = {};
    all().forEach(function (contest) {
      (contest.audiences || []).forEach(function (audience) {
        counts[audience] = (counts[audience] || 0) + 1;
      });
    });
    return counts;
  }

  function allTags() {
    var seen = {};
    all().forEach(function (contest) {
      (contest.tags || []).forEach(function (tag) {
        seen[tag] = true;
      });
    });
    return Object.keys(seen).sort(function (left, right) {
      return left.localeCompare(right, 'ru');
    });
  }

  global.ContestStore = {
    load: load,
    all: all,
    get: get,
    types: types,
    typeById: typeById,
    audiences: audiences,
    audienceById: audienceById,
    query: query,
    allTags: allTags,
    countByType: countByType,
    countByAudience: countByAudience
  };
}(window));
