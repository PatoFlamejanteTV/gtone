var BatteryLogger = require('./battery-logger.js');
var Util = require('./util.js');

// Maximum lifespan of the client ID is 63 days. Use 60 days just to be safe.
var CLIENT_ID_LIFE_MS = (1000 * 60 * 60 * 24) * 60;

/**
 * Local logging functionality.
 *
 * Replaces Google Analytics usage. Logs are stored locally and optionally
 * forwarded to a configurable HTTP endpoint (chrome.storage.local 'logServerUrl').
 */
function Log(params) {
  params = params || {};
  this.onlyAnalytics = !!params.onlyAnalytics; // keep flag for compatibility
  this.LOG_URL = null; // optional remote log server
  this.batteryLogger = new BatteryLogger();

  this.clientId = null;
  this.getOrCreateClientId_();

  // Test group for this type of user. Can be reset externally.
  this.testGroup = 'default';

  // load optional remote log URL
  chrome.storage.local.get(['logServerUrl'], function(result) {
    if (result && result.logServerUrl) {
      this.LOG_URL = result.logServerUrl;
    }
  }.bind(this));
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
  Util.log('Error:', reason);
};


/**** Private ****/

// Get rid of this for copresence.
Log.prototype.logData_ = function(eventType, fields) {
  if (this.onlyAnalytics) {
    return;
  }

  var data = {
    type: eventType,
    client_time: new Date().valueOf()
  };

  // Set fields
  if (fields !== undefined) {
    for (var key in fields) {
      data[key] = fields[key];
    }
  }

  // Save locally (append to an array in storage for simple inspection/debugging)
  chrome.storage.local.get(['_localLogs'], function(result) {
    var logs = (result && result._localLogs) ? result._localLogs : [];
    logs.push(data);
    // Keep last 500 logs only
    if (logs.length > 500) logs = logs.slice(logs.length - 500);
    chrome.storage.local.set({'_localLogs': logs});
  });

  // Optionally forward to remote logging server
  if (this.LOG_URL) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', this.LOG_URL, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function(e) {
        if (xhr.status == 200) {
          this.onLogSuccess_(xhr.responseText);
        } else {
          this.onLogError_(xhr.responseText);
        }
      }.bind(this);
      xhr.send(JSON.stringify(data));
    } catch (e) {
      console.error('Failed to forward log', e);
    }
  }
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
  // Keep behavior: record event in local logs and optionally forward.
  var data = {
    category: category,
    action: action,
    label: label,
    client_id: this.clientId,
    version: this.getVersion_(),
    test_group: this.testGroup
  };

  if (this.batteryLogger.isReadyToReport()) {
    data.battery_discharge = this.batteryLogger.getDischargeRate();
    this.batteryLogger.snapshot();
  }

  this.logData_('event', data);
};

module.exports = Log;
