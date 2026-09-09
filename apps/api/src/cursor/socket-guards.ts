import { CURSOR_EVENTS, cursorInputSchema } from '@app/shared';
import type {
  CursorSocket,
  Participant,
  CursorLogger,
} from './cursor-types.js';
import type { TokenBucket } from './token-bucket.js';
const ABUSE_DISCONNECT_THRESHOLD = 20;
const ABUSE_WINDOW_MS = 10_000;
const ABUSE_LOG_INTERVAL_MS = 5_000;
export function createSocketGuards(now: () => number, logger: CursorLogger) {
  const recordViolation = (
    socket: CursorSocket,
    participant: Participant,
    reason: string,
    issueCodes?: string[],
  ) => {
    const currentTime = now();

    if (currentTime - participant.violationWindowStartedAt >= ABUSE_WINDOW_MS) {
      participant.violationCount = 0;
      participant.violationWindowStartedAt = currentTime;
    }

    participant.violationCount += 1;
    const reachedDisconnectThreshold =
      participant.violationCount >= ABUSE_DISCONNECT_THRESHOLD;
    const shouldLog =
      reachedDisconnectThreshold ||
      participant.lastViolationLogAt === undefined ||
      currentTime - participant.lastViolationLogAt >= ABUSE_LOG_INTERVAL_MS;

    if (shouldLog) {
      participant.lastViolationLogAt = currentTime;
      logger.warn(
        {
          issueCodes,
          reason,
          socketId: socket.id,
          violations: participant.violationCount,
        },
        'Rejected abusive cursor socket message',
      );
    }

    if (reachedDisconnectThreshold) {
      socket.emit(CURSOR_EVENTS.disconnect, { reason: 'abuse' });
      socket.disconnect(true);
    }
  };

  const acceptMessageBudget = (
    socket: CursorSocket,
    participant: Participant,
    eventName: string,
  ) => {
    const currentTime = now();

    if (!participant.messageLimiter.take(currentTime)) {
      recordViolation(socket, participant, `rate:${eventName}`);
      return;
    }

    return currentTime;
  };

  const acceptCursorInput = (
    socket: CursorSocket,
    participant: Participant,
    input: unknown,
    limiter: TokenBucket,
    eventName: string,
  ) => {
    const acceptedAt = acceptMessageBudget(socket, participant, eventName);

    if (acceptedAt === undefined) {
      return;
    }

    const result = cursorInputSchema.safeParse(input);

    if (!result.success) {
      recordViolation(
        socket,
        participant,
        `invalid:${eventName}`,
        result.error.issues.map((issue) => issue.code),
      );
      return;
    }

    if (!limiter.take(acceptedAt)) {
      recordViolation(socket, participant, `rate:${eventName}`);
      return;
    }

    if (result.data.sequence <= participant.lastSequence) {
      return;
    }

    participant.lastActivityAt = acceptedAt;
    participant.lastSequence = result.data.sequence;
    return result.data;
  };

  return { recordViolation, acceptMessageBudget, acceptCursorInput };
}
