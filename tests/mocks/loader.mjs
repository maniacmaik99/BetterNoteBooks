export async function resolve(specifier, context, nextResolve) {
	if (specifier === 'obsidian') {
		return {
			format: 'module',
			shortCircuit: true,
			url: new URL('./obsidian-mock.mjs', import.meta.url).href,
		};
	}
	return nextResolve(specifier, context);
}
