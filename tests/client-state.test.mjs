import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadModule(file, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = { exports: {}, ...globals };
  vm.runInNewContext(code, context);
  return context.exports;
}

function screenDocument(readyState) {
  const listeners = new Map();
  return {
    readyState,
    root: { dataset: {} },
    getElementById() { return this.root; },
    addEventListener(name, fn) {
      listeners.set(name, [...(listeners.get(name) || []), fn]);
    },
    dispatch(name) { for (const fn of listeners.get(name) || []) fn(); },
  };
}

test('late-loaded editor initializes without waiting for another Astro navigation', () => {
  const document = screenDocument('complete');
  const { onScreen } = loadModule('../src/lib/dom.ts', { document });
  let starts = 0;
  let cleanups = 0;
  onScreen('editor-screen', () => { starts++; return () => cleanups++; });
  assert.equal(starts, 1);
  assert.equal(document.root.dataset.ready, 'true');
  document.dispatch('astro:page-load');
  assert.equal(starts, 1, 'must not clear the fields or bind handlers twice');
  document.dispatch('astro:before-swap');
  assert.equal(cleanups, 1);
  document.root = { dataset: {} };
  document.dispatch('astro:page-load');
  assert.equal(starts, 2);
});

test('DOMContentLoaded and Astro events can arrive in either order', () => {
  for (const events of [
    ['DOMContentLoaded', 'astro:page-load'],
    ['astro:page-load', 'DOMContentLoaded'],
  ]) {
    const document = screenDocument('loading');
    const { onScreen } = loadModule('../src/lib/dom.ts', { document });
    let starts = 0;
    onScreen('editor-screen', () => { starts++; });
    for (const event of events) document.dispatch(event);
    assert.equal(starts, 1);
  }
});

test('failure to remember the active speech does not block editing saved local text', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (key === 'cminds.teleprompter.activeSpeech') throw new Error('Storage unavailable');
      values.set(key, value);
    },
  };
  const store = loadModule('../src/lib/store.ts', {
    window: { localStorage: storage },
    require: () => ({ DEFAULT_SETTINGS: { speed: 40, fontSize: 34, mirrored: false } }),
  });
  const speech = store.createSpeech({ id: 'saved', title: 'Local', body: 'Texto guardado' });
  assert.doesNotThrow(() => store.setActiveSpeechId(speech.id));
  assert.equal(store.getSpeech('saved').body, 'Texto guardado');
  assert.equal(store.saveSpeech({ ...speech, body: 'Texto editado' }), true);
  assert.equal(store.getSpeech('saved').body, 'Texto editado');
  const blank = store.createSpeech({ id: 'new' });
  assert.equal(blank.body, '');
  assert.equal(store.getSpeech('saved').body, 'Texto editado');
});
