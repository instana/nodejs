module.exports = {
  extends: 'airbnb-base',

  env: {
    node: true
  },

  parserOptions: {
    sourceType: 'strict'
  },

  plugins: ['mocha'],

  rules: {
    'arrow-parens': 'off',
    'comma-dangle': 'off',
    eqeqeq: ['error', 'allow-null'],
    'func-names': 'error',
    'function-paren-newline': 'off',
    'global-require': 'off',
    'implicit-arrow-linebreak': 'off',
    'max-len': ['error', 120, 2],
    'mocha/no-exclusive-tests': 'error',
    'no-else-return': 'off',
    'no-console': 'error',
    'no-multi-assign': 'off',
    'no-param-reassign': 'off',
    'no-plusplus': 'off',
    'no-restricted-globals': 'off',
    'no-underscore-dangle': 'off',
    'no-use-before-define': ['error', 'nofunc'],
    'object-curly-newline': 'off',
    'operator-linebreak': 'off',
    'prefer-destructuring': 'off',
    'prefer-rest-params': 'off',
    'prefer-spread': 'off',
    'space-before-function-paren': 'off',
    strict: ['error', 'global']
  }
};
