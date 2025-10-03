var NearbyManager = require('./nearby-manager.js');
var IdentityManager = require('./identity-manager.js');
var LogClient = require('./log-client.js');
var NotificationManager = require('./notification-manager.js');
var PageManager = require('./page-manager.js');
var StateMachine = require('./state-machine.js');
var Util = require('./util.js');

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
