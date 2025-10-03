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
  this.debug = true;
}
NearbyManager.prototype = new Emitter();


NearbyManager.prototype.subscribe = function() {
  // Note: acoustic receiving is handled by `pages/mic-listener.html` which
  // runs in a normal page context and can getUserMedia. Users should open
  // that page to allow microphone listening. Background/service worker cannot
  // access the mic reliably.
  Util.log('Subscribe: to receive acoustically open pages/mic-listener.html to grant mic access.');

  // Try to connect to a signaling server (configured via chrome.storage.local 'signalingUrl')
  chrome.storage.local.get(['signalingUrl'], function(result) {
    var url = result && result.signalingUrl;
    if (!url) {
      Util.log('No signaling URL configured; subscribe will listen only to local loopback.');
      return;
    }
    try {
      this.ws = new WebSocket(url);
      var self = this;
      this.ws.addEventListener('open', function() {
        Util.log('WebSocket connected to', url, 'clients=', self.ws && self.ws.readyState ? 'open' : 'closed');
      });
      this.ws.addEventListener('message', function(evt) {
        try {
          if (self.debug) Util.log('WebSocket received', evt.data && evt.data.length, 'bytes');
          var data = JSON.parse(evt.data);
          self.onMessageHandler(data);
        } catch (e) {
          self.emit_('error', NearbyManager.Error.INVALID_JSON);
        }
      });
      this.ws.addEventListener('close', function() {
        Util.log('WebSocket closed; will retry in 5s.');
        setTimeout(self.subscribe.bind(self), 5000);
      });
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
  // Transmit acoustically by injecting a transmitter into the active tab
  // (MV3-compatible via chrome.scripting.executeScript). The injected
  // function will schedule oscillators to send a simple FSK sequence.
  var payload = JSON.stringify(data);
  try {
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: function(payloadStr, durationMs) {
        try {
          var AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) throw Error('no AudioCtx');
          var ctx = new AudioCtx();
          // Modern browsers often require a user gesture to start audio; try resume.
          if (ctx.state === 'suspended' && ctx.resume) {
            try { ctx.resume(); } catch (e) { /* ignore */ }
          }
          var gain = ctx.createGain(); gain.gain.value = 0.25; gain.connect(ctx.destination);

          // encode payload to base64 and then bytes
          function s2b64(s){return btoa(unescape(encodeURIComponent(s)));}
          var b64 = s2b64(payloadStr);
          var bytes = [];
          for (var i=0;i<b64.length;i++) bytes.push(b64.charCodeAt(i));

          var FREQ0 = 1500; var FREQ1 = 2200; var symbolSec = (durationMs/1000) / Math.max(8, bytes.length*8); // adapt symbol rate
          var now = ctx.currentTime + 0.05;
          var t = now;
          // small preamble
          for (var k=0;k<6;k++){
            var osc = ctx.createOscillator(); osc.type='sine'; osc.frequency.value = (k%2?FREQ1:FREQ0); osc.connect(gain); osc.start(t); osc.stop(t+symbolSec*0.9); t += symbolSec; }
          // send bytes LSB-first
          bytes.forEach(function(byte){ for (var b=0;b<8;b++){ var bit = (byte>>b)&1; var osc = ctx.createOscillator(); osc.type='sine'; osc.frequency.value = bit?FREQ1:FREQ0; osc.connect(gain); osc.start(t); osc.stop(t+symbolSec*0.9); t += symbolSec; }});
          setTimeout(function(){ try{ gain.disconnect(); }catch(e){} }, (t - ctx.currentTime)*1000 + 50);
          return {ok:true, bytes: bytes.length};
        } catch (e) { return {err: ''+e}; }
      },
      args: [payload, AUDIBLE_DURATION_MS]
    }, function(results) {
      if (chrome.runtime.lastError) {
        console.warn('Acoustic injection failed', chrome.runtime.lastError.message);
        this.emit_('error', NearbyManager.Error.PUBLISH_FAILED);
        return;
      }
      // results is an array of injection results from the tabs; inspect
      if (results && results[0] && results[0].result && results[0].result.err) {
        console.warn('Acoustic injection returned error', results[0].result.err);
        this.emit_('error', NearbyManager.Error.PUBLISH_FAILED);
        return;
      }
      if (this.debug) console.log('Acoustic injection result', results && results[0] && results[0].result);
      this.isLastPublishSuccessful_ = true;
      this.emit_('sent', this.isLastPublishSuccessful_);
    }.bind(this));
  } catch (e) {
    console.warn('Acoustic transmit failed', e);
    this.emit_('error', NearbyManager.Error.PUBLISH_FAILED);
  }
};


/**
 * Try to play the same tone sequence inside the page (content script context)
 * by injecting a small script via chrome.tabs.executeScript.
 */
NearbyManager.prototype.playToneInPage = function(tabId, durationMs, callback) {
  var code = '(function() {' +
    'try{var AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx){throw Error("no AudioCtx");}var ctx=new AudioCtx();if(ctx.state==="suspended"&&ctx.resume)ctx.resume();var gain=ctx.createGain();gain.gain.value=0.2;gain.connect(ctx.destination);var freqs=[1000,1400,1800];var now=ctx.currentTime;var per=(' + durationMs + '/1000)/freqs.length;freqs.forEach(function(freq,i){var osc=ctx.createOscillator();osc.type="sine";osc.frequency.value=freq;osc.connect(gain);var start=now+i*per;var stop=start+per*0.9;osc.start(start);osc.stop(stop);});setTimeout(function(){try{gain.disconnect();}catch(e){}},' + (durationMs+100) + ');return true;}catch(e){return {err:e+""};}})();';

  try {
    // manifest v3 uses chrome.scripting.executeScript
    chrome.scripting.executeScript({
      target: {tabId: tabId},
      func: function(dur, freqs) {
        try{
          var AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) throw Error('no AudioCtx');
          var ctx = new AudioCtx(); if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
          var gain = ctx.createGain(); gain.gain.value = 0.2; gain.connect(ctx.destination);
          var now = ctx.currentTime; var per = (dur/1000)/freqs.length;
          freqs.forEach(function(freq,i){ var osc = ctx.createOscillator(); osc.type='sine'; osc.frequency.value = freq; osc.connect(gain); var start = now + i*per; var stop = start + per*0.9; osc.start(start); osc.stop(stop); });
          setTimeout(function(){ try{ gain.disconnect(); }catch(e){} }, dur+100);
          return true;
        }catch(e){ return {err: ''+e}; }
      },
      args: [durationMs, [1000,1400,1800]]
    }, function(results) {
      if (chrome.runtime.lastError) {
        callback(new Error(chrome.runtime.lastError.message));
        return;
      }
      callback(null);
    });
  } catch (e) {
    callback(e);
  }
};


/**
 * Play a short tone sequence (uses WebAudio). Calls callback(err) when done.
 */
NearbyManager.prototype.playToneSequence = function(durationMs, callback) {
  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    callback(new Error('AudioContext not supported'));
    return;
  }

  try {
    if (!this.audioCtx) this.audioCtx = new AudioCtx();
    var ctx = this.audioCtx;

    // If suspended, resume on user gesture.
    if (ctx.state === 'suspended' && ctx.resume) {
      ctx.resume().catch(function(){});
    }

    var gain = ctx.createGain();
    gain.gain.value = 0.2; // safe volume
    gain.connect(ctx.destination);

    // Simple two-tone sequence to be clearly audible.
    var freqs = [1000, 1400, 1800];
    var now = ctx.currentTime;
    var per = (durationMs / 1000) / freqs.length;
    var oscillators = [];

    freqs.forEach(function(freq, i) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      var start = now + i * per;
      var stop = start + per * 0.9;
      osc.start(start);
      osc.stop(stop);
      oscillators.push(osc);
    });

    // Callback after the last oscillator stops.
    var totalMs = Math.ceil(durationMs) + 50;
    setTimeout(function() {
      try {
        // disconnect oscillators and gain
        oscillators.forEach(function(o){ try { o.disconnect(); } catch(e) {} });
        try { gain.disconnect(); } catch(e) {}
      } catch(e) {}
      callback(null);
    }, totalMs);
  } catch (e) {
    callback(e);
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
