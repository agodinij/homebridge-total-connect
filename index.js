var Service, Characteristic;
var TotalConnectClient =  require('./lib/total_connect_client');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-total-connect-security", "TotalConnectSecurity", TotalConnectSecurityAccessory);
}

/*
{
        "accessory": "TotalConnectSecurity",
        "name": "Security System",
        "username": "<username>",
        "password": "<password>",
        "manufacturer": "Honeywell",
        "model": "VISTA 21-iP",
        "serial": "12345",
        "hardware": "1.2.3"
   }
* */

// SecuritySystemCurrentState
this.currentStayArm = Characteristic.SecuritySystemCurrentState.STAY_ARM;  // 0
this.currentAwayArm = Characteristic.SecuritySystemCurrentState.AWAY_ARM; // 1
this.currentNightArm = Characteristic.SecuritySystemCurrentState.NIGHT_ARM; // 2
this.currentDisarmed = Characteristic.SecuritySystemCurrentState.DISARMED; // 3
this.currentTriggered = Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED; // 4

// SecuritySystemTargetState
this.targetStayArm = Characteristic.SecuritySystemTargetState.STAY_ARM; // 0
this.targetAwayArm = Characteristic.SecuritySystemTargetState.AWAY_ARM; // 1
this.targetNightArm = Characteristic.SecuritySystemTargetState.NIGHT_ARM; // 2
this.targetDisarm = Characteristic.SecuritySystemTargetState.DISARM; // 3

// StatusFault
this.noFault = Characteristic.StatusFault.NO_FAULT; // 0
this.generalFault = Characteristic.StatusFault.GENERAL_FAULT; // 1

// StatusTampered
this.notTampered = Characteristic.StatusTampered.NOT_TAMPERED; // 0
this.tampered = Characteristic.StatusTampered.TAMPERED; // 1

function TotalConnectSecurityAccessory(log, config) {

    this.log = log;
    this.name = config["name"];
    this.manufacturer = config["manufacturer"] || "Honeywell";
    this.model = config["model"] || "Not Specified";
    this.serial = config["serial"] || "Not Specified";
    this.firmware = require('./package.json').version;
    if (config["hardware"]) {
        this.hardware = config["hardware"];
    }

    this.client = new TotalConnectClient(this.log, config);

    this.accessoryInformationService = new Service.AccessoryInformation();

    this.accessoryInformationService
        .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
        .setCharacteristic(Characteristic.Model, this.model)
        .setCharacteristic(Characteristic.Name, this.name)
        .setCharacteristic(Characteristic.SerialNumber, this.serial)
        .setCharacteristic(Characteristic.FirmwareRevision, this.firmware);

    if (this.hardware) {
        accessoryInformationService
            .setCharacteristic(Characteristic.HardwareRevision, this.hardware);
    }

    this.securitySystemService = new Service.SecuritySystem();

    this.securitySystemService
        .setCharacteristic(Characteristic.Name, this.name);

    this.securitySystemService
        .getCharacteristic(Characteristic.SecuritySystemCurrentState)
        .on('get', this.getSecuritySystemCurrentState.bind(this));

    this.securitySystemService
        .getCharacteristic(Characteristic.SecuritySystemTargetState)
        .on('get', this.getSecuritySystemTargetState.bind(this))
        .on('set', this.setSecuritySystemTargetState.bind(this));
}

TotalConnectSecurityAccessory.prototype.getSecuritySystemCurrentState = function(callback) {
    this.log("Getting current state");
    this.client.tcIsArmed(callback);
    switch (state) {
        case "armed_away":
        case "armed_away_bypass":
        case "armed_away_instant":
        case "armed_away_instant_bypass":
          this.log("Current state is armed away");
          callback(null, this.currentAwayArm);
          break;
        case "armed_stay":
        case "armed_stay_bypass":
        case "armed_stay_instant":
        case "armed_stay_instant_bypass":
          this.log("Target state is armed stay");
          this.log("Current state is armed stay");
          callback(null, this.currentStayArm);
          break;
        case "armed_stay_night":
          this.log("Current state is armed night");
          callback(null, this.currentNightArm);
          break;
        case "disarmed":
        case "disarmed_bypass":
          this.log("Current state is disarmed");
          callback(null, this.currentDisarmed);
          break;
        case "triggered":
          this.log("Current state is triggered");
          callback(null, this.currentTriggered);
          break;
        default:
          this.log("Current state is disarmed");
          callback(null, this.currentDisarmed);
          break;
    }
}

TotalConnectSecurityAccessory.prototype.getSecuritySystemTargetState = function(callback) {
    this.log("Getting target state");
    this.client.GetCurrentState(callback);
    switch (state) {
        case "armed_away":
        case "armed_away_bypass":
        case "armed_away_instant":
        case "armed_away_instant_bypass":
          this.log("Target state is armed away");
          callback(null, this.targetAwayArm);
          break;
        case "armed_stay":
        case "armed_stay_bypass":
        case "armed_stay_instant":
        case "armed_stay_instant_bypass":
          this.log("Target state is armed stay");
          callback(null, this.targetStayArm);
          break;
        case "armed_stay_night":
          this.log("Target state is armed night");
          callback(null, this.targetNightArm);
          break;
        case "disarmed":
        case "disarmed_bypass":
          this.log("Target state is disarmed");
          callback(null, this.targetDisarm);
          break;
        default:
          this.log("Target state is disarmed");
          callback(null, this.targetDisarm);
          break;
    }
}

TotalConnectSecurityAccessory.prototype.setSecuritySystemTargetState = function(state, callback) {
    switch (state) {
        case this.targetStayArm:
          this.log("Setting target state to armed stay");
          this.client.tcArm(stay, callback);
          break;
        case this.targetAwayArm:
          this.log("Setting target state to armed away");
          this.client.tcArm(away, callback);
          break;
        case this.targetNightArm:
          this.log("Setting target state to armed night");
          this.client.tcArm(night, callback);
          break;
        case this.targetDisarm:
          this.log("Setting target state to disarmed");
          this.client.tcDisarm(callback);
          break;
        default:
          this.log("Setting target state to disarmed");
          this.client.tcDisarm(callback);
          break;
      }
}

TotalConnectSecurityAccessory.prototype.getServices = function() {
    return [this.accessoryInformationService, this.securitySystemService];
}