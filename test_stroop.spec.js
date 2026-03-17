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

// ---- タスク 1〜4 を順にテスト ----
for (const taskNum of [1, 2, 3, 4]) {
    test(`task=${taskNum} 動作・CSV検証`, async ({ page }) => {
        const url = `${BASE_URL}?task=${taskNum}&trial_count=${TRIAL_COUNT}&practice_trial_count=${PRACTICE_COUNT}`;
        console.log(`\n=== task=${taskNum} 開始 ===`);
        console.log('URL:', url);

        await page.goto(url);
        await page.waitForTimeout(500);

        // ---- フォーム ----
        await expect(page.getByText('性別と年齢を回答して')).toBeVisible();
        await page.locator('input[name="gender"][value="1"]').click();
        await page.locator('select[name="age"]').selectOption('25');
        await page.getByRole('button', { name: '次へ' }).click();
        await page.waitForTimeout(300);

        // ---- 教示 ----
        await expect(page.getByText('練習試行を始めます')).toBeVisible();
        await page.getByRole('button', { name: '次へ' }).click();
        await page.waitForTimeout(300);

        // ---- 練習試行 ----
        console.log(`練習試行 ${PRACTICE_COUNT} 回...`);
        for (let i = 0; i < PRACTICE_COUNT; i++) {
            await page.waitForTimeout(1200); // 注視点（1秒）
            // マーカーが黒になっているか確認
            const markerCol = await page.evaluate(() => {
                const el = Array.from(document.querySelectorAll('div'))
                    .find(d => d.style.zIndex === '2147483647');
                return el ? window.getComputedStyle(el).backgroundColor : null;
            });
            expect(markerCol).toBe('rgb(0, 0, 0)');
            await page.keyboard.press('1'); // キー1で回答
            await page.waitForTimeout(300);
            await page.keyboard.press(' '); // フィードバック → 次へ
            await page.waitForTimeout(300);
        }

        // ---- 本試行開始メッセージ ----
        await expect(page.getByText('本試行を始めます')).toBeVisible();
        await page.getByRole('button', { name: '次へ' }).click();
        await page.waitForTimeout(300);

        // ---- 本試行 ----
        console.log(`本試行 ${TRIAL_COUNT} 回...`);
        for (let i = 0; i < TRIAL_COUNT; i++) {
            await page.waitForTimeout(1200); // 注視点（1秒）
            const markerCol = await page.evaluate(() => {
                const el = Array.from(document.querySelectorAll('div'))
                    .find(d => d.style.zIndex === '2147483647');
                return el ? window.getComputedStyle(el).backgroundColor : null;
            });
            expect(markerCol).toBe('rgb(0, 0, 0)');
            await page.keyboard.press('2'); // キー2で回答
            await page.waitForTimeout(300);
        }

        // ---- 終了メッセージ & CSVダウンロード ----
        await expect(page.getByText('すべての試行に回答しました')).toBeVisible();
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
        const practiceRows = trialRows.filter(r => r.honshiko === '0');
        const mainRows    = trialRows.filter(r => r.honshiko === '1');

        console.log(`練習試行行数: ${practiceRows.length} (期待値: ${PRACTICE_COUNT})`);
        console.log(`本番試行行数: ${mainRows.length} (期待値: ${TRIAL_COUNT})`);
        expect(practiceRows.length).toBe(PRACTICE_COUNT);
        expect(mainRows.length).toBe(TRIAL_COUNT);

        // task フィールド確認
        for (const r of trialRows) {
            expect(r.task).toBe(String(taskNum));
        }

        // seikai の検証
        // task 3/4: 正解 = strID、task 1/2: 正解 = colID
        let seikaiErrors = 0;
        for (const r of trialRows) {
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
        console.log('\n練習試行:');
        for (const r of practiceRows) {
            console.log(`  strID=${r.strID} colID=${r.colID} kaito=${r.kaito} seikai=${r.seikai} rt=${r.rt}ms`);
        }
        console.log('本試行:');
        for (const r of mainRows) {
            console.log(`  strID=${r.strID} colID=${r.colID} kaito=${r.kaito} seikai=${r.seikai} rt=${r.rt}ms`);
        }
        console.log(`seikaiエラー: ${seikaiErrors} 件`);
        console.log(`✓ task=${taskNum} 検証完了`);

        // スクリーンショット（終了画面）
        await page.screenshot({ path: `screenshot_task${taskNum}_end.png` });
    });
}
