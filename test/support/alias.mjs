// node --import ./test/support/alias.mjs registers the "~/" resolver for tests.
import { register } from 'node:module';
register('./alias-hooks.mjs', import.meta.url);
