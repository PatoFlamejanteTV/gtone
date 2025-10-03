
"use strict";
// Import dependencies (assume global or via bundle)
var Util = window.Util || {};
var PageManager = window.PageManager || {};
const NOTIFICATION_IMAGE_SIZE = 256;
let pageManager = typeof PageManager === 'function' ? new PageManager() : window.pageManager;


/**
 * Implements Shout Out notifications for every possible case we care about.
 */
function NotificationManager() {
  this.notificationCallbacks_ = {};
  if (chrome.notifications && chrome.notifications.onClicked) {
    chrome.notifications.onClicked.addListener(this.onNotificationClicked_.bind(this));
  }
  if (chrome.notifications && chrome.notifications.onButtonClicked) {
    chrome.notifications.onButtonClicked.addListener(this.onNotificationButtonClicked_.bind(this));
  }
}

NotificationManager.prototype.onSendFailAudio = function() {
  try {
    var options = {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('images/notifications/notif_alert_256.png'),
      title: chrome.i18n.getMessage('notification_send_fail_audio_title'),
      message: chrome.i18n.getMessage('notification_send_fail_audio_message')
    };
    chrome.notifications.create('', options, (notificationId) => {
      this.registerClickCallback_(notificationId, () => {
        if (pageManager && pageManager.openPage) pageManager.openPage('error_audio');
      });
    });
  } catch (e) { console.error('onSendFailAudio error', e); }
};


NotificationManager.prototype.onSendFailNetwork = function() {
  try {
    var options = {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('images/notifications/notif_offline_256.png'),
      title: chrome.i18n.getMessage('notification_send_fail_network_title'),
      message: chrome.i18n.getMessage('notification_send_fail_network_message')
    };
    chrome.notifications.create('', options, (notificationId) => {
      this.registerClickCallback_(notificationId, () => {
        if (pageManager && pageManager.openPage) pageManager.openPage('error_network');
      });
    });
  } catch (e) { console.error('onSendFailNetwork error', e); }
};

NotificationManager.prototype.onReceive = function(url, title, message, opt_iconUrl) {
  try {
    var iconUrl;
    if (!opt_iconUrl) {
      iconUrl = chrome.runtime.getURL('images/notifications/notif_anon_256.png');
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
    chrome.notifications.create('', options, (notificationId) => {
      this.registerClickCallback_(notificationId, () => {
        if (Util && Util.openOrFocusUrl) Util.openOrFocusUrl(url);
      });
    });
  } catch (e) { console.error('onReceive error', e); }
};


/** PRIVATE **/

NotificationManager.prototype.registerClickCallback_ =
    function(notificationId, callback) {
  this.notificationCallbacks_[notificationId] = callback;
};


NotificationManager.prototype.reportProblem_ = function(opt_filename) {
  // No-op: Google form removed for privacy. Could open local bug report page.
  console.warn('reportProblem_ called, but Google form is removed.');
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
  // Strip off query params if needed.
  let baseUrl = iconUrl;
  const qIndex = iconUrl.indexOf('?');
  if (qIndex !== -1) baseUrl = iconUrl.substring(0, qIndex);
  // Remove legacy Google sizing (if present)
  baseUrl = baseUrl.replace(/\/s[0-9]+\//, '/');
  return baseUrl + '?size=' + size;
};


NotificationManager.prototype.onNotificationClicked_ = function(notificationId) {
  try {
    if (Util && Util.log) Util.log('Notification clicked', notificationId);
    var callback = this.notificationCallbacks_[notificationId];
    if (callback) callback();
    chrome.notifications.clear(notificationId, function(wasCleared) {
      if (Util && Util.log) Util.log('Notification wasCleared:', wasCleared);
    });
  } catch (e) { console.error('onNotificationClicked_ error', e); }
};


NotificationManager.prototype.onNotificationButtonClicked_ = function(notificationId, buttonIndex) {
  try {
    if (buttonIndex === 1) {
      this.reportProblem_();
    }
  } catch (e) { console.error('onNotificationButtonClicked_ error', e); }
};

// Export for global use
window.NotificationManager = NotificationManager;
