var BatteryLogger = require('./battery-logger.js');
var Util = require('./util.js');

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
