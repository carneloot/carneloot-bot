/** @type {import('eslint').Linter.Config} */
module.exports = {
	root: true,

	parserOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module'
	},

	env: {
		commonjs: true,
		es6: true
	},

	rules: {
		'n/no-process-env': 'error',
		'n/no-unpublished-import': 'off',
		'n/no-extraneous-import': 'off'
	},

	// Base config
	extends: ['eslint:recommended', 'plugin:prettier/recommended', 'plugin:n/recommended'],
	overrides: [
		// Typescript
		{
			files: ['**/*.ts'],
			plugins: ['@typescript-eslint'],
			parser: '@typescript-eslint/parser',
			extends: [
				'plugin:@typescript-eslint/recommended'
			]
		},

		// Node
		{
			files: ['.eslintrc.cjs'],
			env: {
				node: true
			}
		}
	]

};
