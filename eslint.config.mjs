import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: [
            '.venv/**', // a synced virtualenv ships plenty of its own JS
            'src/data_grid/static/**',
            'dist/**',
            'dist-demo/**',
            'playwright-report/**',
            'test-results/**',
        ],
    },
    js.configs.recommended,
    {
        files: ['js/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.browser,
        },
        rules: {
            indent: ['error', 4, { SwitchCase: 1 }],
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
    {
        files: ['test/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.node,
        },
        rules: {
            indent: ['error', 4],
        },
    },
    {
        // Specs run in node, but their page.evaluate callbacks run in the browser.
        files: ['e2e/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node, ...globals.browser },
        },
        rules: {
            indent: ['error', 4],
        },
    },
    {
        files: ['*.config.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.node,
        },
    },
];
