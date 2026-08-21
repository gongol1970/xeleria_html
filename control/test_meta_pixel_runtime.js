'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'meta-pixel.js'), 'utf8');
const stored = new Map();
const insertedScripts = [];
const firstScript = { parentNode: { insertBefore: script => insertedScripts.push(script.src) } };
const document = {
  createElement: () => ({}),
  getElementsByTagName: () => [firstScript]
};
const window = {
  document,
  location: { pathname: '/inicio.html' },
  localStorage: {
    getItem: key => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, value)
  }
};
const context = vm.createContext({ window, document, Date, Number, String });
vm.runInContext(source, context, { filename: 'meta-pixel.js' });

assert.equal(insertedScripts[0], 'https://connect.facebook.net/en_US/fbevents.js');
assert.equal(window.fbq.queue[0][0], 'init');
assert.equal(window.fbq.queue[1][0], 'track');
assert.equal(window.fbq.queue[1][1], 'PageView');

const approvedAt = new Date(Date.now() - 60_000).toISOString();
const payload = {
  tenant_id: 'tenant-test',
  subscription: { payment: { last_payment_status: 'approved', last_payment_approved_at: approvedAt } },
  payment: { amount: 42350, currency_id: 'ARS', plan_name: 'Profesional' }
};
assert.equal(window.XelerIAMetaPixel.trackApprovedSubscription(payload), true);
assert.equal(window.XelerIAMetaPixel.trackApprovedSubscription(payload), false);

const purchases = window.fbq.queue.filter(args => args[0] === 'track' && args[1] === 'Purchase');
assert.equal(purchases.length, 1);
assert.equal(purchases[0][2].value, 42350);
assert.equal(purchases[0][2].currency, 'ARS');
assert.equal(purchases[0][2].transaction_id, 'xeleria:' + approvedAt);
assert.equal(purchases[0][2].transaction_id.includes('tenant-test'), false);

const rejected = JSON.parse(JSON.stringify(payload));
rejected.subscription.payment.last_payment_status = 'rejected';
rejected.subscription.payment.last_payment_approved_at = new Date().toISOString();
assert.equal(window.XelerIAMetaPixel.trackApprovedSubscription(rejected), false);

const old = JSON.parse(JSON.stringify(payload));
old.subscription.payment.last_payment_approved_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
assert.equal(window.XelerIAMetaPixel.trackApprovedSubscription(old), false);

console.log('Meta Pixel runtime contract passed');
