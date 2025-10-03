var Emitter = require('./emitter.js');
var MessageFilter = require('./message-filter.js');
var Util = require('./util.js');
var Modem = require('./acoustic-modem.js');


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
  // Start acoustic listening (microphone) so other devices can be heard.
  Modem.startListening(function(obj) {
    try {
      this.onMessage_(obj);
    } catch (e) {
      this.emit_('error', NearbyManager.Error.INVALID_JSON);
    }
  }.bind(this), {}, function(err) {
    if (err) Util.log('Modem listen failed: ' + err);
  }.bind(this));

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
  // Play an audible tone sequence (WebAudio) to emulate the original Nearby
  // audio broadcast. After the audio finishes, emit 'sent'. This gives a
  // user-visible confirmation when the extension is activated.
  this.playToneSequence(AUDIBLE_DURATION_MS, function(err) {
    if (err) {
      console.warn('Audio playback failed in background, attempting page fallback', err);
      // Try to play audio inside the active tab as a fallback (more likely to
      // have audio permission/autoplay allowance since user interacted with the
      // extension while on that tab).
      if (tab && tab.id) {
        this.playToneInPage(tab.id, AUDIBLE_DURATION_MS, function(pageErr) {
          if (pageErr) {
            console.warn('Page playback fallback failed', pageErr);
            this.emit_('error', NearbyManager.Error.PUBLISH_FAILED);
            return;
          }
          this.isLastPublishSuccessful_ = true;
          this.emit_('sent', this.isLastPublishSuccessful_);
        }.bind(this));
      } else {
        this.emit_('error', NearbyManager.Error.PUBLISH_FAILED);
      }
      return;
    }
    this.isLastPublishSuccessful_ = true;
    this.emit_('sent', this.isLastPublishSuccessful_);
  }.bind(this));
};


/**
 * Try to play the same tone sequence inside the page (content script context)
 * by injecting a small script via chrome.tabs.executeScript.
 */
NearbyManager.prototype.playToneInPage = function(tabId, durationMs, callback) {
  var code = '(function() {' +
    'try{var AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx){throw Error("no AudioCtx");}var ctx=new AudioCtx();if(ctx.state==="suspended"&&ctx.resume)ctx.resume();var gain=ctx.createGain();gain.gain.value=0.2;gain.connect(ctx.destination);var freqs=[1000,1400,1800];var now=ctx.currentTime;var per=(' + durationMs + '/1000)/freqs.length;freqs.forEach(function(freq,i){var osc=ctx.createOscillator();osc.type="sine";osc.frequency.value=freq;osc.connect(gain);var start=now+i*per;var stop=start+per*0.9;osc.start(start);osc.stop(stop);});setTimeout(function(){try{gain.disconnect();}catch(e){}},' + (durationMs+100) + ');return true;}catch(e){return {err:e+""};}})();';

  try {
    chrome.tabs.executeScript(tabId, {code: code}, function(results) {
      if (chrome.runtime.lastError) {
        callback(new Error(chrome.runtime.lastError.message));
        return;
      }
      // results may contain return value; treat success if no error
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
