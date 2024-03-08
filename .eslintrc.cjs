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

	plugins: ['n'],

	rules: {
		'n/no-process-env': 'error'
	},

	// Base config
	extends: ['eslint:recommended', 'plugin:prettier/recommended'],
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
