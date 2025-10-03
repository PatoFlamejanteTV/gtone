var Util = require('./util.js');

/**
 * Local IdentityManager
 *
 * Replaces the previous Google-account-based identity with a simple
 * local profile stored in chrome.storage.local. This keeps the same
 * external API used by the rest of the code: getOrFetchUserInfo(callback)
 * and promptLogin().
 */
function IdentityManager() {
  // default empty profile
  this.name = null;
  this.picture = null;
  this.email = null;

  // Ensure a profile exists (may be null)
  this.getOrFetchUserInfo(function(userInfo) {
    Util.log('Local Identity loaded', userInfo);
  });
}

IdentityManager.prototype.getOrFetchUserInfo = function(callback) {
  // Retrieve the profile from storage. If none, return null.
  chrome.storage.local.get(['name', 'picture', 'email'], function(result) {
    if (result && result.name) {
      callback(result);
    } else {
      callback(null);
    }
  });
};

IdentityManager.prototype.promptLogin = function() {
  // Open the settings page where the user can set their display name
  // and optionally an avatar URL. The settings page should implement
  // a small form which saves to chrome.storage.local. Fallback: prompt().
  var settingsUrl = 'chrome-extension://' + chrome.runtime.id + '/pages/settings.html';
  Util.openOrFocusUrl(settingsUrl);
};

module.exports = IdentityManager;
