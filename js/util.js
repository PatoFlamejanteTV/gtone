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
