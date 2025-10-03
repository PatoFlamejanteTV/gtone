// Shim to create global identifiers expected by legacy bundles when
// running inside a service worker. This uses globalThis and a Function
// fallback to try to create undeclared globals if possible.
(function(){
  try {
    // Ensure objects exist on the global object
    globalThis.google = globalThis.google || {};
    globalThis.analytics = globalThis.analytics || {};

    // Try to create unbound globals so scripts that reference 'google'
    // or 'analytics' without qualifying with globalThis won't throw.
    try {
      // This may throw in strict mode, so guard it.
      Function('google = globalThis.google')();
    } catch (e) {
      // ignore
    }
    try {
      Function('analytics = globalThis.analytics')();
    } catch (e) {
      // ignore
    }

    // Add a few minimal properties expected by the legacy bundle to avoid
    // common ReferenceErrors. Keep implementations no-op. Install them on
    // both globalThis and window (when present) so the shim works in the
    // offscreen DOM page and in worker contexts.
    var g = globalThis;
    var w = (typeof window !== 'undefined') ? window : null;
    if (!g.google) g.google = {};
    if (w && !w.google) w.google = g.google;
    g.google.nearby = g.google.nearby || { messages: {} };
    if (w && !w.google.nearby) w.google.nearby = g.google.nearby;
    if (!g.google.nearby.messages.Client) {
      g.google.nearby.messages.Client = function() { this.subscribe = function(){}; this.unsubscribe = function(){}; this.publish = function(){}; };
    }

    // analytics minimal shape — install on both globalThis and window.
    g.analytics = g.analytics || {};
    if (w && !w.analytics) w.analytics = g.analytics;
    if (!g.analytics.getService) {
      g.analytics.getService = function() { return { getTracker: function(){ return { send: function(){} }; } }; };
    }
    // Minimal Parameters/HitTypes/EventBuilder used by some legacy code.
    g.analytics.Parameters = g.analytics.Parameters || { EVENT_CATEGORY: 'ec', EVENT_ACTION: 'ea' };
    g.analytics.HitTypes = g.analytics.HitTypes || { EVENT: 'event' };
    g.analytics.EventBuilder = g.analytics.EventBuilder || {
      builder: function() {
        var obj = {};
        obj[g.analytics.Parameters.EVENT_CATEGORY] = null;
        obj[g.analytics.Parameters.EVENT_ACTION] = null;
        obj.category = function(v) { obj[g.analytics.Parameters.EVENT_CATEGORY] = v; return obj; };
        obj.action = function(v) { obj[g.analytics.Parameters.EVENT_ACTION] = v; return obj; };
        obj.get = function(k) { return obj[k]; };
        return obj;
      }
    };

    // Safe accessor for param-like objects used by the bundle.
    g.analytics.safeGetParam = function(params, key) {
      try {
        if (!params) return undefined;
        if (typeof params.get === 'function') return params.get(key);
        return params[key] || undefined;
      } catch (e) {
        return undefined;
      }
    };
    if (w) w.analytics = g.analytics;
    try { console.log('sw-legacy-shim installed: google/analytics present'); } catch (e) {}
  } catch (e) {
    // If anything fails just swallow - this shim is best-effort.
    try { console.warn('sw-legacy-shim failed', e); } catch (ee) {}
  }
})();
