/* ==========================================================================
   selection-code.js — самодостаточный код подборки рецептов

   Код не хранится на сервере: в нём зашит набор выбранных рецептов.
   Формат: HV1-<base64url(битовая маска)>-<контрольная сумма>.
   Позиция бита — индекс рецепта в data/recipes.json.

   Важно: существующие записи нельзя переставлять, новые рецепты
   добавляются только в конец файла — иначе старые коды потеряют смысл.

   API:
     SelectionCode.encode(ids, allIds) -> строка ('' для пустого набора)
     SelectionCode.decode(code, allIds) ->
       { ok: true, ids: [...], missing: 0 }
       { ok: false, error: 'format'|'checksum'|'empty'|'missing-all' }
   ========================================================================== */

(function (root) {
  'use strict';

  var VERSION = 'HV1';
  var PREFIX = VERSION + '-';
  var MAX_BYTES = 128;

  function toBase64Url(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function fromBase64Url(value) {
    var base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    var padding = (4 - (base64.length % 4)) % 4;
    base64 += new Array(padding + 1).join('=');
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function checksum(value) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return (hash & 0xffff).toString(36).padStart(4, '0');
  }

  function indexMap(allIds) {
    var map = {};
    for (var i = 0; i < allIds.length; i += 1) {
      map[allIds[i]] = i;
    }
    return map;
  }

  function encode(ids, allIds) {
    var selected = (ids || []).slice();
    var all = allIds || [];
    if (!selected.length || !all.length) {
      return '';
    }

    var positions = indexMap(all);
    var bytes = new Uint8Array(Math.max(1, Math.ceil(all.length / 8)));
    selected.forEach(function (id) {
      var index = positions[id];
      if (index == null) {
        return;
      }
      bytes[index >> 3] |= 1 << (index & 7);
    });

    var payload = toBase64Url(bytes);
    return PREFIX + payload + '-' + checksum(payload);
  }

  function decode(code, allIds) {
    var value = String(code == null ? '' : code).trim();
    if (!value) {
      return { ok: false, error: 'empty' };
    }

    var match = value.match(/^HV1-([A-Za-z0-9_-]+)-([0-9a-z]{4})$/);
    if (!match) {
      return { ok: false, error: 'format' };
    }
    if (checksum(match[1]) !== match[2]) {
      return { ok: false, error: 'checksum' };
    }

    var bytes;
    try {
      bytes = fromBase64Url(match[1]);
    } catch (error) {
      return { ok: false, error: 'format' };
    }
    if (!bytes.length || bytes.length > MAX_BYTES) {
      return { ok: false, error: 'format' };
    }

    var all = allIds || [];
    var ids = [];
    var missing = 0;
    var totalBits = bytes.length * 8;

    for (var bit = 0; bit < totalBits; bit += 1) {
      if ((bytes[bit >> 3] & (1 << (bit & 7))) === 0) {
        continue;
      }
      if (bit < all.length) {
        ids.push(all[bit]);
      } else {
        missing += 1;
      }
    }

    if (!ids.length) {
      return { ok: false, error: missing ? 'missing-all' : 'empty' };
    }

    return { ok: true, ids: ids, missing: missing };
  }

  var api = {
    encode: encode,
    decode: decode,
    version: VERSION
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.SelectionCode = api;
}(typeof window !== 'undefined' ? window : globalThis));
