import { describe, expect, it } from 'vitest';
import { emptyDraft } from './draft';
import { hashOf, planSettings, planSync, type LocalRace, type RaceDoc, type RemoteRace, type SyncState } from './sync';

const base = emptyDraft();
const doc = (name: string): RaceDoc => ({ draft: { ...base, name }, createdAt: '2026-01-01T00:00:00Z', summary: null, gear: [], crew: [], gpx: null });
const local = (id: string, name: string, updatedAt = '2026-05-01T00:00:00Z'): LocalRace => ({ id, doc: doc(name), updatedAt });
const remote = (id: string, name: string, at: string, deleted: string | null = null): RemoteRace => ({ id, data: doc(name), updated_at: at, deleted_at: deleted });
const synced = (races: Record<string, [string, string]>): SyncState => ({
  userId: 'u', settings: null,
  races: Object.fromEntries(Object.entries(races).map(([id, [name, at]]) => [id, { hash: hashOf(doc(name)), remoteAt: at }])),
});

describe('synchronisation de Mes courses', () => {
  it('envoie une course nouvelle ou modifiée ici, prend celle modifiée ailleurs', () => {
    const state = synced({ a: ['A', 't1'], b: ['B', 't1'] });
    const plan = planSync([local('a', 'A modifiée'), local('b', 'B'), local('c', 'C')],
      [remote('a', 'A', 't1'), remote('b', 'B ailleurs', 't2')], [], state);
    expect(plan.push.map((r) => r.id)).toEqual(['a', 'c']);
    expect(plan.take.map((r) => r.id)).toEqual(['b']);
  });

  it('modifiée des deux côtés : celle de cet appareil l\'emporte', () => {
    const plan = planSync([local('a', 'ici')], [remote('a', 'ailleurs', 't2')], [], synced({ a: ['A', 't1'] }));
    expect(plan.push.map((r) => r.id)).toEqual(['a']);
    expect(plan.take).toEqual([]);
  });

  it('suit les suppressions dans les deux sens', () => {
    const plan = planSync([local('a', 'A')], [remote('a', 'A', 't2', 't2'), remote('b', 'B', 't1')], ['b'],
      synced({ a: ['A', 't1'], b: ['B', 't1'] }));
    expect(plan.remove).toEqual(['a']);
    expect(plan.pushDeleted).toEqual(['b']);
  });

  it('nouvel appareil : prend les courses du compte, la plus récente l\'emporte en cas de double', () => {
    const empty: SyncState = { userId: 'u', races: {}, settings: null };
    const plan = planSync([local('a', 'ancienne', '2026-01-01T00:00:00Z')],
      [remote('a', 'récente', '2026-06-01T00:00:00Z'), remote('b', 'B', '2026-02-01T00:00:00Z'), remote('z', 'Z', 't', 't')], [], empty);
    expect(plan.take.map((r) => r.id)).toEqual(['a', 'b']);
    expect(plan.push).toEqual([]);
  });

  it('réglages', () => {
    expect(planSettings('h1', null, null)).toBe('push');
    expect(planSettings('h1', { hash: 'h2', updated_at: 't2' }, null)).toBe('take');
    expect(planSettings('h3', { hash: 'h1', updated_at: 't1' }, { hash: 'h1', remoteAt: 't1' })).toBe('push');
    expect(planSettings('h1', { hash: 'h2', updated_at: 't2' }, { hash: 'h1', remoteAt: 't1' })).toBe('take');
  });
});
