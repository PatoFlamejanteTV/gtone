var Emitter = require('./emitter.js');
var MessageFilter = require('./message-filter.js');
var Util = require('./util.js');


var API_KEY = 'AIzaSyBsF7ryM_uG_qv3DtjPgDL9aeZvCsJ8hS4';
var INAUDIBLE_DURATION_MS = 4000;
var AUDIBLE_DURATION_MS = 1750;
var MESSAGE_TYPE = 'shoutout';

NearbyManager.Error = {
  PUBLISH_FAILED: 1,
  INVALID_JSON: 2,
};


/**
 * Interacts with the Nearby API to subscribe to new messages and publish them
 * over audio.
 *
 * Depends on nearby.js, included in manifest.json.
 */
function NearbyManager() {
  this.client = new google.nearby.messages.Client(
      API_KEY, new google.nearby.messages.Receiver());

  this.messageFilter = new MessageFilter();

  // The last URL that was sent.
  this.lastUrl = null;

  // The resubscribe timer.
  this.resubscribeTimer = null;
}
NearbyManager.prototype = new Emitter();


NearbyManager.prototype.subscribe = function() {
  var strategy = new google.nearby.messages.Strategy()
      .setAudibleBroadcastTime(0)
      .setInaudibleBroadcastTime(0)
      .setTtlSeconds(google.nearby.messages.Strategy.TTL_SECONDS_MAX);
  // These handlers are needed to unsubscribe.
  this.onMessageHandler = this.onMessage_.bind(this);

  this.client.subscribe(this.onSubscribe_.bind(this), this.onMessageHandler, strategy);
};


NearbyManager.prototype.unsubscribe = function() {
  this.client.unsubscribe(this.onUnsubscribe_.bind(this), this.onMessageHandler);
  clearTimeout(this.resubscribeTimer);
};


NearbyManager.prototype.send = function(tab, userInfo) {
  var data = {
    url: tab.url,
    name: userInfo.name,
    picture: userInfo.picture,
  };
  if (tab.title) {
    data.title = tab.title;
  }

  // Set the audio status listener for the duration of the publish.
  this.client.setAudioStatusListener(this.onAudioStatus_.bind(this));

  // Save the message we're publishing for later, so it can be unpublished.
  this.sendingMessage = google.nearby.messages.Message.fromString(
      JSON.stringify(data), MESSAGE_TYPE);

  var strategy = new google.nearby.messages.Strategy()
      .setAudibleBroadcastTime(AUDIBLE_DURATION_MS / 1000.0)
      .setInaudibleBroadcastTime(INAUDIBLE_DURATION_MS / 1000.0);
  this.client.publish(this.onPublish_.bind(this), this.sendingMessage, strategy);

  // Save this URL for later.
  this.lastUrl = tab.url;
};


NearbyManager.prototype.getLastUrl = function() {
  return this.lastUrl;
};


NearbyManager.prototype.onMessage_ = function(message) {
  var string = message.getStringContent();

  // Ignore messages that aren't new.
  if (!this.messageFilter.isNew(string)) {
    return;
  }

  try {
    var data = JSON.parse(string);
    this.emit_('received', data);
  } catch (e) {
    this.emit_('error', NearbyManager.Error.INVALID_JSON);
  }
};


NearbyManager.prototype.onPublish_ = function(status) {
  console.log('Publish ' +
      (status == google.nearby.messages.Status.OK ? 'succeeded' : 'failed'));

  if (status != google.nearby.messages.Status.OK) {
    this.emit_('error', NearbyManager.Error.PUBLISH_FAILED);
    return;
  }

  this.isLastPublishSuccessful_ = false;

  // Publish only for a set duration, then unpublish.
  setTimeout(function() {
    this.client.unpublish(this.onUnpublish_.bind(this), this.sendingMessage);
  }.bind(this), INAUDIBLE_DURATION_MS);
};


NearbyManager.prototype.onUnpublish_ = function(status) {
  console.log('Unpublish ' +
      (status == google.nearby.messages.Status.OK ? 'succeeded' : 'failed'));

  // No message is being sent. Reset it.
  this.sendingMessage = null;

  // Notify if the last publish was verified (whether loopback heard it).
  this.emit_('sent', this.isLastPublishSuccessful_);
};


NearbyManager.prototype.onSubscribe_ = function(status) {
  console.log('Subscribe ' +
      (status == google.nearby.messages.Status.OK ? 'succeeded' : 'failed'));

  // Setup a timer to re-subscribe.
  var durationMillis = google.nearby.messages.Strategy.TTL_SECONDS_MAX * 1000;

  this.resubscribeTimer = setTimeout(this.resubscribe_.bind(this), durationMillis);
};


NearbyManager.prototype.onUnsubscribe_ = function(status) {
  console.log('Unsubscribe ' +
      (status == google.nearby.messages.Status.OK ? 'succeeded' : 'failed'));
};


NearbyManager.prototype.onAudioStatus_ = function(medium, success) {
  console.log('onAudioStatus_', medium, 'success:', success);
  if (success) {
    this.isLastPublishSuccessful_ = true;
    // Clear the audio status listener.
    this.client.setAudioStatusListener(null);
  }
};


NearbyManager.prototype.resubscribe_ = function() {
  // Unsubscribe, and then subscribe again.
  console.log('resubscribe_: resubscribeTimer fired.');
  this.client.unsubscribe(function(status) {
    // After unsubscribing successfully, subscribe again.
    if (status !== google.nearby.messages.Status.OK) {
      console.warn('resubscribe_: unsubscribe failed.');
    }
    this.subscribe();
  }.bind(this), this.onMessageHandler);
};


module.exports = NearbyManager;
