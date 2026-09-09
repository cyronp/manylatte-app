// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lobbySchema } from '@app/shared';

import { InviteFriendsDialog } from './invite-friends-dialog';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../ui/dialog', () => ({
  Dialog: ({ children }: { children?: ReactNode }) => children,
  DialogContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogHeader: ({ children }: { children?: ReactNode }) => (
    <header>{children}</header>
  ),
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

const lobby = lobbySchema.parse({
  id: 'friends',
  code: 'AB12-CD34',
  name: 'Friends',
});

describe('InviteFriendsDialog', () => {
  let container: HTMLDivElement;
  let root: Root;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    window.history.replaceState({}, '', '/canvas?old=value#draft');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const renderDialog = async (open = true) => {
    await act(async () => {
      root.render(
        <InviteFriendsDialog
          lobby={lobby}
          open={open}
          onOpenChange={vi.fn()}
        />,
      );
    });
  };

  const copyButton = (label: string) => {
    const button = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.getAttribute('aria-label') === label,
    );
    if (!button) throw new Error(`Could not find ${label}`);
    return button;
  };

  it('copies the code and sanitized invite URL with unique labelled inputs', async () => {
    await renderDialog();

    const inputs = Array.from(container.querySelectorAll('input'));
    const labels = Array.from(container.querySelectorAll('label'));
    expect(inputs).toHaveLength(2);
    const [codeInput, inviteInput] = inputs;
    if (!codeInput || !inviteInput) throw new Error('Missing invite inputs');
    expect(new Set(inputs.map((input) => input.id)).size).toBe(2);
    expect(labels.map((label) => label.htmlFor)).toEqual(
      inputs.map((input) => input.id),
    );

    const inviteUrl = new URL(inviteInput.value);
    expect(inviteUrl.pathname).toBe('/canvas');
    expect(Object.fromEntries(inviteUrl.searchParams)).toEqual({
      lobby: lobby.code,
    });
    expect(inviteUrl.hash).toBe('');

    const codeButton = copyButton('Copy lobby code');
    expect(codeButton.type).toBe('button');
    await act(async () => codeButton.click());
    expect(codeButton.disabled).toBe(true);
    expect(codeButton.textContent).toContain('Copying…');
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(writeText).toHaveBeenNthCalledWith(1, lobby.code);
    expect(codeButton.textContent).toContain('lobby code copied');

    const linkButton = copyButton('Copy invite link');
    await act(async () => linkButton.click());
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(writeText).toHaveBeenNthCalledWith(2, inviteInput.value);
    expect(linkButton.textContent).toContain('invite link copied');
  });

  it('shows clipboard failures and associates the recovery text with the input', async () => {
    writeText.mockRejectedValue(new Error('Clipboard unavailable'));
    await renderDialog();

    const button = copyButton('Copy invite link');
    await act(async () => button.click());
    await act(async () => vi.advanceTimersByTimeAsync(600));

    const field = button.closest('[role="group"]');
    const input = field?.querySelector('input');
    const status = field?.querySelector<HTMLElement>('[role="status"]');
    expect(button.textContent).toContain('Couldn’t copy');
    expect(status?.classList.contains('sr-only')).toBe(false);
    expect(status?.textContent).toContain(
      'Could not copy invite link. Select it above and copy it manually.',
    );
    expect(input?.getAttribute('aria-describedby')).toBe(status?.id);
  });

  it('resets feedback on close and ignores a late clipboard result', async () => {
    let resolveCopy: (() => void) | undefined;
    writeText.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveCopy = resolve;
      }),
    );
    await renderDialog();

    const button = copyButton('Copy invite link');
    await act(async () => button.click());
    expect(button.textContent).toContain('Copying…');

    await renderDialog(false);
    await renderDialog(true);
    expect(button.textContent).toContain('Copy invite link');
    expect(button.disabled).toBe(false);

    resolveCopy?.();
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(button.textContent).toContain('Copy invite link');
    expect(
      button.closest('[role="group"]')?.querySelector('[role="status"]')
        ?.textContent,
    ).toBe('');
  });
});
