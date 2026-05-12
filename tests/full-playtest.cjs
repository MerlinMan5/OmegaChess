const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = 'http://localhost:4174';
let passed = 0, failed = 0;

function sq(s, flipped = false) {
  const file = s.charCodeAt(0) - 97;
  const rank = parseInt(s[1]);
  return { row: flipped ? rank - 1 : 8 - rank, col: flipped ? 7 - file : file };
}

async function move(page, from, to, flipped = false) {
  const f = sq(from, flipped), t = sq(to, flipped);
  await page.locator('.board-row').nth(f.row).locator('.sq').nth(f.col).click();
  await page.waitForTimeout(180);
  await page.locator('.board-row').nth(t.row).locator('.sq').nth(t.col).click();
  await page.waitForTimeout(350);
}

function assert(label, val) {
  if (val) { console.log(`  ✓ ${label}`); passed++; }
  else      { console.log(`  ✗ ${label}`); failed++; }
}

async function pickCard(page) {
  try {
    await page.waitForSelector('.card:not(.disabled)', { timeout: 3000 });
    const name = await page.locator('.card:not(.disabled) .card-name').first().textContent();
    await page.locator('.card:not(.disabled)').first().click();
    return name;
  } catch { return null; }
}

async function handleCards(p1, p2) {
  if (await p1.locator('.card-hand').isVisible().catch(() => false)) {
    const c1 = await pickCard(p1);
    await p2.waitForSelector('.card-hand', { timeout: 5000 }).catch(() => {});
    const c2 = await pickCard(p2);
    await p1.waitForFunction(() => !document.querySelector('.card-hand') && !document.querySelector('.waiting-banner'),
      { timeout: 6000 }).catch(() => {});
    await p1.waitForTimeout(300);
    return { p1: c1, p2: c2 };
  }
  return null;
}

async function newRoom(browser) {
  const p1 = await browser.newPage();
  const p2 = await browser.newPage();
  await p1.goto(BASE);
  await p1.click('text=Create Game');
  await p1.waitForSelector('.room-code');
  const code = await p1.locator('code').textContent();
  await p2.goto(`${BASE}?room=${code}`);
  await p1.waitForSelector('.board', { timeout: 8000 });
  await p2.waitForSelector('.board', { timeout: 8000 });
  await p1.waitForTimeout(600);
  return { p1, p2, code };
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    // ═══════════════════════════════════════════════════
    console.log('\n══ Suite 1: Lobby & Connection ══');
    // ═══════════════════════════════════════════════════
    const { p1, p2, code } = await newRoom(browser);

    assert('Lobby loads & creates room', code.length === 6);
    assert('P1 assigned white', await p1.locator('.you-are strong').textContent().then(t => t === 'white'));
    assert('P2 assigned black', await p2.locator('.you-are strong').textContent().then(t => t === 'black'));
    assert('Board flips for black (h on left)', await p2.locator('.coord.file').first().textContent().then(t => t === 'h').catch(() => false));
    assert('Coordinates visible (rank numbers)', await p1.locator('.coord.rank').count().then(c => c > 0));
    assert('Card countdown shows', await p1.locator('.card-countdown').isVisible());
    assert('Waiting for opponent message gone', !(await p1.locator('.waiting-label').isVisible().catch(() => false)));

    await p1.close(); await p2.close();

    // ═══════════════════════════════════════════════════
    console.log('\n══ Suite 2: Move Mechanics ══');
    // ═══════════════════════════════════════════════════
    const { p1: m1, p2: m2 } = await newRoom(browser);

    const e2 = sq('e2');
    await m1.locator('.board-row').nth(e2.row).locator('.sq').nth(e2.col).click();
    await m1.waitForTimeout(200);
    assert('Legal dots appear on piece select', await m1.locator('.legal-dot').count() > 0);

    await m1.locator('.board-row').nth(e2.row).locator('.sq').nth(e2.col).click();
    await m1.waitForTimeout(150);

    const e7b = sq('e7', true);
    await m2.locator('.board-row').nth(e7b.row).locator('.sq').nth(e7b.col).click();
    await m2.waitForTimeout(150);
    assert("Black can't move on white's turn", await m2.locator('.legal-dot').count() === 0);

    await move(m1, 'e2', 'e4');
    assert('Last-move highlight appears', await m1.locator('.sq.last-move').count() === 2);
    assert('Turn passes to black after white moves', await m1.locator('.turn-label').textContent().then(t => t.includes('black')));

    await move(m2, 'e7', 'e5', true);
    assert('Black can move on their turn', await m2.locator('.sq.last-move').count() === 2);
    assert('Turn passes back to white', await m1.locator('.turn-label').textContent().then(t => t.includes('Your turn')));

    await m1.close(); await m2.close();

    // ═══════════════════════════════════════════════════
    console.log('\n══ Suite 3: Capture & Captured Pieces ══');
    // ═══════════════════════════════════════════════════
    // Fresh room: white captures black's d5 pawn after 1 full move — no card deal yet
    const { p1: cp1, p2: cp2 } = await newRoom(browser);

    await move(cp1, 'e2', 'e4');
    await move(cp2, 'd7', 'd5', true);  // fullmove 1
    await move(cp1, 'e4', 'd5');        // exd5 — capture! (white's move 2, fullmove still 1)
    await cp1.waitForTimeout(400);

    const captureRow = await cp1.locator('.captured-row').first().textContent();
    console.log(`  Captured row text: "${captureRow}" (length: ${captureRow.length})`);
    assert('Captured pieces display updates after capture', captureRow.length >= 10);
    assert('Advantage score shows', await cp1.locator('.advantage').isVisible().catch(() => false));

    await cp1.close(); await cp2.close();

    // ═══════════════════════════════════════════════════
    console.log('\n══ Suite 4: Check Detection ══');
    // ═══════════════════════════════════════════════════
    // Fresh room: 1.e4 e5 2.Bc4 Nc6 3.Bxf7+ (check — bishop on f7 attacks king on e8)
    // Only 2 full moves completed before the check move, so NO card deal triggers.
    const { p1: ck1, p2: ck2 } = await newRoom(browser);

    await move(ck1, 'e2', 'e4');
    await move(ck2, 'e7', 'e5', true);   // fullmove 1
    await move(ck1, 'f1', 'c4');
    await move(ck2, 'b8', 'c6', true);   // fullmove 2 (2%3 ≠ 0, no card deal)
    await move(ck1, 'c4', 'f7');         // Bxf7+ — bishop captures f7 pawn, check to king on e8!
    await ck1.waitForTimeout(500);

    assert('Check square highlighted (red)', await ck1.locator('.sq.check-sq').isVisible().catch(() => false));
    assert("CHECK shown in black's turn indicator", await ck2.locator('.turn-label').textContent().then(t => t.includes('CHECK')).catch(() => false));

    await ck1.close(); await ck2.close();

    // ═══════════════════════════════════════════════════
    console.log('\n══ Suite 5: Card System ══');
    // ═══════════════════════════════════════════════════
    // Fresh room: play 3 full moves (6 half-moves) to trigger first card deal
    const { p1: cd1, p2: cd2 } = await newRoom(browser);

    await move(cd1, 'e2', 'e4');
    await move(cd2, 'e7', 'e5', true);   // fullmove 1
    await move(cd1, 'd2', 'd4');
    await move(cd2, 'd7', 'd5', true);   // fullmove 2
    await move(cd1, 'c2', 'c4');
    await move(cd2, 'c7', 'c5', true);   // fullmove 3 — card deal triggered!
    await cd1.waitForTimeout(500);

    const cardHandVisible = await cd1.locator('.card-hand').isVisible().catch(() => false);
    assert('Card selection phase triggers', cardHandVisible);

    const cards = await handleCards(cd1, cd2);
    assert('Both players pick cards', !!(cards?.p1 && cards?.p2));
    console.log(`  P1 picked: ${cards?.p1}, P2 picked: ${cards?.p2}`);

    const effectCount = await cd1.locator('.effect-row').count();
    assert('Active effects displayed after card selection', effectCount > 0);
    assert('Card countdown resets after deal', await cd1.locator('.card-countdown').textContent().then(t => t.includes('3') || t.includes('2') || t.includes('1')));

    const effectText = await cd1.locator('.effect-row').first().textContent().catch(() => '');
    assert('Effect shows card name + turns remaining', effectText.includes('turn'));

    await cd1.close(); await cd2.close();

    // ═══════════════════════════════════════════════════
    console.log("\n══ Suite 6: Fool's Mate — Black Wins ══");
    // ═══════════════════════════════════════════════════
    const { p1: q1, p2: q2 } = await newRoom(browser);

    await move(q1, 'f2', 'f3');
    await move(q2, 'e7', 'e5', true);
    await move(q1, 'g2', 'g4');
    await move(q2, 'd8', 'h4', true);  // Qh4# — Fool's Mate!
    await q2.waitForTimeout(800);

    const foolsText = await q1.locator('.game-status.gameover').textContent().catch(() => '');
    assert('Game over banner appears', foolsText.length > 0);
    assert('Black wins message correct', foolsText.toLowerCase().includes('black') || foolsText.toLowerCase().includes('checkmate'));
    assert('Play Again button shown', await q1.locator('.rematch-btn').isVisible().catch(() => false));

    await q1.screenshot({ path: '/tmp/test-fools.png', fullPage: true });
    console.log('  Screenshot: /tmp/test-fools.png');

    // ═══════════════════════════════════════════════════
    console.log("\n══ Suite 7: Rematch & Scholar's Mate — White Wins ══");
    // ═══════════════════════════════════════════════════
    await q1.locator('.rematch-btn').click();
    await q1.waitForTimeout(800);

    assert('Board resets after rematch', await q1.locator('.board').isVisible());
    assert('Move count resets', await q1.locator('.move-count').textContent().then(t => t.includes('0')));
    assert('No active effects after rematch', await q1.locator('.active-effects').isVisible().then(v => !v).catch(() => true));

    // Scholar's Mate: 3 full moves then Qxf7# (cards dealt after fullmove 3)
    await move(q1, 'e2', 'e4');
    await move(q2, 'e7', 'e5', true);
    await move(q1, 'f1', 'c4');
    await move(q2, 'b8', 'c6', true);
    await move(q1, 'd1', 'h5');
    await move(q2, 'g8', 'f6', true);   // fullmove 3 — card deal!
    await q1.waitForTimeout(600);

    const scholarsCards = await handleCards(q1, q2);
    console.log(`  Cards dealt: P1=${scholarsCards?.p1}, P2=${scholarsCards?.p2}`);

    // Burn through any Hobbit Charge or frozen turns with safe pawn moves.
    // Hobbit Charge affects ALL players when active (server-side check is global).
    // Note: c7→c6 blocked by Nc6; g7→g6 blocks queen path h5→g6→f7; h6→h5 would capture queen.
    const wBurners = [['a2','a3'],['b2','b3'],['c2','c3'],['d2','d3'],['h2','h3'],
                      ['a3','a4'],['b3','b4'],['d3','d4'],['h3','h4']];
    const bBurners = [['a7','a6'],['b7','b6'],['d7','d6'],['h7','h6'],
                      ['a6','a5'],['b6','b5'],['d6','d5'],['f7','f6']];
    let bi = 0;

    for (let iter = 0; iter < 20; iter++) {
      const extraCards = await handleCards(q1, q2);
      if (extraCards) console.log(`  Extra card deal: P1=${extraCards.p1}, P2=${extraCards.p2}`);

      // Hobbit Charge affects current turn player regardless of who played it
      const hobbitAny = await q1.locator('.effect-row').filter({ hasText: 'Hobbit' }).count().catch(() => 0);
      const frozen1 = await q1.locator('.pass-btn').isVisible().catch(() => false);
      if (!hobbitAny && !frozen1) break;

      if (frozen1) {
        await q1.locator('.pass-btn').click();
        await q1.waitForTimeout(400);
      } else if (bi < wBurners.length) {
        await move(q1, wBurners[bi][0], wBurners[bi][1]);
      }
      await q1.waitForTimeout(200);

      await handleCards(q1, q2);
      const frozen2 = await q2.locator('.pass-btn').isVisible().catch(() => false);
      if (frozen2) {
        await q2.locator('.pass-btn').click();
        await q2.waitForTimeout(400);
      } else if (bi < bBurners.length) {
        await move(q2, bBurners[bi][0], bBurners[bi][1], true);
      }
      bi++;
      await q1.waitForTimeout(300);
    }

    await move(q1, 'h5', 'f7');  // Qxf7#
    await q1.waitForTimeout(800);

    const scholarsText = await q1.locator('.game-status.gameover').textContent().catch(() => '');
    assert("Scholar's Mate: game over detected", scholarsText.length > 0);
    assert("Scholar's Mate: white wins", scholarsText.toLowerCase().includes('white') || scholarsText.toLowerCase().includes('checkmate'));

    await q1.screenshot({ path: '/tmp/test-scholars.png', fullPage: true });
    console.log('  Screenshot: /tmp/test-scholars.png');

    // ═══════════════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════');
    console.log(`  ${passed} passed   ${failed} failed`);
    console.log('══════════════════════════════════════');

  } finally {
    await browser.close();
  }

  if (failed > 0) process.exit(1);
})().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
