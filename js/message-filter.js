var Util = require('./util.js');

var EXPIRY_DURATION_MS = 6000;

/**
 * Responsible for de-duplicating incoming messages. This is necessary
 * because Tone broadcasts for ~1s audible, and ~5s inaudible. The
 * copresence API doesn't dedupe identical Tones, so we need to do it.
 */
function MessageFilter() {
  // An array of recent Messages.
  this.recentMessages = [];
}

/**
 * Returns true iff this data is new.
 */
MessageFilter.prototype.isNew = function(data) {
  var message = new Message(data, new Date());

  // First, remove all expired messages.
  this.removeExpired_();

  // Check if there's an existing message.
  var existingMessage = this.findPreviousMessage(message);

  if (!existingMessage) {
    // No existing message: add it to recent messages.
    this.recentMessages.push(message);
    // This is a new message, return true.
    return true;
  }
  return false;
};

MessageFilter.prototype.removeExpired_ = function() {
  for (var i = 0; i < this.recentMessages.length; i++) {
    var message = this.recentMessages[i];
    if (message.olderThan(EXPIRY_DURATION_MS)) {
      Util.log('Expiring message', message);
      this.recentMessages.splice(i, 1);
      // Decrement the index, since the array was re-index due to splice.
      i -= 1;
    }
  }
};

MessageFilter.prototype.findPreviousMessage = function(message) {
  for (var i = 0; i < this.recentMessages.length; i++) {
    var thisMessage = this.recentMessages[i];
    if (thisMessage.equals(message)) {
      return thisMessage;
    }
  }
  return null;
};

function Message(data, time) {
  this.data = data;
  this.time = time;
}

Message.prototype.equals = function(otherMessageTime) {
  return this.data.url == otherMessageTime.data.url &&
      this.data.name == otherMessageTime.data.name;
}

Message.prototype.olderThan = function(duration) {
  var now = new Date();
  return now - this.time > duration;
};

module.exports = MessageFilter;
