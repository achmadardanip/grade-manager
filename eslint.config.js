// Basic ESLint configuration for Expo projects. We deliberately avoid
// importing modules such as `eslint/config` or `eslint-config-expo/flat`
// because they may not be installed in all environments. Instead we
// extend the core Expo ESLint configuration directly. You can customise
// this configuration further based on your needs.
module.exports = {
  extends: ['expo'],
  ignorePatterns: ['dist/*'],
};
