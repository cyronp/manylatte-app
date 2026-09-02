export const CANVAS_REGION_WIDTH = 1_920;
export const CANVAS_REGION_HEIGHT = 1_080;
export const CANVAS_COLUMN_COUNT = 2;
export const CANVAS_ROW_COUNT = 2;

export const CANVAS_WIDTH = CANVAS_REGION_WIDTH * CANVAS_COLUMN_COUNT;
export const CANVAS_HEIGHT = CANVAS_REGION_HEIGHT * CANVAS_ROW_COUNT;
export const MAX_CANVAS_MESSAGES_PER_NODE = 200;

export const CANVAS_EVENTS = {
  messageSend: 'canvas:message-send',
  mutation: 'canvas:mutation',
  nodeUpsert: 'canvas:node-upsert',
  snapshot: 'canvas:snapshot',
  typing: 'canvas:typing',
} as const;
