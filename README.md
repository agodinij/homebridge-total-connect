# homebridge-total-connect

Homebridge plugin allowing basic control of Total Connect 2.0 security systems.

# Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install homebridge-total-connect-security using: `npm install -g homebridge-total-connect`
3. Update the configuration file.

# Configuration

    "accessories": [
      {
        "accessory": "TotalConnectSecurity",
        "name": "Security System",
        "username": "<username>",
        "password": "<password>",
        "manufacturer": "Honeywell",
        "model": "VISTA 21-iP",
        "serial_number": "12345",
        "hardware_revision": "1.2.3"
      }
    ]

Parameter | Required | Modifiable | Comment
:--- | :---: | :---: | :---
accessory | yes | no | Must be `TotalConnectSecurity`
name | no | yes | "Security System" will be shown in HomeKit if not specified
username | yes | yes | Total Connect 2.0 username
password | yes | yes | Total Connect 2.0 password
manufacturer | no | yes | "Honeywell" will be shown in HomeKit if not specified
model | no | yes | "Not Specified" will be shown in HomeKit if not specified
serial_number | no | yes | "Not Specified" will be shown in HomeKit if not specified
hardware_revision | no | yes | Not shown in HomeKit if not specified

# Notes

This only supports one panel and one partition at this time.
