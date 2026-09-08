export const CANVAS_REGION_WIDTH = 1_920;
export const CANVAS_REGION_HEIGHT = 1_080;
export const CANVAS_COLUMN_COUNT = 2;
export const CANVAS_ROW_COUNT = 2;

export const CANVAS_WIDTH = CANVAS_REGION_WIDTH * CANVAS_COLUMN_COUNT;
export const CANVAS_HEIGHT = CANVAS_REGION_HEIGHT * CANVAS_ROW_COUNT;
export const MAX_CANVAS_MESSAGES_PER_NODE = 200;
export const MAX_CANVAS_MESSAGE_LENGTH = 1_000;
export const MAX_CANVAS_ROOM_MESSAGES = 2_000;
export const MAX_CANVAS_ROOM_TEXT_BYTES = 2 * 1024 * 1024;
export const CANVAS_HISTORY_PAGE_SIZE = 50;
export const CANVAS_PREVIEW_MESSAGES = 1;

export const CANVAS_EVENTS = {
  command: 'canvas:command',
  change: 'canvas:change',
  history: 'canvas:history',
  error: 'canvas:error',
  messageSend: 'canvas:message-send',
  mutation: 'canvas:mutation',
  nodeRemove: 'canvas:node-remove',
  nodeUpsert: 'canvas:node-upsert',
  snapshot: 'canvas:snapshot',
  typing: 'canvas:typing',
} as const;
