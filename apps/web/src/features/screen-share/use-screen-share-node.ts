import { useState } from 'react';
import { applyNodeChanges, type NodeChange } from '@xyflow/react';
import { constrainCursorPosition } from '../cursors/cursor-position';
import type { ScreenShareNode } from './screen-share-node';
import { useScreenShare } from './use-screen-share';

export function useScreenShareNode(connected: boolean) {
  const screen = useScreenShare();
  const [presentation, setPresentation] =
    useState<
      Pick<ScreenShareNode, 'id' | 'position' | 'measured' | 'selected'>
    >();
  const id = screen.share ? `screen:${screen.share.id}` : undefined;
  const previous = presentation?.id === id ? presentation : undefined;
  const node: ScreenShareNode | undefined =
    screen.share && id
      ? {
          id,
          type: 'screenShare',
          origin: [0.5, 0],
          position: screen.local
            ? (previous?.position ?? screen.share.position)
            : screen.share.position,
          measured: previous?.measured,
          selected: previous?.selected,
          draggable: screen.local && connected,
          deletable: false,
          data: screen,
        }
      : undefined;

  const onChanges = (changes: NodeChange[]) => {
    if (!node || !screen.share) return;
    const local = changes.filter(
      (change) =>
        'id' in change && change.id === node.id && change.type !== 'remove',
    );
    if (!local.length) return;
    // React Flow requires measured dimensions in controlled nodes, including live nodes.
    const [next] = applyNodeChanges(local as NodeChange<ScreenShareNode>[], [
      node,
    ]);
    if (!next) return;
    setPresentation({
      id: next.id,
      position: next.position,
      measured: next.measured,
      selected: next.selected,
    });
    if (!screen.local) return;
    for (const change of local) {
      if (change.type !== 'position' || change.dragging !== false) continue;
      const position = constrainCursorPosition(
        change.position ?? next.position,
      );
      if (position) screen.move(screen.share.id, position);
    }
  };
  return { screen, node, onChanges };
}
