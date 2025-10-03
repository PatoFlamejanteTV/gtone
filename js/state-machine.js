var Util = require('./util.js');

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
