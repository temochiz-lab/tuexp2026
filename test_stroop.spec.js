// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');

const BASE_URL = 'file:///C:/Users/temoc/Desktop/git/tuexp2026/index.html';
const TRIAL_COUNT = 3;
const PRACTICE_COUNT = 3;

// ---- CSV パーサー（クォート付きフィールド対応）----
function parseCSV(csvText) {
    const lines = csvText.replace(/\r/g, '').split('\n').filter(l => l.trim());

    function parseLine(line) {
        const fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') {
                if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
                else inQuotes = !inQuotes;
            } else if (line[i] === ',' && !inQuotes) {
                fields.push(current); current = '';
            } else {
                current += line[i];
            }
        }
        fields.push(current);
        return fields;
    }

    const headers = parseLine(lines[0]);
    return lines.slice(1).map(line => {
        const vals = parseLine(line);
        const row = {};
        headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim(); });
        return row;
    });
}

// ---- マーカーの状態を取得するヘルパー ----
async function getMarkerColor(page) {
    return page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('div'))
            .find(d => d.style.zIndex === '2147483647');
        return el ? window.getComputedStyle(el).backgroundColor : null;
    });
}

async function isMarkerHidden(page) {
    return page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('div'))
            .find(d => d.style.zIndex === '2147483647');
        if (!el) return true; // DOM未追加も非表示扱い
        return window.getComputedStyle(el).display === 'none';
    });
}

// ---- タスク1個分の練習・本番試行を実行 ----
// isFirstTask=true のとき、練習試行中にマーカーがDOM未追加(null)であることを確認する
async function runTask(page, taskNum, isFirstTask = false) {
    // 教示（本番試行終了後はマーカーが非表示になっていることを確認）
    await expect(page.getByText('練習試行を始めます')).toBeVisible();
    expect(await isMarkerHidden(page)).toBe(true); // 教示画面ではマーカー非表示
    await page.getByRole('button', { name: '次へ' }).click();
    await page.waitForTimeout(300);

    // 練習試行
    console.log(`  task=${taskNum} 練習試行 ${PRACTICE_COUNT} 回...`);
    for (let i = 0; i < PRACTICE_COUNT; i++) {
        await page.waitForTimeout(1200); // 注視点（1秒）
        // 最初のタスクの練習試行のみ: マーカーがDOMに未追加(null)であることを確認
        // 2つ目以降のタスクでは前タスクの本試行でDOMに追加済みのためスキップ
        if (isFirstTask) expect(await getMarkerColor(page)).toBeNull();
        await page.keyboard.press('1');
        await page.waitForTimeout(300);
        await page.keyboard.press(' '); // フィードバック → 次へ
        await page.waitForTimeout(300);
    }

    // 本試行開始メッセージ
    await expect(page.getByText('本試行を始めます')).toBeVisible();
    // 開始画面でマーカーが黒（■）であることを確認
    expect(await getMarkerColor(page)).toBe('rgb(0, 0, 0)');
    await page.getByRole('button', { name: '次へ' }).click();
    await page.waitForTimeout(300);

    // 本試行
    console.log(`  task=${taskNum} 本試行 ${TRIAL_COUNT} 回...`);
    for (let i = 0; i < TRIAL_COUNT; i++) {
        await page.waitForTimeout(500); // 注視点表示中（1秒のうち500ms経過）
        // 注視点中（次の問題）はマーカーが黒（■）であることを確認
        expect(await getMarkerColor(page)).toBe('rgb(0, 0, 0)');
        await page.waitForTimeout(700); // 注視点終了 + 刺激表示開始（計1200ms）
        // 問題表示中はマーカーが白（□）であることを確認
        expect(await getMarkerColor(page)).toBe('rgb(255, 255, 255)');
        await page.keyboard.press('2');
        // 回答後■黒になるがpost_trial_gap=0のため次の注視点■黒へ即移行するため非検証
        await page.waitForTimeout(300);
    }
}

// ---- タスク2個の組み合わせをテスト ----
const TASK_PAIRS = [[1, 2], [3, 4]];

for (const taskList of TASK_PAIRS) {
    test(`task=${taskList.join(',')} 動作・CSV検証`, async ({ page }) => {
        const url = `${BASE_URL}?task=${taskList.join(',')}&trials=${TRIAL_COUNT}&practice=${PRACTICE_COUNT}`;
        console.log(`\n=== task=${taskList.join(',')} 開始 ===`);
        console.log('URL:', url);

        await page.goto(url);
        await page.waitForTimeout(500);

        // ---- フォーム ----
        await expect(page.getByText('性別と年齢を回答して')).toBeVisible();
        await page.locator('input[name="gender"][value="1"]').click();
        await page.locator('select[name="age"]').selectOption('25');
        await page.getByRole('button', { name: '次へ' }).click();
        await page.waitForTimeout(300);

        // ---- 各タスクを順に実行 ----
        for (let ti = 0; ti < taskList.length; ti++) {
            await runTask(page, taskList[ti], ti === 0);
        }

        // ---- 終了メッセージ & CSVダウンロード ----
        await expect(page.getByText('すべての試行に回答しました')).toBeVisible();
        expect(await isMarkerHidden(page)).toBe(true); // 終了メッセージ画面ではマーカー非表示
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: '次へ' }).click();
        const download = await downloadPromise;
        const csvPath = await download.path();
        const csvContent = fs.readFileSync(csvPath, 'utf-8');

        // ---- CSV 検証 ----
        console.log('\n--- CSV 検証 ---');
        const rows = parseCSV(csvContent);

        // 試行行だけ抜き出す（honshikoが設定されている html-keyboard-response）
        const trialRows = rows.filter(r =>
            r.trial_type === 'html-keyboard-response' &&
            r.honshiko !== '' && r.strID !== ''
        );

        // タスクごとに集計
        for (const taskNum of taskList) {
            const taskRows = trialRows.filter(r => r.task === String(taskNum));
            const practiceRows = taskRows.filter(r => r.honshiko === '0');
            const mainRows    = taskRows.filter(r => r.honshiko === '1');

            console.log(`task=${taskNum}: 練習=${practiceRows.length}行(期待値:${PRACTICE_COUNT}) 本番=${mainRows.length}行(期待値:${TRIAL_COUNT})`);
            expect(practiceRows.length).toBe(PRACTICE_COUNT);
            expect(mainRows.length).toBe(TRIAL_COUNT);

            // seikai の検証
            let seikaiErrors = 0;
            for (const r of taskRows) {
                const kaito  = parseInt(r.kaito);
                const strID  = parseInt(r.strID);
                const colID  = parseInt(r.colID);
                const seikai = parseInt(r.seikai);
                const expected = (taskNum === 1 || taskNum === 2)
                    ? (kaito === strID ? 1 : 0)
                    : (kaito === colID ? 1 : 0);
                if (seikai !== expected) seikaiErrors++;
                expect(seikai).toBe(expected);
            }

            // 各行の内容をコンソール出力
            console.log(`  練習試行:`);
            for (const r of practiceRows) {
                console.log(`    strID=${r.strID} colID=${r.colID} kaito=${r.kaito} seikai=${r.seikai} rt=${r.rt}ms`);
            }
            console.log(`  本試行:`);
            for (const r of mainRows) {
                console.log(`    strID=${r.strID} colID=${r.colID} kaito=${r.kaito} seikai=${r.seikai} rt=${r.rt}ms`);
            }
            console.log(`  seikaiエラー: ${seikaiErrors} 件`);
        }

        console.log(`✓ task=${taskList.join(',')} 検証完了`);

        // スクリーンショット（終了画面）
        await page.screenshot({ path: `screenshot_task${taskList.join('-')}_end.png` });
    });
}
