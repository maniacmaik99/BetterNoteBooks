import module from 'node:module';

if (typeof module.registerHooks === 'function') {
	module.registerHooks('./loader.mjs', import.meta.url);
} else if (typeof module.register === 'function') {
	module.register('./loader.mjs', import.meta.url);
}
