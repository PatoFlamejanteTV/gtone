var Util = require('./util.js');

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
