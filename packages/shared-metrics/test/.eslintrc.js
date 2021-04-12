module.exports = {
  extends: '../../../.eslintrc.js',

  env: {
    mocha: true
  },

  rules: {
    'object-curly-newline': 'off',
    'monorepo-cop/no-relative-import-outside-package': 'off'
  }
};
