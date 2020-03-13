module.exports = {
  extends: 'airbnb/legacy',

  env: {
    node: true
  },

  parserOptions: {
    sourceType: 'strict'
  },

  plugins: ['mocha'],

  rules: {
    'block-scoped-var': 'off',
    'class-methods-use-this': 'off',
    'comma-dangle': 'off',
    'consistent-return': 'off',
    eqeqeq: ['error', 'allow-null'],
    'func-names': 'off',
    'function-paren-newline': 'off',
    'global-require': 'off',
    'id-length': 'off',
    'implicit-arrow-linebreak': 'off',
    indent: 'off',
    'max-len': ['error', 120, 2],
    'mocha/no-exclusive-tests': 'error',
    'new-cap': 'off',
    'newline-per-chained-call': 'off',
    'no-console': 'error',
    'no-else-return': 'off',
    'no-labels': 'off',
    'no-mixed-operators': 'off',
    'no-multi-assign': 'off',
    'no-multiple-empty-lines': 'off',
    'no-param-reassign': 'off',
    'no-plusplus': 'off',
    'no-restricted-globals': 'off',
    'no-underscore-dangle': 'off',
    'no-unused-expressions': 'off',
    'no-use-before-define': ['error', 'nofunc'],
    'object-curly-spacing': 'off',
    'operator-linebreak': 'off',
    'prefer-arrow-callback': 'off',
    'space-before-function-paren': 'off',
    strict: ['error', 'global'],
    'vars-on-top': 'off',
    'wrap-iife': 'off',
    yoda: 'off'
  },

  globals: {
    Promise: true
  }
};
