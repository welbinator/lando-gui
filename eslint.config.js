import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      'no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'no-console': 'off',
      'no-undef': 'error',
      'no-unreachable': 'error',
      'require-await': 'warn',
      'no-async-promise-executor': 'error',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'eqeqeq': ['warn', 'always'],
      'curly': ['warn', 'all'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-return-await': 'warn'
    },
    ignores: ['node_modules/**', 'public/**', '*.test.js', 'jest.config.js']
  }
];
