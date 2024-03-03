/** @type {import('eslint').Linter.Config} */
module.exports = {
	root: true,

	parserOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module',
	},

	env: {
		commonjs: true,
		es6: true,
	},

	// Base config
	extends: ['eslint:recommended', 'plugin:prettier/recommended'],
	overrides: [
		// Typescript
		{
			files: ['**/*.ts'],
			plugins: ['@typescript-eslint', 'import'],
			parser: '@typescript-eslint/parser',
			settings: {
				'import/internal-regex': '^~/',
				'import/resolver': {
					node: {
						extensions: ['.ts', '.tsx']
					},
					typescript: {
						alwaysTryTypes: true
					}
				}
			},
			extends: [
				'plugin:@typescript-eslint/recommended',
				'plugin:import/recommended',
				'plugin:import/typescript'
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

}
