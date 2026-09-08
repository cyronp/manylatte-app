import { expect, it } from 'vitest';
import { ConnectionAdmission } from './connection-admission.js';

it('reserves transport and room capacity synchronously and releases once', () => {
  const gate = new ConnectionAdmission({
    maxConnectionsPerIp: 1,
    maxTotalConnections: 2,
    maxParticipantsPerRoom: 1,
  });
  const first = gate.reserveTransport('a')!;
  expect(gate.reserveTransport('a')).toBeUndefined();
  const second = gate.reserveTransport('b')!;
  expect(gate.reserveTransport('c')).toBeUndefined();
  const room = gate.reserveRoom('room')!;
  expect(gate.reserveRoom('room')).toBeUndefined();
  room();
  room();
  first();
  first();
  expect(gate.reserveRoom('room')).toBeTypeOf('function');
  expect(gate.reserveTransport('a')).toBeTypeOf('function');
  second();
});

it('charges failed attempts and expires address tracking', () => {
  let now = 0;
  const gate = new ConnectionAdmission(
    {
      maxConnectionsPerIp: 1,
      maxTotalConnections: 2,
      maxParticipantsPerRoom: 1,
    },
    () => now,
  );
  expect(gate.attempt('a')).toBe(true);
  expect(gate.attempt('a')).toBe(false);
  now = 600_000;
  gate.sweep();
  expect(gate.attempt('a')).toBe(true);
});
