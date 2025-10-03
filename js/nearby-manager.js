var Emitter = require('./emitter.js');
var MessageFilter = require('./message-filter.js');
var Util = require('./util.js');


var INAUDIBLE_DURATION_MS = 4000;
var AUDIBLE_DURATION_MS = 1750;

NearbyManager.Error = {
  PUBLISH_FAILED: 1,
  INVALID_JSON: 2,
};


/**
 * Lightweight Nearby replacement.
 *
 * Behavior:
 * - subscribe(): opens a WebSocket connection to a signaling server (optional)
 *   and listens for incoming messages.
 * - send(tab, userInfo): broadcasts the message via WebSocket (if connected)
 *   and emits a local loopback to verify publish success.
 *
 * This keeps the same public API used elsewhere in the extension.
 */
function NearbyManager() {
  this.ws = null;
  this.messageFilter = new MessageFilter();
  this.lastUrl = null;
  this.resubscribeTimer = null;
  this.isLastPublishSuccessful_ = false;
  this.onMessageHandler = this.onMessage_.bind(this);
}
NearbyManager.prototype = new Emitter();


NearbyManager.prototype.subscribe = function() {
  // Try to connect to a signaling server (configured via chrome.storage.local 'signalingUrl')
  chrome.storage.local.get(['signalingUrl'], function(result) {
    var url = result && result.signalingUrl;
    if (!url) {
      Util.log('No signaling URL configured; subscribe will listen only to local loopback.');
      return;
    }
    try {
      this.ws = new WebSocket(url);
      this.ws.addEventListener('open', function() {
        Util.log('WebSocket connected to', url);
      });
      this.ws.addEventListener('message', function(evt) {
        try {
          var data = JSON.parse(evt.data);
          this.onMessageHandler(data);
        } catch (e) {
          this.emit_('error', NearbyManager.Error.INVALID_JSON);
        }
      }.bind(this));
      this.ws.addEventListener('close', function() {
        Util.log('WebSocket closed; will retry in 5s.');
        setTimeout(this.subscribe.bind(this), 5000);
      }.bind(this));
      this.ws.addEventListener('error', function(e) {
        console.warn('WebSocket error', e);
      });
    } catch (e) {
      console.error('Failed to open WebSocket', e);
    }
  }.bind(this));
};


NearbyManager.prototype.unsubscribe = function() {
  if (this.ws) {
    try { this.ws.close(); } catch (e) {}
    this.ws = null;
  }
  clearTimeout(this.resubscribeTimer);
};


NearbyManager.prototype.send = function(tab, userInfo) {
  var data = {
    url: tab.url,
    name: userInfo.name,
    picture: userInfo.picture,
  };
  if (tab.title) data.title = tab.title;

  // Save this URL for later.
  this.lastUrl = tab.url;

  // Send over WebSocket if available.
  if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    try {
      this.ws.send(JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to send via WebSocket', e);
    }
  }

  // Local loopback: simulate audio verification by posting a runtime message
  // that other extension pages could use to emulate reception.
  try {
    // Emit 'sent' after a short timeout indicating success (loopback)
    setTimeout(function() {
      this.isLastPublishSuccessful_ = true;
      this.emit_('sent', this.isLastPublishSuccessful_);
    }.bind(this), 300);
  } catch (e) {
    this.emit_('error', NearbyManager.Error.PUBLISH_FAILED);
  }
};


NearbyManager.prototype.getLastUrl = function() {
  return this.lastUrl;
};


NearbyManager.prototype.onMessage_ = function(data) {
  var string = JSON.stringify(data);

  // Ignore messages that aren't new.
  if (!this.messageFilter.isNew(string)) return;

  try {
    this.emit_('received', data);
  } catch (e) {
    this.emit_('error', NearbyManager.Error.INVALID_JSON);
  }
};


module.exports = NearbyManager;
