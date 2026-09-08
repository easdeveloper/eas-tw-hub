const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ EAS: { UI: {} } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../core/floating-position.js'), 'utf8'), context);
const { clampPosition, restoreState } = context.EAS.UI.FloatingPosition;
const plain = (value) => JSON.parse(JSON.stringify(value));
const viewport = { width: 1200, height: 800 }, size = { width: 960, height: 600 };

test('valid positions are retained', () => {
    assert.deepEqual(plain(clampPosition({ x: 100, y: 80 }, size, viewport)), { x: 100, y: 80 });
});
test('negative and offscreen coordinates are clamped', () => {
    assert.deepEqual(plain(clampPosition({ x: -40, y: 9999 }, size, viewport)), { x: 12, y: 188 });
});
test('viewport shrink and oversized elements retain a reachable header', () => {
    assert.deepEqual(plain(clampPosition({ x: 400, y: 300 }, size, { width: 320, height: 240 })), { x: 12, y: 12 });
});
test('launcher uses its own dimensions', () => {
    assert.deepEqual(plain(clampPosition({ x: 9999, y: 9999 }, { width: 58, height: 44 }, viewport)), { x: 1130, y: 744 });
});
test('invalid stored coordinates have finite defaults', () => {
    for (const value of [null, {}, 'broken', { panel: { x: Infinity, y: '20' }, launcher: { x: NaN }, minimized: 'true' }]) {
        assert.deepEqual(plain(restoreState(value)), { version: 1, minimized: false, panel: { x: 12, y: 12 }, launcher: { x: 12, y: 12 } });
    }
});
test('open/minimized state and independent positions survive restoration', () => {
    const saved = { version: 1, minimized: true, panel: { x: 150, y: 55 }, launcher: { x: 900, y: 700 } };
    assert.deepEqual(plain(restoreState(saved)), saved);
    assert.equal(restoreState({ ...saved, minimized: false }, true).minimized, false);
    assert.equal(restoreState(null, true).minimized, true);
});
test('invalid coordinates and zero viewport never yield NaN', () => {
    assert.deepEqual(plain(clampPosition({ x: NaN, y: Infinity }, size, viewport)), { x: 12, y: 12 });
    assert.deepEqual(plain(clampPosition({}, size, { width: 0, height: 0 })), { x: 0, y: 0 });
});
