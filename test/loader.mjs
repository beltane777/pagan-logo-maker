/**
 * @file test/loader.mjs
 * @description Registers {@link ./loader-hook.mjs} with Node's module loader.
 * Use as `node --import ./test/loader.mjs <test-file>`.
 */
import { register } from 'node:module';

register('./loader-hook.mjs', import.meta.url);
