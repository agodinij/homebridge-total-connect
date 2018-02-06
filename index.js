var Service, Characteristic;
var TC_Module =  require('./lib/tc_connect');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-total-connect-security", "TotalConnectSecurity", TC2Accessory);
}

/*
{
        "accessory": "TotalConnectSecurity",
        "name": "Security System",
        "username": "my_username",
        "password": "xxx",
        "appID": "14588",
        "version": "1.0.0",
        "manufacturer": "Honeywell",
        "model": "VISTA 21-iP",
        "serial": "12345",
        "hardware": "1.2.3"
   }
* */

function TC2Accessory(log, config) {

    this.log = log;
    this.name = config["name"];
    this.manufacturer = config["manufacturer"] || "Honeywell";
    this.model = config["model"] || "Not Specified";
    this.serial = config["serial"] || "Not Specified";
    this.firmware = require('./package.json').version;
    if (config["hardware"]) {
        this.hardware = config["hardware"];
    }

    this.tcService = new TC_Module(this.log, config);

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


    this.securitySystemService
        .getCharacteristic(Characteristic.On)
        .on("get", this.getState.bind(this))
        .on("set", this.setState.bind(this));
}

TC2Accessory.prototype.getSecuritySystemCurrentState = function(callback) {
    this.log("Getting current state...");

    this.tcService.tcIsArmed(callback);

}

TC2Accessory.prototype.getSecuritySystemTargetState = function(callback) {
    this.log("Getting target state...");

    this.tcService.tcIsArmed(callback);

}

TC2Accessory.prototype.setSecuritySystemTargetState = function(state, callback) {

    var isOn = state;

    this.log("Setting target state to %s", isOn ? "on" : "off");

    if(isOn)
        this.tcService.tcArm(callback);
    else
        this.tcService.tcDisarm(callback);

}

TC2Accessory.prototype.getServices = function() {
    return [this.accessoryInformationService, this.securitySystemService];
}