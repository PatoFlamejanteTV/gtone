//var REPORT_URL = 'https://b2.corp.google.com/u/0/issues/new?component=103255&cc=shoutout-team&type=BUG&priority=P4';
var REPORT_URL = 'https://docs.google.com/a/google.com/forms/d/1VYuQbhQiFY2BFcb3IcqMeFO3XV-UXVkssiFzZmzs_nE/viewform';
var UA_FIELD = 'entry.630098213';

function reportProblem(event) {
  var ua = encodeURIComponent(navigator.userAgent);
  var url = REPORT_URL + '?' + UA_FIELD + '=' + ua;
  // Since we have an href="#" attribute on the bug button, we should
  // prevent the default behavior from happening.
  event.preventDefault();
  window.open(url);
}

// Make the bug button report a problem.
document.querySelector('#bug').addEventListener('click', reportProblem);

// Initially, show the butterbar that lets others invite their friends.
function closeButterBar(e) {
  butterBar.classList.add('closed');
}

// If there's a butter bar, show it by default and make sure it closes.
var butterBar = document.querySelector('.msgbar');
if (butterBar) {
  var butterBarClose = butterBar.querySelector('#close');
  butterBarClose.addEventListener('click', closeButterBar);
  butterBar.classList.remove('closed');
}

/**
 * Support the data-i18n-import="page_name.html", which dumps the contents of
 * the localized fragment from pages/_locales/@@ui_locale/page_name.html.
 * Put the contents of the fragment into the div.
 */

var localizeImportElements = document.querySelectorAll('[data-i18n-import]');
for (var i = 0; i < localizeImportElements.length; i++) {
  var el = localizeImportElements[i];
  fetchImport(el);
}

function fetchImport(el, opt_forceLocale) {
  var locale = chrome.i18n.getMessage('@@ui_locale');
  if (opt_forceLocale) {
    locale = opt_forceLocale;
  }
  var path = el.dataset.i18nImport;
  var url = '/pages/_locales/' + locale + '/' + path;

  // Fetch the resource.
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function(e) {
    if (this.status == 200) {
      // Place the resource into the body of the element.
      el.innerHTML = this.response;
    }
  };
  xhr.onerror = function(e) {
    fetchImport(el, 'en_US');
  };

  xhr.send();
}

/**
 * Support the data-i18n="message_name" proposed in this longstanding
 * bug: crbug.com/115800, integrating with chrome.i18n.
 */
var VARIABLES = {
  action_image: '&nbsp<img src="img/action.svg" width="20px" height="20px">&nbsp',
  shortlink: '<a href="http://g.co/tone">g.co/tone</a>'
};
var localizeElements = document.querySelectorAll('[data-i18n]');
for (var i = 0; i < localizeElements.length; i++) {
  var el = localizeElements[i];
  var key = el.dataset.i18n;
  // Replace the innerText of this element with the i18n version.
  var message = chrome.i18n.getMessage(key);
  // Parse out variables from the key.
  for (var varName in VARIABLES) {
    message = message.replace('{{' + varName + '}}', VARIABLES[varName]);
  }
  el.innerHTML = message;
}
