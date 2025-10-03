/*
 * Simple acoustic modem (demo):
 * - FSK with two tones (f0/f1) representing 0/1
 * - Symbol duration configurable (default 70ms)
 * - Basic preamble detection and length-prefixed payload (base64 JSON)
 *
 * This is a lightweight demo implementation to allow nearby devices running
 * the same extension to hear and decode short payloads (a URL + metadata).
 * It's not robust to noise, multipath, or advanced synchronization; consider
 * using a dedicated acoustic library for production.
 */

var DEFAULT_SYMBOL_MS = 70;
// Use lower frequencies to be reliably played/recorded on modern devices.
// Very high ultrasonic tones may be filtered or poorly reproduced by mics/speakers.
var FREQ0 = 1500; // 0 bit frequency (Hz)
var FREQ1 = 2200; // 1 bit frequency (Hz)
var PREAMBLE_REPEATS = 6; // repeated 0xAA pattern

function stringToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToString(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

function buildBitArrayFromPayload(payloadB64) {
  // payload length (bytes) as 16-bit big-endian
  var len = payloadB64.length;
  var bits = [];
  // preamble: 0xAA pattern repeated
  for (var r = 0; r < PREAMBLE_REPEATS; r++) {
    var byte = 0xAA;
    for (var i = 0; i < 8; i++) bits.push((byte >> i) & 1);
  }
  // length
  bits.push.apply(bits, byteToBits((len >> 8) & 0xFF));
  bits.push.apply(bits, byteToBits(len & 0xFF));
  // payload bytes
  for (var j = 0; j < payloadB64.length; j++) {
    var code = payloadB64.charCodeAt(j);
    bits.push.apply(bits, byteToBits(code));
  }
  return bits;
}

function byteToBits(b) {
  var arr = [];
  for (var i = 0; i < 8; i++) arr.push((b >> i) & 1);
  return arr;
}

function bitsToBytes(bits) {
  var bytes = [];
  for (var i = 0; i + 7 < bits.length; i += 8) {
    var val = 0;
    for (var j = 0; j < 8; j++) val |= (bits[i + j] & 1) << j;
    bytes.push(val);
  }
  return bytes;
}

var Modem = function() {
  this.audioCtx = null;
  this.listening = false;
  this.stream = null;
  this.analyser = null;
  this.freqBin0 = null;
  this.freqBin1 = null;
  this.onmessage = null;
  this.symbolMs = DEFAULT_SYMBOL_MS;
  this.decodeInterval = null;
  this.sampleRate = 44100;
  this.fftSize = 2048;
  this.debug = false;
};

Modem.prototype.ensureAudioCtx = function() {
  if (!this.audioCtx) {
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      // fallback: many browsers require user gesture. Caller must handle.
      throw e;
    }
  }
  return this.audioCtx;
};

Modem.prototype.transmit = function(obj, opts, cb) {
  opts = opts || {};
  cb = cb || function(){};
  try {
    var ctx = this.ensureAudioCtx();
    var payloadJson = JSON.stringify(obj);
    var b64 = stringToBase64(payloadJson);
    var bits = buildBitArrayFromPayload(b64);
    var symbolSec = (opts.symbolMs || this.symbolMs) / 1000;
    var startTime = ctx.currentTime + 0.05;
    var t = startTime;
    // create gain node
    var gain = ctx.createGain();
    gain.gain.value = (opts.gain != null ? opts.gain : 0.25);
    gain.connect(ctx.destination);
    if (this.debug) console.log('Modem.transmit: bits=', bits.length, 'symbolSec=', symbolSec, 'freq0=', FREQ0, 'freq1=', FREQ1);
    // schedule oscillators per bit
    for (var i = 0; i < bits.length; i++) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = bits[i] ? FREQ1 : FREQ0;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + symbolSec * 0.95);
      // disconnect after stop
      (function(o){ setTimeout(function(){ try{ o.disconnect(); }catch(e){} }, (t - ctx.currentTime + symbolSec) * 1000 + 50); })(osc);
      t += symbolSec;
    }
    // finish callback after last symbol
    setTimeout(function(){ cb(null); }, (t - ctx.currentTime) * 1000 + 20);
  } catch (e) {
    cb(e);
  }
};

Modem.prototype.startListening = function(onMessage, opts, cb) {
  opts = opts || {};
  cb = cb || function(){};
  this.onmessage = onMessage;
  if (this.listening) return cb(null);
  var self = this;
  navigator.mediaDevices.getUserMedia({audio: true}).then(function(s) {
    self.stream = s;
    var ctx = self.ensureAudioCtx();
    self.analyser = ctx.createAnalyser();
    self.analyser.fftSize = self.fftSize;
    var source = ctx.createMediaStreamSource(s);
    source.connect(self.analyser);
    self.listening = true;
    self._startDecodeLoop();
    cb(null);
  }).catch(function(err) {
    cb(err);
  });
};

Modem.prototype.stopListening = function() {
  this.listening = false;
  if (this.decodeInterval) clearInterval(this.decodeInterval);
  if (this.stream) {
    this.stream.getTracks().forEach(function(t){ try{ t.stop(); } catch(e){} });
  }
  try { if (this.analyser) this.analyser.disconnect(); } catch(e) {}
  this.analyser = null;
};

// very simple detection: sample energy of f0 and f1 per symbol interval
Modem.prototype._startDecodeLoop = function() {
  var ctx = this.audioCtx;
  var analyser = this.analyser;
  var bufferLen = analyser.frequencyBinCount;
  var freqData = new Uint8Array(bufferLen);
  var binFreq = (ctx.sampleRate || this.sampleRate) / analyser.fftSize; // Hz per bin
  var bin0 = Math.round(FREQ0 / binFreq);
  var bin1 = Math.round(FREQ1 / binFreq);
  var symbolMs = this.symbolMs;
  var self = this;

  var collectedBits = [];
  var symbolSamples = Math.max(1, Math.round((symbolMs/1000) / (analyser.fftSize / ctx.sampleRate)));

  // We'll sample roughly every symbolMs and decide which freq is dominant
  this.decodeInterval = setInterval(function() {
    try {
      analyser.getByteFrequencyData(freqData);
      var v0 = freqData[bin0] || 0;
      var v1 = freqData[bin1] || 0;
      if (self.debug && (v0 || v1)) console.log('Modem.decode sample v0=',v0,'v1=',v1,'bin0=',bin0,'bin1=',bin1);
      var bit = v1 > v0 ? 1 : 0;
      collectedBits.push(bit);
      // maintain max length buffer
      if (collectedBits.length > 8192) collectedBits.splice(0, collectedBits.length - 8192);

      // try to find preamble (0xAA repeated)
      if (collectedBits.length >= (PREAMBLE_REPEATS * 8 + 16)) {
        // search for preamble boundary
        var b = collectedBits;
        for (var shift = 0; shift + (PREAMBLE_REPEATS*8 + 16) < b.length; shift++) {
          var ok = true;
          for (var r = 0; r < PREAMBLE_REPEATS; r++) {
            for (var i = 0; i < 8; i++) {
              var expected = (0xAA >> i) & 1;
              if (b[shift + r*8 + i] !== expected) { ok = false; break; }
            }
            if (!ok) break;
          }
          if (!ok) continue;
          // read length
          var lenBitsStart = shift + PREAMBLE_REPEATS*8;
          var lenHigh = 0;
          for (var i = 0; i < 8; i++) lenHigh |= (b[lenBitsStart + i] & 1) << i;
          var lenLow = 0;
          for (var i = 0; i < 8; i++) lenLow |= (b[lenBitsStart + 8 + i] & 1) << i;
          var payloadLen = (lenHigh << 8) | lenLow;
          var neededBits = PREAMBLE_REPEATS*8 + 16 + payloadLen*8;
          if (shift + neededBits <= b.length) {
            // we have full payload
            var payloadBits = b.slice(lenBitsStart + 16, lenBitsStart + 16 + payloadLen*8);
            var bytes = bitsToBytes(payloadBits);
            var chars = String.fromCharCode.apply(null, bytes);
            try {
              var json = base64ToString(chars);
              var obj = JSON.parse(json);
              // consume up to end
              collectedBits = b.slice(shift + neededBits);
              if (self.onmessage) self.onmessage(obj);
              break; // break search
            } catch (e) {
              // ignore and continue
            }
          }
        }
      }
    } catch (e) {
      // ignore decode errors
    }
  }, symbolMs);
};

module.exports = new Modem();
