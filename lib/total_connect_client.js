var request = require("request");
var xmlConverter = require("xml-js");

/*
ARM_TYPE_AWAY = 0
ARM_TYPE_STAY = 1
ARM_TYPE_STAY_INSTANT = 2
ARM_TYPE_AWAY_INSTANT = 3
ARM_TYPE_STAY_NIGHT = 4

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

NORMAL = 0
BYPASSED = 1
FAULTED = 2
TROUBLE = 8
TAMPERED = 16
SUPERVISION_FAILED = 32

INVALID_PIN = -4502
INVALID_SESSION = -102
SUCCESS = 0
ARM_SUCCESS = 4500
DISARM_SUCCESS = 4500
RE_POLL_REQUIRED = 4501

NO_ERROR = 0
RE_AUTHENTICATE = 1
ERROR = 2
*/

function findFirstInArray(xmlData, targetField)
{
    var currentTree = xmlData.elements;
    while(currentTree != null) {
        for (var i = 0; i < currentTree.length; i++) {
            var child = currentTree[i];

            if (child.name === targetField) {
                return child.elements[0].text;
            }

            if(child.elements != undefined && child.elements != null){
                var retval = findFirstInArray(child, targetField);
                if(retval != undefined && retval != null)
                    return retval;
            }

        }
        currentTree = currentTree.elements;
    }

    return null;
}

function TotalConnectResultErrorCode(data, callback)
{
    var resultCode = findFirstInArray(data, 'ResultCode');
    var error = null;
    if(resultCode === null) {
        error = new Error('unable to retrieve result code');
    }
    else{
        switch (resultCode) {
            case '0':
            case '4500':
                //success

                break;
            case '-102'://this means the session ID is invalid, need to re-auth
                return 1;
            case '4101': //We are unable to connect to the security panel. Please try again later or contact support
            case '4108': //Panel not connected with Virtual Keypad. Check Power/Communication failure
            case '-4002': //The specified location is not valid
            case '-4108': //Cannot establish a connection at this time. Please contact your Security Professional if the problem persists.
            default:
                error = new Error('command error\'ed out from panel with a result of: ' + resultCode);
                break;
        }

    }

    if(error != null) {
        callback(error, false);
        return 2;
    }
    else {
        return 0;
    }
}


function TotalConnectClient(log, config) {
    this.log = log;
    this.config = config;

    this.username = this.config["username"];
    this.password = this.config["password"];
    this.applicationID = "14588";
    this.applicationVersion = "1.0.34";

}

//callback is the method to callback when the full call cycle is completed.
//for any call to request data, there is a call to login, then get details, then the actual call to get the requested data
//may not be necessary to call get details every time. could probably save some cycles and only call once
//will add some logging to test

TotalConnectClient.prototype.Login = function(callback, authenticatedMethod)
{
     var that = this;

    // If the session is initialized and within 4 minutes, no need to re-authenticate
    if(that.sessionDateTime != null && ((that.sessionDateTime + 240000) > Date.now())) {
        that.log('session already initialized');
        that.GetSessionDetails(callback, authenticatedMethod, that);
        return;
    }

    request.post({
        url: "https://rs.alarmnet.com/TC21api/tc2.asmx/AuthenticateUserLogin",
        form:{ userName: that.username,
            password: that.password,
            ApplicationID: that.applicationID,
            ApplicationVersion: that.applicationVersion}
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {

            // var result = xml.parse(body);
            var result = JSON.parse(xmlConverter.xml2json(body, {compact: false, spaces: 4}));

            var TotalConnectError = TotalConnectResultErrorCode(result, callback);
            if(TotalConnectError == 1) {
                that.log('re-auth needed from response -102 in auth method, failing.');
                callback(new Error('re-auth needed from response -102 in auth method, failing.'));
            }
            else if(TotalConnectError == 2){
                return;
            }
            else {

                var sessionID = findFirstInArray(result, 'SessionID');
                if (sessionID != null) {
                    that.sessionToken = sessionID;
                    that.sessionDateTime = Date.now();
                    that.log('session: ' + that.sessionToken);

                    that.GetSessionDetails(callback, authenticatedMethod, that);
                }
                else {
                    that.log('unable to get session');
                    callback(new Error('unable to get session'), false);
                }
            }

        }
        else {
            that.log("Error getting session (status code %s): %s, %s", response.statusCode, err, body);
            callback(err);
        }
    }.bind(this));

}

TotalConnectClient.prototype.GetSessionDetails = function(callback, authenticatedMethod, that) {

    request.post({
        url: "https://rs.alarmnet.com/TC21api/tc2.asmx/GetSessionDetails",
        form:{ SessionID: that.sessionToken,
            ApplicationID: that.applicationID,
            ApplicationVersion: that.applicationVersion}
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {

            var result = JSON.parse(xmlConverter.xml2json(body, {compact: false, spaces: 4}));

            var TotalConnectError = TotalConnectResultErrorCode(result, callback)
            if(TotalConnectError == 1) {
                that.log('re-auth needed from response -102 in auth method...');
                that.Login(callback, authenticatedMethod);
            }
            else if(TotalConnectError == 2){
                return;
            }
            else {

                that.log("---- TEST ----");
                that.locationID = findFirstInArray(result, 'LocationID');
                that.log('Got LocationID: ' + that.locationID);

                if (that.locationID === null) {
                    that.log('Unable to get LocationID');
                    callback(new Error('Unable to get LocationID'), false);
                    return;
                }

                that.deviceID = findFirstInArray(result, 'DeviceID');
                that.log('Got DeviceID: ' + that.deviceID);

                if (that.deviceID === null) {
                    that.log('Unable to get DeviceID');
                    callback(new Error('Unable to get DeviceID'), false);
                    return;
                }

                authenticatedMethod(callback, that);
            }

        }
        else {
            that.log("Error getting location details (status code: %s): %s, %s", response.statusCode, err, body);
            callback(err);
        }
    }.bind(this));

}

TotalConnectClient.prototype.GetCurrentState = function(callback) {
    //Start with login method to validate credentials, and pass off to authenticated method afterwards
    this.Login(callback, this.GetCurrentStateAuthenticated);
}

TotalConnectClient.prototype.GetCurrentStateAuthenticated = function(callback, that) {
    //Call
    that.log("Authenticated and getting current state");

    request.post({
        url: "https://rs.alarmnet.com/TC21api/tc2.asmx/GetPanelMetaDataAndFullStatusEx",
        form:{
            SessionID: that.sessionToken,
            LocationID: that.locationID,
            LastSequenceNumber: '0',
            LastUpdatedTimestampTicks: '0',
            PartitionID: '1'
        }
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {

            var result = JSON.parse(xmlConverter.xml2json(body, {compact: false, spaces: 4}));
            var TotalConnectError = TotalConnectResultErrorCode(result, callback)
            if(TotalConnectError == 1) {
                that.log('re-auth needed from response -102 in auth method...');
                that.Login(callback, that.tcIsArmedAuthenticated);
            }
            else if(TotalConnectError == 2){
                return;
            }
            else {

                var armingState = findFirstInArray(result, 'ArmingState');

                if (armingState === null) {
                    that.log('Unable to get ArmingState');
                    callback(new Error('Unable to get ArmingState'), false);
                    return;
                }

                that.log('Got value for ArmingState: ' + armingState);

                var currentState = null;
                switch (armingState) {
                    case "10200":
                      currentState = "disarmed";
                      break;
                    case "10201":
                      currentState = "armed_away";
                      break;
                    case "10202":
                      currentState = "armed_away_bypass";
                      break;
                    case "10203":
                      currentState = "armed_stay";
                      break;
                    case "10204":
                      currentState = "armed_stay_bypass";
                      break;
                    case "10205":
                      currentState = "armed_away_instant";
                      break;
                    case "10206":
                      currentState = "armed_away_instant_bypass";
                      break;
                    case "10209":
                      currentState = "armed_stay_instant";
                      break;
                    case "10210":
                      currentState = "armed_stay_instant_bypass";
                      break;
                    case "10211":
                      currentState = "disarmed_bypass";
                      break;
                    case "10218":
                      currentState = "armed_stay_night";
                      break;
                    case "10223":
                      currentState = "armed_custom_bypass";
                      break;
                    case "10307":
                      currentState = "arming";
                      break;
                    case "10308":
                      currentState = "disarming";
                      break;
                    default:
                      currentState = "disarmed";
                      break;
                }
                that.log('Got current state: ' + currentState);
                callback(null, currentState);
            }
        }
        else {
            that.log("Error getting current state (status code: %s): %s, %s", response.statusCode, err, body);
            callback(err);
        }
    }.bind(this));
}

TotalConnectClient.prototype.Disarm = function(callback) {
    this.Login(callback, this.DisarmAuthenticated);
}

TotalConnectClient.prototype.DisarmAuthenticated = function(callback, that) {

    that.log("Authenticatd and disarming");

    request.post({
        url: "https://rs.alarmnet.com/TC21api/tc2.asmx/DisarmSecuritySystem",
        form:{
            SessionID: that.sessionToken,
            LocationID: that.locationID,
            DeviceID: that.deviceID,
            UserCode: '-1'
        }
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {

            var result = JSON.parse(xmlConverter.xml2json(body, {compact: false, spaces: 4}));
            var TotalConnectError = TotalConnectResultErrorCode(result, callback);
            if(TotalConnectError == 1) {
                that.log('re-auth needed from response -102 in auth method...');
                that.Login(callback, that.tcArmAuthenticated);
                return;
            }
            else if(TotalConnectError == 2){
                return;
            }
            else {
                that.log('System is now disarmed');

                callback(null, "disarmed");
            }
        }
        else {
            that.log("Error disarming (status code: %s): %s, %s", response.statusCode, err, body);
            callback(err);
        }
    }.bind(this));
}

TotalConnectClient.prototype.Arm = function(callback) {
    this.Login(callback, this.ArmAuthenticated);
}

TotalConnectClient.prototype.ArmAuthenticated = function(callback, that) {

    that.log("Authenticated and arming");

    request.post({
        url: "https://rs.alarmnet.com/TC21api/tc2.asmx/ArmSecuritySystem",
        form:{
            SessionID: that.sessionToken,
            LocationID: that.locationID,
            DeviceID: that.deviceID,
            ArmType: '1',
            UserCode: '-1'
        }
    }, function(err, response, body) {

        if (!err && response.statusCode == 200) {

            var result = JSON.parse(xmlConverter.xml2json(body, {compact: false, spaces: 4}));
            var TotalConnectError = TotalConnectResultErrorCode(result, callback);
            if(TotalConnectError == 1) {
                that.log('re-auth needed from response -102 in auth method...');
                that.Login(callback, that.tcArmAuthenticated);
            }
            else if(TotalConnectError == 2){
                return;
            }
            else {
                that.log('System is now armed');

                callback(null, "armed");
            }
        }
        else {
            that.log("Error arming (status code: %s): %s, %s", response.statusCode, err, body);
            callback(err);
        }
    }.bind(this));
}

module.exports = TotalConnectClient;