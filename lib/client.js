var request = require("request");
var xmlConverter = require("xml-js");

/*
ARM_TYPE
    ARM_TYPE_AWAY = 0
    ARM_TYPE_STAY = 1
    ARM_TYPE_STAY_INSTANT = 2
    ARM_TYPE_AWAY_INSTANT = 3
    ARM_TYPE_STAY_NIGHT = 4

ARMING_STATE
    DISARMED = 10200
    DISARMED_BYPASS = 10211
    ARMED_AWAY = 10201
    ARMED_AWAY_BYPASS = 10202
    ARMED_AWAY_INSTANT = 10205
    ARMED_AWAY_INSTANT_BYPASS = 10206
    ARMED_CUSTOM_BYPASS = 10223
    ARMED_STAY = 10203
    ARMED_STAY_BYPASS = 10204
    ARMED_STAY_INSTANT = 10209
    ARMED_STAY_INSTANT_BYPASS = 10210
    ARMED_STAY_NIGHT = 10218
    ARMING = 10307
    DISARMING = 10308

ZONE_STATUS
    NORMAL = 0
    BYPASSED = 1
    FAULTED = 2
    TROUBLE = 8
    TAMPERED = 16
    SUPERVISION_FAILED = 32

RESULT_CODE
    SUCCESS = 0
    SUCCESS = 4500

    INVALID_SESSION = -102

    ??? = -50002
    INVALID_PIN = -4502
    INVALID_LOCATION = -4002
    UNABLE_TO_CONNECT = -4108
    UNABLE_TO_CONNECT = 4101
    NO_VIRTUAL_KEYPAD = 4108
    RE_POLL_REQUIRED = 4501

ERROR
    NO_ERROR = 0
    RE_AUTHENTICATE = 1
    ERROR = 2
*/

function findFirstInArray(xmlData, targetField) {
    var currentTree = xmlData.elements;
    while (currentTree != null) {
        for (var i = 0; i < currentTree.length; i++) {
            var child = currentTree[i];

            if (child.name === targetField) {
                return child.elements[0].text;
            }

            if (child.elements != undefined && child.elements != null) {
                var value = findFirstInArray(child, targetField);
                if  (value != undefined && value != null) {
                    return value;
                }
            }

        }
        currentTree = currentTree.elements;
    }
    return null;
}


function checkResultCode(data, callback) {
    var resultCode = findFirstInArray(data, "ResultCode");
    var statusCode = null;
    var error = null;
    if (resultCode === null) {
        statusCode = 2;
        error = new Error("Unable to retrieve result code");
    }
    else {
        switch (resultCode) {
            case "0":
            case "4500":
                statusCode = 0;
                break;
            case "-102":
                statusCode = 1;
                break;
            case "-4502":
            case "-4002":
            case "-4108":
            case "4101":
            case "4108":
            case "4501":
            default:
                statusCode = 2;
                error = new Error("Command failed with a result of: " + resultCode);
                break;
        }
    }

    if (error != null) {
        callback(error, false);
        return statusCode;
    }
    else {
        return statusCode;
    }
}


function client(log, config) {

    this.log = log;
    this.config = config;
    this.username = this.config["username"];
    this.password = this.config["password"];
    this.applicationID = "14588";
    this.applicationVersion = "1.0.34";

}


client.prototype.login = function(callback, method, armType) {
    var that = this;

    that.log("Logging in");

    if (that.sessionDateTime != null && ((that.sessionDateTime + 240000) > Date.now())) {
        that.log("Session already initialized");
        that.log("Using existing SessionID: " + that.sessionToken);
        that.getSessionDetails(callback, method, that, armType);
        return;
    }

    request.post({
        url: "https://rs.alarmnet.com/TC21api/tc2.asmx/AuthenticateUserLogin",
        form:{
            userName: that.username,
            password: that.password,
            ApplicationID: that.applicationID,
            ApplicationVersion: that.applicationVersion
        }
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {

            var result = JSON.parse(xmlConverter.xml2json(body, {compact: false, spaces: 4}));

            var statusCode = checkResultCode(result, callback);
            if (statusCode == 1) {
                that.log("Invalid session");
                callback(new Error("Invalid sesson, re-authentication required"));
            }
            else if (statusCode == 2){
                return;
            }
            else {

                var sessionID = findFirstInArray(result, "SessionID");
                if (sessionID != null) {
                    that.sessionToken = sessionID;
                    that.sessionDateTime = Date.now();
                    that.log("Got SessionID: " + that.sessionToken);

                    that.getSessionDetails(callback, method, that, armType);
                }
                else {
                    that.log("Unable to get session");
                    callback(new Error("Unable to get session"), false);
                }
            }

        }
        else {
            that.log("Error getting sessionID (status code %s): %s, %s", response.statusCode, err, body);
            callback(err);
        }
    }.bind(this));
}


client.prototype.getSessionDetails = function(callback, method, that, armType) {

    that.log("Authenticated and getting session details");

    request.post({
        url: "https://rs.alarmnet.com/TC21api/tc2.asmx/GetSessionDetails",
        form:{
            SessionID: that.sessionToken,
            ApplicationID: that.applicationID,
            ApplicationVersion: that.applicationVersion
        }
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {

            var result = JSON.parse(xmlConverter.xml2json(body, {compact: false, spaces: 4}));

            var statusCode = checkResultCode(result, callback)
            if (statusCode == 1) {
                that.log("Re-authenticating");
                that.login(callback, method, armType);
            }
            else if (statusCode == 2){
                return;
            }
            else {
                that.locationID = findFirstInArray(result, "LocationID");
                that.log("Got LocationID: " + that.locationID);

                if (that.locationID === null) {
                    that.log("Unable to get LocationID");
                    callback(new Error("Unable to get LocationID"), false);
                    return;
                }

                that.deviceID = findFirstInArray(result, "DeviceID");
                that.log("Got DeviceID: " + that.deviceID);

                if (that.deviceID === null) {
                    that.log("Unable to get DeviceID");
                    callback(new Error("Unable to get DeviceID"), false);
                    return;
                }

                method(callback, that, armType);
            }

        }
        else {
            that.log("Error getting location details (status code: %s): %s, %s", response.statusCode, err, body);
            callback(err);
        }
    }.bind(this));
}


client.prototype.getStatus = function(callback) {
    this.log("Getting status");

    this.login(callback, this.getStatusAuthenticated, null);
}


client.prototype.getStatusAuthenticated = function(callback, that, armType) {

    that.log("Authenticated and getting arming state");

    request.post({
        url: "https://rs.alarmnet.com/TC21api/tc2.asmx/GetPanelMetaDataAndFullStatusEx",
        form:{
            SessionID: that.sessionToken,
            LocationID: that.locationID,
            LastSequenceNumber: "0",
            LastUpdatedTimestampTicks: "0",
            PartitionID: "1"
        }
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {

            var result = JSON.parse(xmlConverter.xml2json(body, {compact: false, spaces: 4}));
            var statusCode = checkResultCode(result, callback)
            if (statusCode == 1) {
                that.log("Re-authenticating");
                that.login(callback, that.getStatusAuthenticated, null);
            }
            else if (statusCode == 2){
                return;
            }
            else {

                var armingState = findFirstInArray(result, "ArmingState");

                if (armingState === null) {
                    that.log("Unable to get ArmingState");
                    callback(new Error("Unable to get ArmingState"), null);
                    return;
                }

                that.log("Got value for ArmingState: " + armingState);

                var status = null;
                switch (armingState) {
                    case "10200":
                      status = "disarmed";
                      break;
                    case "10201":
                      status = "armed_away";
                      break;
                    case "10202":
                      status = "armed_away_bypass";
                      break;
                    case "10203":
                      status = "armed_stay";
                      break;
                    case "10204":
                      status = "armed_stay_bypass";
                      break;
                    case "10205":
                      status = "armed_away_instant";
                      break;
                    case "10206":
                      status = "armed_away_instant_bypass";
                      break;
                    case "10209":
                      status = "armed_stay_instant";
                      break;
                    case "10210":
                      status = "armed_stay_instant_bypass";
                      break;
                    case "10211":
                      status = "disarmed_bypass";
                      break;
                    case "10218":
                      status = "armed_stay_night";
                      break;
                    case "10223":
                      status = "armed_custom_bypass";
                      break;
                    case "10307":
                      status = "arming";
                      break;
                    case "10308":
                      status = "disarming";
                      break;
                    default:
                      status = "disarmed";
                      break;
                }
                that.log("Got status: " + status);
                callback(null, status);
            }
        }
        else {
            that.log("Error getting arming state (status code: %s): %s, %s", response.statusCode, err, body);
            callback(err);
        }
    }.bind(this));
}


client.prototype.setStatus = function(callback, state) {
    var method = null;
    var armType = null;
    switch (state) {
        case "away":
          method = this.armAuthenticated;
          armType = "0";
          break;
        case "stay":
          method = this.armAuthenticated;
          armType = "1";
          break;
        case "stay_instant":
          method = this.armAuthenticated;
          armType = "2";
          break;
        case "away_instant":
          method = this.armAuthenticated;
          armType = "3";
          break;
        case "stay_night":
          method = this.armAuthenticated;
          armType = "4";
          break;
        case "disarm":
        default:
          method = this.disarmAuthenticated;
          armType = null;
          break;
    }
    this.login(callback, method, armType);
}


client.prototype.armAuthenticated = function(callback, that, armType) {

    that.log("Authenticated and arming");
    that.log("Setting arming state to: " + armType);

    request.post({
        url: "https://rs.alarmnet.com/TC21api/tc2.asmx/ArmSecuritySystem",
        form:{
            SessionID: that.sessionToken,
            LocationID: that.locationID,
            DeviceID: that.deviceID,
            ArmType: armType,
            UserCode: "-1"
        }
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {

            var result = JSON.parse(xmlConverter.xml2json(body, {compact: false, spaces: 4}));
            var statusCode = checkResultCode(result, callback);
            if (statusCode == 1) {
                that.log("Re-authenticating");
                that.login(callback, that.armAuthenticated, armType);
            }
            else if (statusCode == 2){
                return;
            }
            else {
                that.log("System is now armed");
                callback(null, "armed");
            }
        }
        else {
            that.log("Error arming (status code: %s): %s, %s", response.statusCode, err, body);
            callback(err);
        }
    }.bind(this));
}


client.prototype.disarmAuthenticated = function(callback, that, armType) {

    that.log("Authenticatd and disarming");

    request.post({
        url: "https://rs.alarmnet.com/TC21api/tc2.asmx/DisarmSecuritySystem",
        form:{
            SessionID: that.sessionToken,
            LocationID: that.locationID,
            DeviceID: that.deviceID,
            UserCode: "-1"
        }
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {

            var result = JSON.parse(xmlConverter.xml2json(body, {compact: false, spaces: 4}));
            var statusCode = checkResultCode(result, callback);
            if (statusCode == 1) {
                that.log("Re-authenticating");
                that.login(callback, that.disarmAuthenticated, null);
                return;
            }
            else if (statusCode == 2){
                return;
            }
            else {
                that.log("System is now disarmed");
                callback(null, "disarmed");
            }
        }
        else {
            that.log("Error disarming (status code: %s): %s, %s", response.statusCode, err, body);
            callback(err);
        }
    }.bind(this));
}

module.exports = client;