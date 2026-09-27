import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['src/data_grid/static/**', 'dist/**'] },
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
        files: ['*.config.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.node,
        },
    },
];
