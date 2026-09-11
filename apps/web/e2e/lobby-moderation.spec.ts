import { test, expect, type Page } from '@playwright/test';

async function openUsers(page: Page) {
  await page.getByRole('button', { name: 'Open user menu' }).click();
  await page.getByRole('menuitem', { name: 'Lobby Users' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('creator delegates ownership, new owner survives restart and can kick the former owner', async ({
  browser,
  request,
}) => {
  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  try {
    const owner = await ownerContext.newPage();
    const guest = await guestContext.newPage();
    await owner.addInitScript(() =>
      localStorage.setItem('manylatte:username', 'Alice'),
    );
    await guest.addInitScript(() =>
      localStorage.setItem('manylatte:username', 'Bob'),
    );
    await owner.goto('/');
    await owner
      .getByRole('button', { name: 'Create lobby', exact: true })
      .click();
    await owner
      .getByRole('textbox', { name: 'Lobby name' })
      .fill('Owner controls');
    await owner.getByRole('button', { name: 'Create and join lobby' }).click();
    await expect(owner).toHaveURL(/lobby=/);
    await expect(owner.getByRole('button', { name: 'Reconnect' })).toHaveCount(
      0,
    );
    await guest.goto(owner.url());
    await openUsers(owner);
    await openUsers(guest);
    await expect(
      owner.getByRole('button', { name: 'Kick Bob', exact: true }),
    ).toBeEnabled();
    await expect(guest.getByRole('button', { name: /^Kick / })).toHaveCount(0);
    await expect(guest.getByText('Owner', { exact: true })).toHaveCount(1);
    await owner
      .getByRole('button', { name: 'Make Bob the owner', exact: true })
      .click();
    await expect(owner.getByRole('button', { name: /^Kick / })).toHaveCount(0);
    await expect(
      guest.getByRole('button', { name: 'Kick Alice', exact: true }),
    ).toBeEnabled();
    await expect(guest.getByText('Owner', { exact: true })).toHaveCount(1);
    await guest.reload();
    await openUsers(guest);
    await expect(
      guest.getByRole('button', { name: 'Kick Alice', exact: true }),
    ).toBeEnabled();
    expect((await request.post('/test/restart')).ok()).toBe(true);
    await expect(
      guest.getByRole('button', { name: 'Kick Alice', exact: true }),
    ).toBeEnabled({ timeout: 15000 });
    await guest
      .getByRole('button', { name: 'Kick Alice', exact: true })
      .click();
    const kickedDialog = owner.getByRole('alertdialog', {
      name: 'You were kicked from this lobby',
    });
    await expect(kickedDialog).toBeVisible();
    await expect(kickedDialog).toContainText('You can no longer rejoin it.');
    await expect(owner.getByRole('button', { name: 'Reconnect' })).toHaveCount(
      0,
    );
    await expect(owner.locator('.react-flow__pane')).toHaveCount(0);
    await owner.keyboard.press('Escape');
    await expect(kickedDialog).toBeVisible();
    await expect(
      guest.getByRole('heading', { name: 'Alice', exact: true }),
    ).toHaveCount(0);
    await expect(guest.getByText('Owner', { exact: true })).toHaveCount(1);
    const invite = owner.url();
    await owner.reload();
    await expect(kickedDialog).toBeVisible();
    expect((await request.post('/test/restart')).ok()).toBe(true);
    await owner.reload();
    await expect(kickedDialog).toBeVisible();
    await kickedDialog.getByRole('link', { name: 'Back to lobbies' }).click();
    await expect(owner.getByLabel('Lobby code', { exact: true })).toBeVisible();
    await owner.goto(invite);
    await expect(kickedDialog).toBeVisible();
  } finally {
    await ownerContext.close();
    await guestContext.close();
  }
});
