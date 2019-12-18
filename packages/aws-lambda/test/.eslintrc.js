module.exports = {
  extends: '../.eslintrc.js',

  rules: {
    'func-names': 'off',
    'no-unused-expressions': 'off',
    // some dependencies come from the root package.json
    'import/no-extraneous-dependencies': 'off'
  }
};
