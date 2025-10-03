var Util = require('./util.js');

var HOUR = 1000*60*60;
/**
 * Battery logger calculates battery discharge rate at the most opportune moment.
 */
function BatteryLogger() {
  // Instantaneous values: is it charging, and the current level.
  this.isCharging = true;
  this.batteryLevel = -1;

  // Snapshot variables.
  this.snapshotLevel = -1;
  this.snapshotTime = 0;

  this.init();
}

BatteryLogger.prototype.init = function() {
  // Watch the battery charging state.
  navigator.getBattery().then(function(battery) {

    this.updateBatteryStatus_(battery);

    battery.onchargingchange = function() {
      this.updateBatteryStatus_(battery);
    }.bind(this);

    battery.onlevelchange = function() {
      this.updateBatteryStatus_(battery);
    }.bind(this);

  }.bind(this));
};


/**
 * Whether or not enough time has passed since the snapshot so that
 * the battery discharge rate should be reported.
 */
BatteryLogger.prototype.isReadyToReport = function() {
  var elapsed = new Date() - this.snapshotTime;
  return !this.isCharging && elapsed > HOUR/6;
};

/**
 * Gets the discharge rate calculated since the last snapshot. This
 * should be an estimation of how many percentage points the battery drains
 * every hour.
 */
BatteryLogger.prototype.getDischargeRate = function() {
  if (!this.isReadyToReport()) {
    console.error('Not ready to report discharge rate yet!');
    return null;
  }
  var time = new Date() - this.snapshotTime;
  var delta = this.snapshotLevel - this.batteryLevel;
  var percent = delta/time * HOUR;
  /// Return an integer in [0, 100].
  return Math.floor(percent * 100);
};

BatteryLogger.prototype.updateBatteryStatus_ = function(battery) {
  var didStartDischarging = !battery.charging && this.isCharging;
  var didStopDischarging = battery.charging && !this.isCharging;

  // Store some important variables.
  this.isCharging = battery.charging;
  this.batteryLevel = battery.level;

  // If the battery starts discharging, setup an hourly timer.
  if (didStartDischarging) {
    Util.log('BL', 'battery discharging.');
    this.snapshot();
  }
  // If the battery stops discharging, stop the timer.
  if (didStopDischarging) {
    Util.log('BL', 'battery charging.');
  }
};

/**
 * Runs a snapshot of the current battery state. In particular, capture the
 * current time and the current battery level.
 */
BatteryLogger.prototype.snapshot = function() {
  this.snapshotTime = new Date();
  this.snapshotLevel = this.batteryLevel;
};

module.exports = BatteryLogger;
