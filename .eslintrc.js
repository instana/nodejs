module.exports = {

  extends: 'airbnb/legacy',

  env: {
    node: true
  },

  parserOptions: {
    sourceType: 'strict',
  },

  plugins: [
    'mocha'
  ],

  rules:  {
    'arrow-parens': [2, 'always'],
    'block-scoped-var': 0,
    'comma-dangle': 0,
    'consistent-return': 0,
    eqeqeq: [2, 'allow-null'],
    'func-names': 0,
    'global-require': 0,
    'id-length': 0,
    indent: 0,
    'max-len': [2, 120, 2],
    'mocha/no-exclusive-tests': 2,
    'new-cap': 0,
    'newline-per-chained-call': 0,
    'no-console': 2,
    'no-else-return': 0,
    'no-mixed-operators': 0,
    'no-multi-assign': 0,
    'no-multiple-empty-lines': 0,
    'no-param-reassign': 0,
    'no-plusplus': 0,
    'no-restricted-globals': 0,
    'no-underscore-dangle': 0,
    'no-unused-expressions': 0,
    'no-use-before-define':  [2, 'nofunc'],
    'object-curly-spacing': 0,
    'operator-linebreak': 0,
    'prefer-arrow-callback': 0,
    'space-before-function-paren': 0,
    'strict': [2, 'global'],
    'vars-on-top': 0,
    'wrap-iife': 0,
    yoda: 0
  }
};
