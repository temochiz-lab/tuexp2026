const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    await page.goto('http://localhost:8765/index.html');
    await page.waitForTimeout(2000);

    // マーカーの状態を確認
    const markerInfo = await page.evaluate(() => {
        const el = document.getElementById('bw-marker');
        if (!el) return { found: false };
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
            found: true,
            backgroundColor: style.backgroundColor,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            zIndex: style.zIndex,
            position: style.position,
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            inDOM: document.body.contains(el),
        };
    });

    console.log('マーカー状態:', JSON.stringify(markerInfo, null, 2));

    // ページ全体の z-index が高い要素を確認
    const topElements = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('*'))
            .map(el => {
                const s = window.getComputedStyle(el);
                return { tag: el.tagName, id: el.id, class: el.className, zIndex: s.zIndex, position: s.position };
            })
            .filter(e => e.zIndex !== 'auto' && e.zIndex !== '' && parseInt(e.zIndex) > 0)
            .sort((a, b) => parseInt(b.zIndex) - parseInt(a.zIndex))
            .slice(0, 10);
    });
    console.log('z-index が高い要素:', JSON.stringify(topElements, null, 2));

    await page.screenshot({ path: '/tmp/marker_test.png' });
    console.log('スクリーンショット: /tmp/marker_test.png');

    await browser.close();
})();
