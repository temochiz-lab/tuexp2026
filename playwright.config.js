// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    use: {
        headless: false,
        launchOptions: {
            headless: false,
        },
    },
    timeout: 30000,
});
