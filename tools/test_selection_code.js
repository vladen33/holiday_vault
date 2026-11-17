#!/usr/bin/env node
/* Проверка кодека подборок без зависимостей: node tools/test_selection_code.js */

'use strict';

var assert = require('assert');
var SelectionCode = require('../js/selection-code.js');

// Базовый набор 115 — проверка старых кодов; ниже отдельно проверяется 265.
var all = [];
for (var i = 0; i < 115; i += 1) {
  all.push('recipe-' + i);
}

function roundTrip(ids) {
  var code = SelectionCode.encode(ids, all);
  if (!ids.length) {
    assert.strictEqual(code, '');
    return;
  }
  var result = SelectionCode.decode(code, all);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.ids, ids);
  assert.strictEqual(result.missing, 0);
}

roundTrip([]);
roundTrip([all[0]]);
roundTrip([all[0], all[1], all[50]]);
roundTrip(all.slice(0, 20));
roundTrip(all);

var code = SelectionCode.encode([all[0], all[10], all[114]], all);
assert.match(code, /^HV1-[A-Za-z0-9_-]+-[0-9a-z]{4}$/);

assert.strictEqual(SelectionCode.decode('', all).error, 'empty');
assert.strictEqual(SelectionCode.decode('HV1-', all).error, 'format');
assert.strictEqual(SelectionCode.decode(code.slice(0, -1), all).error, 'format');
assert.strictEqual(
  SelectionCode.decode(code.slice(0, -4) + '0000', all).error,
  'checksum'
);

var appended = all.concat(['recipe-new-1', 'recipe-new-2']);
var afterAppend = SelectionCode.decode(code, appended);
assert.strictEqual(afterAppend.ok, true);
assert.deepStrictEqual(afterAppend.ids, [all[0], all[10], all[114]]);

var shortened = SelectionCode.decode(code, all.slice(0, 50));
assert.strictEqual(shortened.ok, true);
assert.strictEqual(shortened.missing, 1);

var wide = [];
for (var j = 0; j < 265; j += 1) {
  wide.push('wide-' + j);
}
var wideCode = SelectionCode.encode([wide[0], wide[264]], wide);
var wideResult = SelectionCode.decode(wideCode, wide);
assert.strictEqual(wideResult.ok, true);
assert.deepStrictEqual(wideResult.ids, [wide[0], wide[264]]);

console.log('✓ selection-code: все проверки пройдены');
