(function (window, document) {
  'use strict';

  var PIXEL_ID = '1452913843369062';
  var PURCHASE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  if (!window.fbq) {
    var fbq = function () {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
      else fbq.queue.push(arguments);
    };
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    var firstScript = document.getElementsByTagName('script')[0];
    firstScript.parentNode.insertBefore(script, firstScript);
  }

  window.fbq('init', PIXEL_ID);

  function track(eventName, parameters) {
    if (!eventName) return false;
    window.fbq('track', eventName, parameters || {});
    return true;
  }

  function stored(key) {
    try {
      return window.localStorage.getItem(key) === '1';
    } catch (_) {
      return false;
    }
  }

  function remember(key) {
    try {
      window.localStorage.setItem(key, '1');
    } catch (_) {
      // La medición nunca debe impedir el uso de XelerIA.
    }
  }

  function trackOnce(key, eventName, parameters) {
    var storageKey = 'xeleria_meta_' + String(key || '').replace(/[^a-zA-Z0-9:_-]/g, '_');
    if (stored(storageKey)) return false;
    if (!track(eventName, parameters)) return false;
    remember(storageKey);
    return true;
  }

  function trackApprovedSubscription(data) {
    var subscription = data && data.subscription ? data.subscription : {};
    var provider = subscription.payment || {};
    var approvedAtText = String(provider.last_payment_approved_at || '').trim();
    var approvedAt = Date.parse(approvedAtText);
    var age = Date.now() - approvedAt;
    var status = String(provider.last_payment_status || '').trim().toLowerCase();
    var amount = Number(data && data.payment ? data.payment.amount : 0);
    if (status !== 'approved' || !Number.isFinite(approvedAt) || age < -300000 || age > PURCHASE_MAX_AGE_MS || !(amount > 0)) {
      return false;
    }
    // La referencia usa solo el instante de acreditacion: no se envia el ID interno del cliente a Meta.
    var transactionId = 'xeleria:' + approvedAtText;
    return trackOnce('purchase:' + transactionId, 'Purchase', {
      value: amount,
      currency: String((data.payment && data.payment.currency_id) || 'ARS'),
      transaction_id: transactionId,
      content_name: String((data.payment && data.payment.plan_name) || 'Suscripción XelerIA')
    });
  }

  window.XelerIAMetaPixel = {
    track: track,
    trackOnce: trackOnce,
    trackApprovedSubscription: trackApprovedSubscription
  };

  if (!/\/admin_erp\.html$/i.test(window.location.pathname)) {
    track('PageView');
  }
})(window, document);
