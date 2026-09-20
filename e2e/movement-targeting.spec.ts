import {test,expect} from '@playwright/test';

test.use({serviceWorkers:'block'});
test('target selection waits for movement without submitting automatically',async({page,context,baseURL},info)=>{
  // No fixture request may reach a backend, including production.
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(baseURL!).origin
    ?route.continue():route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('/e2e/fixtures/movement-targeting.html');
  const target=page.getByRole('button',{name:/Goblin/});
  await expect(target).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Waiting for token movement');
  await expect(page.getByRole('status')).toBeInViewport({ratio:1});
  await expect(target).toBeInViewport({ratio:1});
  await target.dispatchEvent('click');await expect(page.getByTestId('picked')).toBeEmpty();
  await page.screenshot({path:info.outputPath('waiting-for-movement.png')});
  await page.evaluate(()=>(window as unknown as {finishMovement:()=>void}).finishMovement());
  await expect(target).toBeEnabled();await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByTestId('picked')).toBeEmpty();
  await target.click();await expect(page.getByTestId('picked')).toHaveText('g');
  expect(errors).toEqual([]);
});
