module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },

  overrides: [
    {
      files: ['*.js'],
      extends: [
        'eslint:recommended',
      ],
    },
    {
      files: ['*.ts'],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
      },
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
      ],
      'plugins': [
        '@typescript-eslint',
      ],
    }
  ],
  rules: {},
};
