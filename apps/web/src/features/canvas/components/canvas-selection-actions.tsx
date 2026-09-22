import { TrashIcon } from '@phosphor-icons/react';
import { NodeToolbar, useNodes, useReactFlow } from '@xyflow/react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export function CanvasSelectionActions({ disabled }: { disabled: boolean }) {
  const nodes = useNodes();
  const { deleteElements, setNodes } = useReactFlow();
  const selected = nodes.filter((node) => node.selected);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== 'a'
      )
        return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'input, textarea, select, [role="textbox"], [role="dialog"], [role="menu"]',
          ))
      )
        return;

      event.preventDefault();
      setNodes((current) =>
        current.map((node) => ({
          ...node,
          selected: node.selectable !== false,
        })),
      );
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [setNodes]);

  return (
    <NodeToolbar
      nodeId={selected.map((node) => node.id)}
      isVisible={selected.length > 0}
      offset={8}
      role="group"
      aria-label="Selection actions"
      data-canvas-selection-actions
      className="nodrag nopan nowheel flex cursor-auto items-center gap-2 rounded-full border bg-background px-4 py-2 text-foreground shadow-lg"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (!(event.ctrlKey || event.metaKey)) event.stopPropagation();
      }}
    >
      <span className=" text-sm whitespace-nowrap">
        {selected.length} selected
      </span>
      <Button
        aria-label="Delete selected items"
        title="Delete selected items"
        variant="destructive"
        size="icon-sm"
        disabled={
          disabled || !selected.some((node) => node.deletable !== false)
        }
        onClick={() => void deleteElements({ nodes: selected })}
      >
        <TrashIcon aria-hidden="true" />
      </Button>
    </NodeToolbar>
  );
}
