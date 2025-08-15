import * as settings from './settings.js';
import * as hooks from './hooks.js';

Hooks.once('init', () => {
    settings.registerSettings();
    hooks.registerHooks();
});