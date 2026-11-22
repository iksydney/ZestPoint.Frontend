import { expect, test } from '@playwright/test';
import { choose, registerViaUi } from './helpers';

/**
 * Consignment out: goods are sent from a branch to an agent at agreed prices; what the agent reports sold goes on a bill for them
 * to pay at the till; what comes back returns to the shelf.
 */
test.describe('Consignment out', () => {
  test('goods go out to an agent, some are sold on a bill at the agreed price and one comes back', async ({ page }) => {
    await registerViaUi(page);
    await page.getByTestId('save-continue').click();
    await page.getByTestId('go-staff').click();
    await expect(page).toHaveURL(/\/app\/staff$/);
    // The demonstration data gives the branch stock to send (48 tins of beans).
    await page.goto('/app/settings/operations');
    await page.getByTestId('seed-demo').click();
    await expect(page.getByTestId('demo-msg')).toContainText(/loaded|already/i);

    // An agent first; a second with the same name is refused.
    await page.goto('/app/inventory/consignment');
    await expect(page.getByRole('heading', { name: 'Consignment Out' })).toBeVisible();
    await page.getByTestId('agents-open').click();
    await page.getByTestId('agent-name').fill('Corner Boutique');
    await page.getByTestId('agent-phone').fill('0803 555 0199');
    await page.getByTestId('agent-save').click();
    await expect(page.getByTestId('agent-Corner Boutique')).toBeVisible();
    await page.getByTestId('agent-name').fill('corner boutique');
    await page.getByTestId('agent-save').click();
    await expect(page.getByTestId('agent-name-error')).toContainText('already has that name');
    await page.keyboard.press('Escape');

    // Send six tins at an agreed price; more than the branch has is refused by the server.
    await page.getByTestId('cons-new').click();
    await choose(page, 'cn-agent', 'Corner Boutique');
    await page.getByTestId('cn-item-search').fill('Canned Beans');
    await page.getByTestId('cn-item-Demo Canned Beans 400g').click();
    await page.getByTestId('cn-qty-Demo Canned Beans 400g').fill('500');
    await page.getByTestId('cn-price-Demo Canned Beans 400g').fill('900');
    await page.getByTestId('cn-send').click();
    await expect(page.getByTestId('cn-lines-error')).toContainText('can be sent from this branch');
    await page.getByTestId('cn-qty-Demo Canned Beans 400g').fill('6');
    await page.getByTestId('cn-send').click();
    await expect(page.getByTestId('cons-notice')).toContainText('sent to Corner Boutique');
    await expect(page.getByTestId('cons-value-1')).toHaveText('5,400.00');
    await expect(page.getByTestId('cons-out-1-Demo Canned Beans 400g')).toHaveText('6');

    // The stock card shows them as out on consignment.
    await page.goto('/app/inventory/items');
    await page.getByTestId('item-edit-Demo Canned Beans 400g').click();
    await expect(page.getByTestId('fig-consignment')).toHaveText('6');
    await page.getByTestId('sc-close').click();

    // Four are reported sold: one bill for the agent at 900 each.
    await page.goto('/app/inventory/consignment');
    await page.getByTestId('cons-sold-1').click();
    await page.getByTestId('cq-Demo Canned Beans 400g').fill('9');
    await page.getByTestId('cq-save').click();
    await expect(page.getByTestId('cq-error')).toContainText('still with the agent');
    await page.getByTestId('cq-Demo Canned Beans 400g').fill('4');
    await page.getByTestId('cq-save').click();
    await expect(page.getByTestId('cons-notice')).toContainText('opened for Corner Boutique');
    await expect(page.getByTestId('cons-sales-1')).toContainText('4 x Demo Canned Beans 400g');
    await expect(page.getByTestId('cons-out-1-Demo Canned Beans 400g')).toHaveText('2');

    // One comes back, and the report of one more is taken back before it is paid.
    await page.getByTestId('cons-returned-1').click();
    await page.getByTestId('cq-Demo Canned Beans 400g').fill('1');
    await page.getByTestId('cq-save').click();
    await expect(page.getByTestId('cons-notice')).toContainText('back on the shelf');
    await expect(page.getByTestId('cons-out-1-Demo Canned Beans 400g')).toHaveText('1');
    await page.getByTestId('cons-sold-1').click();
    await page.getByTestId('cq-Demo Canned Beans 400g').fill('1');
    await page.getByTestId('cq-save').click();
    await expect(page.getByTestId('cons-notice')).toContainText('Bill #2 opened');
    await expect(page.getByTestId('cons-list')).toContainText('Nothing here.');           // everything is sold or back: it has left the 'still out' list
    await page.getByTestId('cons-status').selectOption('');
    await expect(page.getByTestId('cons-sales-1')).toContainText('1 x Demo Canned Beans 400g');
    await expect(page.locator('[data-testid^="cons-undo-"]')).toHaveCount(2);              // both bills are still unpaid
    const undo = page.locator('[data-testid^="cons-undo-"]').last();
    await undo.click();
    await page.getByTestId('undo-reason').fill('Wrong agent');
    await page.getByTestId('undo-confirm').click();
    await expect(page.getByTestId('cons-sales-1')).toContainText('Taken back');
    await expect(page.getByTestId('cons-out-1-Demo Canned Beans 400g')).toHaveText('1');

    // The agent's bill is at the till, fixed, at the agreed price.
    await page.goto('/app/pos');
    await page.getByText('Corner Boutique (consignment #1)').first().click();
    await expect(page.getByTestId('bill-consignment')).toBeVisible();
    await expect(page.getByTestId('bill-total')).toContainText('3,600.00');

    // The report lists what is still out.
    await page.goto('/app/inventory/reports/consignment-out');
    await expect(page.getByRole('heading', { name: 'Consignment Out Report' })).toBeVisible();
    await expect(page.getByText('Corner Boutique').first()).toBeVisible();

    // Phone width: no sideways page scroll.
    await page.goto('/app/inventory/consignment');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Consignment Out' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
