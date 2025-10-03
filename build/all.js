(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var Util = _dereq_('./util.js');

var HOUR = 1000*60*60;
/**
 * Battery logger calculates battery discharge rate at the most opportune moment.
 */
function BatteryLogger() {
  // Instantaneous values: is it charging, and the current level.
  this.isCharging = true;
  this.batteryLevel = -1;

  // Snapshot variables.
  this.snapshotLevel = -1;
  this.snapshotTime = 0;

  this.init();
}

BatteryLogger.prototype.init = function() {
  // Watch the battery charging state.
  navigator.getBattery().then(function(battery) {

    this.updateBatteryStatus_(battery);

    battery.onchargingchange = function() {
      this.updateBatteryStatus_(battery);
    }.bind(this);

    battery.onlevelchange = function() {
      this.updateBatteryStatus_(battery);
    }.bind(this);

  }.bind(this));
};


/**
 * Whether or not enough time has passed since the snapshot so that
 * the battery discharge rate should be reported.
 */
BatteryLogger.prototype.isReadyToReport = function() {
  var elapsed = new Date() - this.snapshotTime;
  return !this.isCharging && elapsed > HOUR/6;
};

/**
 * Gets the discharge rate calculated since the last snapshot. This
 * should be an estimation of how many percentage points the battery drains
 * every hour.
 */
BatteryLogger.prototype.getDischargeRate = function() {
  if (!this.isReadyToReport()) {
    console.error('Not ready to report discharge rate yet!');
    return null;
  }
  var time = new Date() - this.snapshotTime;
  var delta = this.snapshotLevel - this.batteryLevel;
  var percent = delta/time * HOUR;
  /// Return an integer in [0, 100].
  return Math.floor(percent * 100);
};

BatteryLogger.prototype.updateBatteryStatus_ = function(battery) {
  var didStartDischarging = !battery.charging && this.isCharging;
  var didStopDischarging = battery.charging && !this.isCharging;

  // Store some important variables.
  this.isCharging = battery.charging;
  this.batteryLevel = battery.level;

  // If the battery starts discharging, setup an hourly timer.
  if (didStartDischarging) {
    Util.log('BL', 'battery discharging.');
    this.snapshot();
  }
  // If the battery stops discharging, stop the timer.
  if (didStopDischarging) {
    Util.log('BL', 'battery charging.');
  }
};

/**
 * Runs a snapshot of the current battery state. In particular, capture the
 * current time and the current battery level.
 */
BatteryLogger.prototype.snapshot = function() {
  this.snapshotTime = new Date();
  this.snapshotLevel = this.batteryLevel;
};

module.exports = BatteryLogger;

},{"./util.js":11}],2:[function(_dereq_,module,exports){
/*
 * Copyright 2015 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


function Emitter() {
  this.initEmitter();
}

Emitter.prototype.initEmitter = function() {
  this.callbacks = {};
};

Emitter.prototype.emit_ = function(eventName) {
  var callbacks = this.callbacks[eventName];
  if (!callbacks) {
    console.log('No valid callback specified.');
    return;
  }
  var args = [].slice.call(arguments)
  // Eliminate the first param (the callback).
  args.shift();
  for (var i = 0; i < callbacks.length; i++) {
    callbacks[i].apply(this, args);
  }
};

Emitter.prototype.on = function(eventName, callback) {
  if (eventName in this.callbacks) {
    this.callbacks[eventName].push(callback);
  } else {
    this.callbacks[eventName] = [callback];
  }
};

module.exports = Emitter;

},{}],3:[function(_dereq_,module,exports){
var Util = _dereq_('./util.js');

var GET_USER_INFO_URL =
    'https://clients1.google.com/tbproxy/getaccountinfo?rv=2';
var LOGIN_URL = 'https://accounts.google.com/';
var LOGIN_URL_PATTERN = 'https://accounts.google.com/*';
var COOKIE_NAME = 'LSID';
var COOKIE_URL = 'https://accounts.google.com';

function IdentityManager() {
  this.name = null;
  this.picture = null;

  this.getOrFetchUserInfo(function(userInfo) {
    Util.log('Fetched userInfo', userInfo);
  });
}

/**
 * If the cookie has changed, fetch the user info. Otherwise, get it from
 * the cached storage.
 */
IdentityManager.prototype.getOrFetchUserInfo = function(callback) {
  this.hasCookieChanged_(function(isChanged) {
    if (isChanged) {
      this.fetchUserInfo_(callback);
    } else {
      this.getUserInfo_(callback);
    }
  }.bind(this));
};

IdentityManager.prototype.promptLogin = function() {
  // Show the login tab. If it's already open, focus it.
  Util.openOrFocusUrl(LOGIN_URL, LOGIN_URL_PATTERN);
};

/**** PRIVATE ****/

IdentityManager.prototype.hasCookieChanged_ = function(callback) {
  var details = {
    url: COOKIE_URL,
    name: COOKIE_NAME
  };
  chrome.cookies.get(details, function(cookie) {
    var currentValue = cookie && cookie.value;
    // If the current cookie is invalid, automatically callback true.
    if (!currentValue) {
      callback(true);
      return;
    }
    // Check if the value has changed WRT the last known one).
    chrome.storage.local.get([COOKIE_NAME], function(result) {
      var lastValue = (COOKIE_NAME in result ? result[COOKIE_NAME] : null);
      var isChanged = (currentValue != lastValue)
      // Callback informing whether or not the cookie changed.
      callback(isChanged);

      // Save the new value of the cookie.
      if (isChanged) {
        var items = {};
        items[COOKIE_NAME] = currentValue;
        chrome.storage.local.set(items);
      }
    });
  });
};

IdentityManager.prototype.getUserInfo_ = function(callback) {
  // Get the cached user information.
  chrome.storage.local.get(['name', 'picture', 'email'], function(result) {
    if (result.name && result.picture) {
      callback(result);
    } else {
      callback(null);
    }
  }.bind(this));
};

IdentityManager.prototype.fetchUserInfo_ = function(callback) {
  // Get user info from the endpoint.
  var xhr = new XMLHttpRequest();
  xhr.open('GET', GET_USER_INFO_URL, true);
  xhr.onload = function(e) {
    if (xhr.status == 200) {
      var json = JSON.parse(xhr.responseText);
      // Save it via chrome.storage.local.
      var result = {
        name: json.display_name,
        picture: json.profile_picture_url,
        email: json.email
      };
      chrome.storage.local.set(result);
      callback(result);
    } else {
      // Report an error.
      console.error('Unable to fetch user info from server.');
      callback(null);
    }
  }.bind(this);
  xhr.send();
};

IdentityManager.prototype.monitorGoogleCookies_ = function() {
  // Listen for changes to the gaia cookies.
  chrome.cookies.onChanged.addListener(function(changeInfo)  {
    var cookie = changeInfo.cookie;
    // If the gaia cookie changed, re-fetch the user info.
    if (cookie.name == COOKIE_NAME && cookie.domain == COOKIE_URL) {
      // Get the last value of the LSID cookie.
      chrome.storage.local.get([COOKIE_NAME], function(result) {
        var lastLSIDValue = result[COOKIE_NAME];

        if (cookie.value != lastLSIDValue) {
          // If the cookie has changed, so we should re-fetch user info.
          // TODO(smus): Sometimes cookies take a while to set, so wait
          // before making the request.
          setTimeout(this.fetchUserInfo.bind(this), 200);
        }
      });
      var items = {};
      items[COOKIE_NAME] = cookie.value;
      chrome.storage.local.set(items);
    }
  }.bind(this));
};

module.exports = IdentityManager;

},{"./util.js":11}],4:[function(_dereq_,module,exports){
var BatteryLogger = _dereq_('./battery-logger.js');
var Util = _dereq_('./util.js');

var analyticsService = analytics.getService('shout_out');
tracker = analyticsService.getTracker('UA-35315454-5');

// Maximum lifespan of the client ID is 63 days. Use 60 days just to be safe.
var CLIENT_ID_LIFE_MS = (1000 * 60 * 60 * 24) * 60;

/**
 * Google Analytics logging functionality.
 *
 * Depends on google-analytics-bundle.js, included in manifest.json.
 */
function Log(params) {
  params = params || {};
  this.onlyAnalytics = !!params.onlyAnalytics;
  this.LOG_URL = 'http://shout-out-server.appspot.com/log';
  this.batteryLogger = new BatteryLogger();

  this.clientId = null;
  this.getOrCreateClientId_();

  // Test group for this type of user. Can be reset externally.
  this.testGroup = 'default';

  this.setupAnalyticsListener();
}

Log.prototype.logInstalled = function() {
  var version = this.getVersion_();
  this.logData_('installed', {
    client_time: new Date().valueOf(),
    client_id: this.clientId,
    os: navigator.userAgent,
    version: version
  });
  this.sendEvent('Admin', 'Installed', version);
  Util.log('Installed');
};

Log.prototype.logUpdated = function(previousVersion) {
  var version = this.getVersion_();
  this.logData_('updated', {
    client_time: new Date().valueOf(),
    client_id: this.clientId,
    os: navigator.userAgent,
    version: version,
    previous_version: previousVersion
  });
  var verString = previousVersion + ' => ' + version;
  this.sendEvent('Admin', 'Updated', verString);
  Util.log('Updated:', verString);
};

Log.prototype.logEnabled = function(is_enabled) {
  var version = this.getVersion_();
  this.logData_('enabled', {
    client_time: new Date().valueOf(),
    client_id: this.clientId,
    os: navigator.userAgent,
    version: version,
    is_enabled: is_enabled
  });
  if (is_enabled) {
    this.sendEvent('Admin', 'Enabled');
  } else {
    this.sendEvent('Admin', 'Disabled');
  }
  Util.log('Enabled:', is_enabled);
};

Log.prototype.logSent = function(token, url, verified) {
  var version = this.getVersion_();
  var tld = new URL(url).hostname;
  this.logData_('sent', {
    client_time: new Date().valueOf(),
    client_id: this.clientId,
    os: navigator.userAgent,
    version: version,
    token: token,
    domain_tld: tld,
    verified: verified
  });
  // Client side logging.
  if (verified) {
    this.sendEvent('Data', 'Sent Verified', tld);
  } else {
    this.sendEvent('Data', 'Sent Unverified', tld);
  }
  Util.log('Sent token:', token, 'tld:', tld, 'verified:', verified);
};

Log.prototype.logReceived = function(token, url) {
  var tld = new URL(url).hostname;
  var version = this.getVersion_();
  this.logData_('received', {
    client_time: new Date().valueOf(),
    client_id: this.clientId,
    os: navigator.userAgent,
    version: version,
    token: token
  });
  this.sendEvent('Data', 'Received', tld);
  Util.log('Received token:', token, 'tld:', tld);
};

Log.prototype.logError = function(reason, opt_extra) {
  var version = this.getVersion_();
  this.logData_('error', {
    client_time: new Date().valueOf(),
    client_id: this.clientId,
    os: navigator.userAgent,
    version: version,
    reason: reason
  });
  var extra = opt_extra || version;
  this.sendEvent('Error', reason, extra);
  Util.log('Error:', reason);
};


/**** Private ****/

// Get rid of this for copresence.
Log.prototype.logData_ = function(eventType, fields) {
  if (this.onlyAnalytics) {
    return;
  }
  var data = {
    type: eventType
  };

  // Set fields
  if (fields !== undefined) {
    for (var key in fields) {
      data[key] = fields[key];
    }
  }

  // Make a request to the logging server.
  var xhr = new XMLHttpRequest();
  xhr.open('POST', this.LOG_URL, true);

  xhr.onload = function(e) {
    if (xhr.status == 200) {
      this.onLogSuccess_(xhr.responseText);
    } else {
      this.onLogError_(xhr.responseText);
    }
  }.bind(this);
  xhr.send(JSON.stringify(data));
};

Log.prototype.getOrCreateClientId_ = function() {
  // Check the chrome storage API for the existence of a client ID.
  chrome.storage.local.get(['clientId', 'clientIdTime'], function(result) {
    var elapsed = new Date() - (result.clientIdTime || 0);
    // If there's no client ID, or it's expired, we need to make a new one.
    if (!result.clientId || elapsed > CLIENT_ID_LIFE_MS) {
      var newClientId = this.generateClientId_();
      chrome.storage.local.set({
        clientId: newClientId,
        clientIdTime: new Date().valueOf()
      });
      this.clientId = newClientId;
      Util.log('Generated new client ID', this.clientId);
    } else {
      this.clientId = result.clientId;
      Util.log('Using existing client ID', this.clientId);
    }
  }.bind(this));
};

Log.prototype.generateClientId_ = function(e) {
  // From http://goo.gl/z2RxK:
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

Log.prototype.onLogSuccess_ = function(e) {
  //Util.log('Logged', e);
};

Log.prototype.onLogError_ = function(e) {
  console.error('Failed to log', e);
};

Log.prototype.getVersion_ = function() {
  return chrome.runtime.getManifest().version;
};

Log.prototype.setTestGroup = function(testGroup) {
  this.testGroup = testGroup;
};

Log.prototype.sendEvent = function(category, action, label) {
  var event = analytics.EventBuilder.builder()
      .category(category)
      .action(action)
      .label(label)
      .dimension(1, this.clientId)
      .dimension(2, this.getVersion_())
      .dimension(3, this.testGroup);

  if (this.batteryLogger.isReadyToReport()) {
    event = event.metric(1, this.batteryLogger.getDischargeRate())
        .metric(2, 1);
    // Take a snapshot of the current battery state.
    this.batteryLogger.snapshot();
  }

  tracker.send(event);
};

/**
 * Adds a filter that captures hits being sent to Google Analytics.
 */
Log.prototype.setupAnalyticsListener = function() {
  var filter = analytics.filters.FilterBuilder.builder()
      .whenHitType(analytics.HitTypes.EVENT)
      .applyFilter(this.onAnalyticsEvent.bind(this));
  // Listen to all hits to the analytics server.
  tracker.addFilter(filter.build());
}

Log.prototype.onAnalyticsEvent = function(hit) {
  var params = hit.getParameters();
  var category = params.get(analytics.Parameters.EVENT_CATEGORY);
  var action = params.get(analytics.Parameters.EVENT_ACTION);
  Util.log('Sent to analytics', category, action);
};

module.exports = Log;

},{"./battery-logger.js":1,"./util.js":11}],5:[function(_dereq_,module,exports){
var NearbyManager = _dereq_('./nearby-manager.js');
var IdentityManager = _dereq_('./identity-manager.js');
var LogClient = _dereq_('./log-client.js');
var NotificationManager = _dereq_('./notification-manager.js');
var PageManager = _dereq_('./page-manager.js');
var StateMachine = _dereq_('./state-machine.js');
var Util = _dereq_('./util.js');

// Notification manager to show notifications.
notificationManager = new NotificationManager();

// Create a custom broadcast/receive manager for copresence.
nearbyManager = new NearbyManager();
nearbyManager.on('sent', onSent);
nearbyManager.on('received', onReceived);
nearbyManager.on('error', onError);

// Initialize the state machine.
stateMachine = new StateMachine();
stateMachine.on('change', onStateChange);

// Page manager opens various Shout Out pages.
pageManager = new PageManager();

// Identity manager determines currently logged in user.
identityManager = new IdentityManager();

// Log client logs details to Google Analytics.
logClient = new LogClient({onlyAnalytics: true});

// Hook up the browser action button.
chrome.browserAction.onClicked.addListener(onBrowserAction);

// At install-time, log whether or not we have an install or an update.
chrome.runtime.onInstalled.addListener(function(details) {
  var thisVersion = chrome.runtime.getManifest().version;
  if (details.reason == 'install') {
    // Open up the welcome page.
    pageManager.openPage('installed');
    logClient.logInstalled();
  } else if (details.reason == 'update') {
    if (thisVersion != details.previousVersion) {
      logClient.logUpdated(details.previousVersion);
    }
  }
});

getTestGroup(function(testGroup) {
  logClient.setTestGroup(testGroup);
});

function onSent(isVerified) {
  Util.log('onSent', isVerified);
  var url = nearbyManager.getLastUrl();
  if (isVerified) {
    stateMachine.success();
    logClient.logSent(null, url, true);
    // Special case: we are on the installed.html page.
    Util.getCurrentUrl(function(url) {
      if (url == pageManager.getUrl('installed')) {
        // Navigate to the success.html URL.
        pageManager.openPage('success', true);
      }
    });
  } else {
    stateMachine.error();
    notificationManager.onSendFailAudio();
    logClient.logSent(null, url, false);
  }
}

function onError(code) {
  Util.log('onError', code);
  if (code == NearbyManager.Error.PUBLISH_FAILED) {
    notificationManager.onSendFailNetwork();
    stateMachine.error();
    logClient.logError('Publish failed');
  }
}

function onReceived(json) {
  Util.log('onReceived', json);
  var url = json.url;
  // First, validate the URL. If it's invalid, do nothing.
  if (!Util.isValidUrl(url)) {
    console.error('Invalid URL: %s', url);
    return;
  }

  var title = chrome.i18n.getMessage('notification_receive_title_format')
      .replace('{{username}}', json.name);

  var description;
  if (url == pageManager.getUrl('installed')) {
    // Handle the special case that we've received the test page.
    description = chrome.i18n.getMessage('notification_receive_test_page_message');
  } else {
    // Handle the case where we have a regular Shout Out.
    var pageTitle = json.title ? '\'' + Util.shortenTitle(json.title) + '\'' : 'page';
    description = chrome.i18n.getMessage('notification_receive_message_format')
        .replace('{{title}}', pageTitle)
        .replace('{{domain}}', Util.getDomainName(url));
  }
  notificationManager.onReceive(url, title, description, json.picture);
  logClient.logReceived(null, url);
}

function onBrowserAction(tab) {
  var state = stateMachine.getState();
  if (state == StateMachine.State.READY) {
    sendShoutOut(tab);
  } else if (state == StateMachine.State.DISABLED) {
    pageManager.openPage('settings');
  }
}

function onStateChange(newState, oldState) {
  if (newState == StateMachine.State.INITIALIZING) {
    // Subscribe to copresence.
    nearbyManager.subscribe();
    stateMachine.initialized();
  } else if (newState == StateMachine.State.DISABLED) {
    // Unsubscribe from copresence.
    nearbyManager.unsubscribe();
  }
  // Log when Shout Out is disabled/enabled, but make sure disabled clients
  // don't re-log that they got disabled every time they restart.
  if (newState == StateMachine.State.DISABLED && oldState != null) {
    logClient.logEnabled(false);
  }
  if (oldState == StateMachine.State.DISABLED) {
    logClient.logEnabled(true);
  }
}

function sendShoutOut(tab) {
  identityManager.getOrFetchUserInfo(function(userInfo) {
    if (!userInfo) {
      identityManager.promptLogin();
      return;
    }
    nearbyManager.send(tab, userInfo);
    stateMachine.sending();
  });
}

/**
 * Separate internal (google.com) folks from everybody else
 * for analytics purposes.
 */
function getTestGroup(callback) {
  identityManager.getOrFetchUserInfo(function(userInfo) {
    if (userInfo && userInfo.email &&
        userInfo.email.indexOf('@google.com') >= 0) {
      result = 'google';
      callback(result);
    }
  });
};

},{"./identity-manager.js":3,"./log-client.js":4,"./nearby-manager.js":7,"./notification-manager.js":8,"./page-manager.js":9,"./state-machine.js":10,"./util.js":11}],6:[function(_dereq_,module,exports){
var Util = _dereq_('./util.js');

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

},{"./util.js":11}],7:[function(_dereq_,module,exports){
var Emitter = _dereq_('./emitter.js');
var MessageFilter = _dereq_('./message-filter.js');
var Util = _dereq_('./util.js');


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

},{"./emitter.js":2,"./message-filter.js":6,"./util.js":11}],8:[function(_dereq_,module,exports){
var Util = _dereq_('./util.js');
var PageManager = _dereq_('./page-manager.js');

var REPORT_URL_ROOT = 'https://docs.google.com/a/google.com/forms/d/17BEfb-JLsiJbsZRjnMmTdaH3EtMj8OpxADR0DayWS9s/viewform?';
var NOTIFICATION_IMAGE_SIZE = 256;

var pageManager = new PageManager();


/**
 * Implements Shout Out notifications for every possible case we care about.
 */
function NotificationManager() {
  // Map of notificationId : callback for handling clicks on the
  // notification itself.
  this.notificationCallbacks_ = {};

  // Handle clicking the notification itself.
  chrome.notifications.onClicked.addListener(
      this.onNotificationClicked_.bind(this));

  // Handle clicking the notification buttons.
  chrome.notifications.onButtonClicked.addListener(
      this.onNotificationButtonClicked_.bind(this));
}

NotificationManager.prototype.onSendFailAudio = function() {
  var options = {
    type: 'basic',
    iconUrl: chrome.extension.getURL('images/notifications/notif_alert_256.png'),
    title: chrome.i18n.getMessage('notification_send_fail_audio_title'),
    message: chrome.i18n.getMessage('notification_send_fail_audio_message')
  };
  chrome.notifications.create('', options, function(notificationId) {
    this.registerClickCallback_(notificationId, function() {
      pageManager.openPage('error_audio');
    });
  }.bind(this));
};


NotificationManager.prototype.onSendFailNetwork = function() {
  var options = {
    type: 'basic',
    iconUrl: chrome.extension.getURL('images/notifications/notif_offline_256.png'),
    title: chrome.i18n.getMessage('notification_send_fail_network_title'),
    message: chrome.i18n.getMessage('notification_send_fail_network_message')
  };
  chrome.notifications.create('', options, function(notificationId) {
    this.registerClickCallback_(notificationId, function() {
      pageManager.openPage('error_network');
    });
  }.bind(this));
};

NotificationManager.prototype.onReceive =
    function(url, title, message, opt_iconUrl) {
  var iconUrl;
  if (!opt_iconUrl) {
    iconUrl = chrome.extension.getURL('images/notifications/notif_anon_256.png');
  } else {
    iconUrl = this.setImageSize_(opt_iconUrl, NOTIFICATION_IMAGE_SIZE);
  }
  var options = {
    type: 'basic',
    iconUrl: iconUrl,
    title: title,
    message: message,
    priority: 2
  };
  chrome.notifications.create('', options, function(notificationId) {
    this.registerClickCallback_(notificationId, function() {
      Util.openOrFocusUrl(url);
    }.bind(this));
  }.bind(this));
};


/** PRIVATE **/

NotificationManager.prototype.registerClickCallback_ =
    function(notificationId, callback) {
  this.notificationCallbacks_[notificationId] = callback;
};


NotificationManager.prototype.reportProblem_ = function(opt_filename) {
  var params = {
    'entry.1909320881': 'navigator.userAgent',
  };
  if (opt_filename) {
    params['entry.1608031336'] = opt_filename;
  }
  var serializedParams = '';
  for (param in params) {
    serializedParams += (param + '=' + params[param] + '&');
  }
  var url = REPORT_URL_ROOT + serializedParams;
  chrome.tabs.create({url: url});
};


NotificationManager.prototype.clearNotificationDelay_ =
    function(notificationId, delay) {
  setTimeout(function() {
    chrome.notifications.clear(notificationId, function(wasCleared) {
      Util.log('Cleared notification.');
    });
  }, delay);
}


/**
 * Sets a size on the icon URL. Removes any parameters from the end of the
 * URL, and adds a size= parameter with the specified size.
 */
NotificationManager.prototype.setImageSize_ = function(iconUrl, size) {
  // Strip off the extra params if needed.
  var baseUrl = iconUrl;
  var qIndex = iconUrl.indexOf('?');
  if (qIndex != -1) {
    baseUrl = iconUrl.substring(0, qIndex);
  }

  // Some image URLs have sizing specified in another way, for example:
  // http://lh6.googleusercontent.com/.../s20/p.png. In this case, strip the
  // extra sNN business.
  var ALT_SIZE_REGEX = '/s[0-9]+/'
  var match = baseUrl.match(ALT_SIZE_REGEX)
  if (match && match.length == 1) {
    var onlyMatch = match[0];
    baseUrl = baseUrl.replace(onlyMatch, '/');
  }
  return baseUrl + '?size=' + size;
};


NotificationManager.prototype.onNotificationClicked_ =
    function(notificationId) {
  Util.log('Notification clicked', notificationId);
  var callback = this.notificationCallbacks_[notificationId];
  if (callback) {
    callback();
  }

  chrome.notifications.clear(notificationId, function(wasCleared) {
    Util.log('Notification wasCleared:', wasCleared);
  });
};


NotificationManager.prototype.onNotificationButtonClicked_ =
    function(notificationId, buttonIndex) {
  if (buttonIndex == 0) { // Yes.
    // Do nothing for now.
  } else if (buttonIndex == 1) { // No.
    this.reportProblem_();
  }
}


module.exports = NotificationManager;

},{"./page-manager.js":9,"./util.js":11}],9:[function(_dereq_,module,exports){
var Util = _dereq_('./util.js');
var SUFFIX = '.html';

function PageManager() {
  this.root = 'chrome-extension://{{id}}/pages/'
      .replace('{{id}}', chrome.runtime.id);
}

PageManager.prototype.openPage = function(pageName, replaceCurrent) {
  var url = this.getUrl(pageName);
  if (replaceCurrent) {
    chrome.tabs.update({url: url});
  } else {
    Util.openOrFocusUrl(url);
  }
};

PageManager.prototype.getUrl = function(pageName) {
  return this.root + pageName + SUFFIX;
};

module.exports = PageManager;

},{"./util.js":11}],10:[function(_dereq_,module,exports){
var Util = _dereq_('./util.js');

var State = {
  INITIALIZING: 'INITIALIZING',
  READY: 'READY',
  DISABLED: 'DISABLED',
  SENDING: 'SENDING',
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS'
};

var IconMap = {
  INITIALIZING: '$SIZE_ready.png',
  READY: '$SIZE_ready.png',
  DISABLED: '$SIZE_off.png',
  SENDING: [
    '$SIZE_anim1.png',
    '$SIZE_anim2.png',
    '$SIZE_anim3.png',
    '$SIZE_anim4.png'
  ],
  ERROR: '$SIZE_fail.png',
  SUCCESS: '$SIZE_success.png'
};

var TIMEOUT = 3000;

function StateMachine() {
  // Set the initial state based on what's in the storage.
  chrome.storage.local.get(['state'], function(result) {
    if (result.state == State.DISABLED) {
      // If storage says we're disabled, disable.
      this.setState_(result.state);
    } else if (!this.currentState) {
      // If no state is set, make sure we use the default one.
      this.setState_(State.INITIALIZING);
    }
  }.bind(this));

  // Listen to state changes from the storage (they may come from the
  // options page).
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if ('state' in changes) {
      var newState = changes.state.newValue;
      this.setState_(newState);
    }
  }.bind(this));
}

StateMachine.prototype.on = function(event, callback) {
  if (event == 'change') {
    this.callback = callback;
  }
};

StateMachine.prototype.getState = function() {
  return this.currentState;
};

/**
 * Sends a shout out (only if currently ready).
 */
StateMachine.prototype.sending = function() {
  if (this.currentState != State.READY) {
    console.error('Cannot start sending if you weren\'t just ready.');
    return;
  }
  this.setState_(State.SENDING);
};


StateMachine.prototype.error = function() {
  this.setState_(State.ERROR);
  this.scheduleStateChange_(State.READY, TIMEOUT);
};

StateMachine.prototype.success = function() {
  // Sanity check: we must have been sending to succeed.
  if (this.currentState != State.SENDING) {
    console.error('Cannot succeed unless you were just sending.');
    return;
  }
  this.setState_(State.SUCCESS);
  this.scheduleStateChange_(State.READY, TIMEOUT);
};

StateMachine.prototype.initialized = function() {
  this.setState_(State.READY);
};

StateMachine.prototype.initializing = function() {
  this.setState_(State.INITIALIZING);
};

/***** PRIVATE *****/

StateMachine.prototype.scheduleStateChange_ = function(targetState, delay) {
  // Before scheduling another state change, cancel pending ones.
  this.cancelScheduledStateChange_();

  this.timer_ = setTimeout(function() {
    this.setState_(targetState);
  }.bind(this), delay);
};

StateMachine.prototype.cancelScheduledStateChange_ = function() {
  clearTimeout(this.timer_);
  this.timer_ = null;
};


StateMachine.prototype.setState_ = function(newState) {
  if (this.timer_) {
    //console.error('Warning: setting state while state change pending!');
  }

  if (this.currentState == newState) {
    return;
  }
  // Update the icon.
  this.updateIcon_(newState);

  // Update the context menu.
  this.updateContextMenu_(newState);

  // Save the state in the storage.
  var oldState = this.currentState;
  this.currentState = newState;
  Util.log('setState: ' + newState);

  // Callback to listeners that care about state changes.
  if (this.callback) {
    this.callback(newState, oldState);
  }
};

StateMachine.prototype.updateIcon_ = function(newState) {
  // Check if the browserAction exists (may be in receive-only mode).
  if (!chrome.browserAction) {
    return;
  }
  var iconInfo = IconMap[newState];
  if (iconInfo instanceof Array) {
    // Start an animation that goes through the keyframes.
    this.startAnimation_(newState);
  } else {
    // Stop the animation that may be running.
    this.stopAnimation_();
    // Set the static icon based on the base of the icon.
    var iconBase = 'images/actions/action_' + iconInfo;
    var small = iconBase.replace('$SIZE', '19');
    var big = iconBase.replace('$SIZE', '38');
    chrome.browserAction.setIcon({path: {'19': small, '38': big}});
  }
};

StateMachine.prototype.updateContextMenu_ = function(newState) {
  // Check for the context menu API.
  if (!chrome.contextMenus) {
    return;
  }
  // Wipe the context menu of old items.
  chrome.contextMenus.removeAll();

  // If it's the ready state, show the disable item.
  if (newState == State.READY) {
    chrome.contextMenus.create({
      'title': chrome.i18n.getMessage('context_menu_disable'),
      'contexts': ['browser_action'],
      'onclick': function() {
        chrome.storage.local.set({state: State.DISABLED});
      }.bind(this)
    });
  }

  // If it's the disabled state, show the enable item.
  if (newState == State.DISABLED) {
    chrome.contextMenus.create({
      'title': chrome.i18n.getMessage('context_menu_enable'),
      'contexts': ['browser_action'],
      'onclick': function() {
        chrome.storage.local.set({state: State.INITIALIZING});
      }.bind(this)
    });
  }
};

StateMachine.prototype.startAnimation_ = function(newState) {
  // Check if the browserAction exists (may be in receive-only mode).
  if (!chrome.browserAction) {
    return;
  }
  var frame = 0;
  var iconArray = IconMap[newState];
  var frameCount = iconArray.length;
  var updateAnimation = function() {
    var iconBase = 'images/actions/action_' + iconArray[frame % frameCount];
    var small = iconBase.replace('$SIZE', '19');
    var big = iconBase.replace('$SIZE', '38');
    chrome.browserAction.setIcon({path: {'19': small, '38': big}});
    frame += 1;
  };

  // Immediately start the animation.
  updateAnimation();
  // Also setup a timer to finish the animation.
  this.animationTimer_ = setInterval(updateAnimation, 1000/5);
};

StateMachine.prototype.stopAnimation_ = function() {
  clearInterval(this.animationTimer_);
};


StateMachine.State = State;
module.exports = StateMachine;

},{"./util.js":11}],11:[function(_dereq_,module,exports){
Util = {};

Util.openOrFocusUrl = function(url, opt_urlMatchPattern) {
  console.log(url);
  var urlPattern = opt_urlMatchPattern || url;
  // Check if tab is already open for this URL.
  chrome.tabs.query({url: urlPattern}, function(tabs) {
    // If it's not open already.
    if (!tabs || tabs.length == 0) {
      // Check to see if there is an active window.
      chrome.windows.getCurrent({}, function(window) {
        if (window) {
          // If there's a window, create a tab in it and focus it.
          chrome.tabs.create({url: url});
          chrome.windows.update(window.id, {focused: true});
        } else {
          // If there's no window, create one that's focused.
          chrome.windows.create({url: url, focused: true});
        }
      });

    } else {
      // Otherwise, if the url is already open, foreground the open tab.
      var openTab = tabs[0];
      chrome.tabs.update(openTab.id, {active: true});
      // Focus the tab's window.
      chrome.windows.update(openTab.windowId, {focused: true});
    }
  });
};


Util.getDomainName = function(url) {
  var a = document.createElement('a');
  a.href = url;
  return a.hostname;
};

Util.getCurrentTab = function(callback) {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    var tab = tabs[0];
    if (!tab || !tab.url) {
      callback(null);
      return;
    }
    callback(tab);
  });
};

Util.getCurrentUrl = function(callback) {
  Util.getCurrentTab(function(tab) {
    var result = tab && tab.url;
    callback(result);
  });
};

/**
 * Deep equality checking for arrays.
 */
Util.arraysEqual = function(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length != b.length) return false;

  // If you don't care about the order of the elements inside
  // the array, you should sort both arrays here.

  for (var i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

var MAX_TITLE_LENGTH = 20;
/**
 * Takes a long title and truncates it to a fixed length, adding ellipsis.
 */
Util.shortenTitle = function(longTitle) {
  if (longTitle.length < MAX_TITLE_LENGTH) {
    return longTitle;
  }
  // Magic number selected based on keeping the notification text under
  // three lines (tested in Chrome 36 on a Mac).
  var title = longTitle.substring(0, MAX_TITLE_LENGTH);
  return title + '...';
};

/**
 * Chrome's console.log does not work properly with variable argument lists,
 * when logging to stdout. This is a workaround to that problem. Also,
 * everything is timestamped.
 */
Util.log = function() {
  var args = [].slice.call(arguments)

  // If there are any Objects in the arguments, transform them into JSON.
  for (var i = 0; i < args.length; i++) {
    var arg = args[i];
    if (arg instanceof Object) {
      args[i] = JSON.stringify(args[i]);
    }
  }

  // Start the log with a timestamp.
  var now = new Date();
  args.unshift(now.toISOString());

  var message = args.join(' ');
  console.log(message);
};

/**
 * Mainly, ensure URL does not start with "javascript".
 */
Util.isValidUrl = function(url) {
  return url.startsWith('http') || url.startsWith('chrome');
};

module.exports = Util;

},{}]},{},[5]);
