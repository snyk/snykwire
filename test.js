import test from 'ava';
import snykwire from '.';

function tryForAll(t, mod) {
  try {
    snykwire(mod, { blacklist: ['fs'], whitelist: ['fs'] });
    t.fail('Should have thrown');
  } catch (e) {
    t.pass('Bad invocation');
  }

  try {
    snykwire(mod, { blacklist: ['fs'], bare: true });
    t.fail('Should have thrown');
  } catch (e) {
    t.pass('Bad invocation');
  }

  try {
    snykwire(mod, { blacklist: ['fs'] });
    t.fail('Should have thrown');
  } catch (e) {
    t.pass('Failed to require fs');
  }

  try {
    snykwire(mod, { whitelist: ['net'] });
    t.fail('Should have thrown');
  } catch (e) {
    t.pass('Failed to require fs');
  }

  try {
    snykwire(mod, { bare: true });
    t.fail('Should have thrown');
  } catch (e) {
    t.pass('Failed to require fs');
  }

  snykwire('./fixtures/okay');
  t.pass('Unprotected files can still require fs');
}

test('Simple get', t => tryForAll(t, './fixtures/simple-get'));

test('Cache corruption', t => tryForAll(t, './fixtures/corrupt-cache'));

test('Cache query', t => tryForAll(t, './fixtures/cache-query'));

test('Freeze cache', t => tryForAll(t, './fixtures/freezer.js'));
