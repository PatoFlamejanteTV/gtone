var button = $('.slidetoggle')
var label = $('#settings label');
var activeLabel = $('#settings label .active');
var inactiveLabel = $('#settings label .inactive');

var STATE_INITIALIZING = 'INITIALIZING';
var STATE_DISABLED = 'DISABLED';

function toggle() {
  var isDisabled = !button.hasClass('on');
  if (isDisabled) {
    newState = STATE_INITIALIZING;
    enable();
  } else {
    newState = STATE_DISABLED;
    disable();
  }
  chrome.storage.local.set({state: newState});
}

function enable() {
  button.addClass('on');
  label.removeClass('red');
  activeLabel.show();
  inactiveLabel.hide();
}

function disable() {
  button.removeClass('on');
  label.addClass('red')
  inactiveLabel.show();
  activeLabel.hide();
}

button.bind('click', toggle);
window.addEventListener('keydown', onKey);

// Set the slider to the right initial setting.
updateButtonState();

// And then listen for state changes.
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if ('state' in changes) {
    updateButtonState();
  }
});

function updateButtonState() {
  chrome.storage.local.get(['state'], function(result) {
    if (result.state == STATE_DISABLED) {
      disable();
    } else {
      enable();
    }
  });
}

function onKey(e) {
  if (e.keyCode == 13) { // Enter.
    toggle();
  }
}
