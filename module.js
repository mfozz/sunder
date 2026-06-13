import * as settings from './settings.js';
import * as hooks from './hooks.js';
import * as runtime from './sunder-runtime.js';

Hooks.once('init', () => {
    settings.registerSettings();
    runtime.registerRuntime();
    hooks.registerHooks();
});
