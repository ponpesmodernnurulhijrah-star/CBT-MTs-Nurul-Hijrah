import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMergedEntity,
  computeEntityFingerprint,
  computeFieldDiffs,
  evaluatePendingVsServer,
} from './conflictLogic.ts';
import type { PendingLocalChange } from '../types/cbt.ts';

test('evaluatePendingVsServer returns already_synced when server matches local edit', () => {
  const localDoc = {
    id: 'q-1',
    mataPelajaran: 'Matematika',
    tipe: 'pg',
    pertanyaanTeks: 'Berapa 2 + 2?',
    kunciJawaban: ['B'],
    bobot: 2,
  };
  const pending: PendingLocalChange = {
    conflictKey: 'question:q-1',
    entityKind: 'question',
    entityId: 'q-1',
    entityTitle: 'Soal #1 Matematika',
    localUpdatedAt: '2026-11-21T08:00:00.000Z',
    localData: localDoc,
    baseHash: 'old-hash',
  };

  const res = evaluatePendingVsServer(pending, { ...localDoc, updatedAt: '2026-11-21T08:05:00.000Z' });
  assert.equal(res.status, 'already_synced');
});

test('evaluatePendingVsServer returns safe_to_push_local when server did not diverge from baseHash', () => {
  const baseDoc = {
    id: 'sched-1',
    judulUjian: 'PAS Matematika',
    durasiMenit: 60,
    token: 'ABC123',
    aktif: true,
    kelasTarget: ['X'],
  };
  const localDoc = { ...baseDoc, durasiMenit: 90 };
  const pending: PendingLocalChange = {
    conflictKey: 'schedule:sched-1',
    entityKind: 'schedule',
    entityId: 'sched-1',
    entityTitle: 'PAS Matematika',
    localUpdatedAt: '2026-11-21T08:02:00.000Z',
    localData: localDoc,
    baseHash: computeEntityFingerprint(baseDoc),
  };

  const res = evaluatePendingVsServer(pending, baseDoc);
  assert.equal(res.status, 'safe_to_push_local');
});

test('evaluatePendingVsServer detects conflict and produces human-readable diffs when both local and server changed', () => {
  const baseDoc = {
    id: 'sched-1',
    judulUjian: 'PAS Matematika',
    mataPelajaran: 'Matematika',
    durasiMenit: 60,
    token: 'ABC123',
    aktif: true,
    kelasTarget: ['X'],
  };
  const localDoc = { ...baseDoc, durasiMenit: 90, kelasTarget: ['X', 'XI'] };
  const serverDoc = { ...baseDoc, token: 'XYZ999', kelasTarget: ['X', 'XII'] };

  const pending: PendingLocalChange = {
    conflictKey: 'schedule:sched-1',
    entityKind: 'schedule',
    entityId: 'sched-1',
    entityTitle: 'PAS Matematika',
    localUpdatedAt: '2026-11-21T08:02:00.000Z',
    localData: localDoc,
    baseHash: computeEntityFingerprint(baseDoc),
  };

  const res = evaluatePendingVsServer(pending, serverDoc, '2026-11-21T08:03:00.000Z');
  assert.equal(res.status, 'conflict');
  if (res.status === 'conflict') {
    assert.equal(res.conflict.supportsMerge, true);
    assert.ok(res.conflict.diffs.some((d) => d.field === 'durasiMenit'));
    assert.ok(res.conflict.diffs.some((d) => d.field === 'token'));

    // Test smart merge + field choices
    const mergedDefault = buildMergedEntity(res.conflict);
    assert.equal(mergedDefault.durasiMenit, 90);
    assert.deepEqual(mergedDefault.kelasTarget, ['X', 'XII', 'XI']);

    const mergedCustom = buildMergedEntity(res.conflict, {
      durasiMenit: 'local',
      token: 'server',
      kelasTarget: 'server',
    });
    assert.equal(mergedCustom.durasiMenit, 90);
    assert.equal(mergedCustom.token, 'XYZ999');
    assert.deepEqual(mergedCustom.kelasTarget, ['X', 'XII']);
  }
});

test('evaluatePendingVsServer detects deleted-on-server conflict when modified locally', () => {
  const baseDoc = { id: 'q-9', pertanyaanTeks: 'Soal lama', bobot: 1 };
  const pending: PendingLocalChange = {
    conflictKey: 'question:q-9',
    entityKind: 'question',
    entityId: 'q-9',
    entityTitle: 'Soal lama',
    localUpdatedAt: '2026-11-21T08:02:00.000Z',
    localData: { ...baseDoc, bobot: 5 },
    baseHash: computeEntityFingerprint(baseDoc),
  };

  const res = evaluatePendingVsServer(pending, null);
  assert.equal(res.status, 'conflict');
  if (res.status === 'conflict') {
    assert.equal(res.conflict.supportsMerge, false);
    assert.equal(res.conflict.diffs[0].field, '_deletedOnServer');
  }
});

test('computeFieldDiffs works for settings conflict', () => {
  const diffs = computeFieldDiffs(
    'settings',
    { googleSheetsUrl: 'https://script.google.com/local' },
    { googleSheetsUrl: 'https://script.google.com/server' }
  );
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].label, 'URL Google Sheets Apps Script');
});
