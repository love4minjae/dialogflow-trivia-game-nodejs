// Copyright 2017, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

/**
 * Utility class to load questions and prompts into a Firebase database
 */

// https://firebase.google.com/docs/database/
const firebaseAdmin = require('firebase-admin');
// Import local JSON file as Cloud Function dependency
// const cert = require('path/to/serviceAccountKey.json');
const cert = require('/Users/tjkwon/Documents/yongsantrivia-firebase-adminsdk-318ly-f0f6b0d55b.json');

const DATABASE_DATA_KEY = 'data2';
const DATABASE_CONFIG_KEY = 'config';

// Initialize firebase database access
firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(cert),
  databaseURL: 'https://yongsantrivia.firebaseio.com'
});

var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/sheets.googleapis.com-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'sheets.googleapis.com-nodejs-quickstart.json';

// Load client secrets from a local file.
fs.readFile('client_secret.json', function processClientSecrets(err, content) {
  if (err) {
    console.log('Error loading client secret file: ' + err);
    return;
  }
  // Authorize a client with the loaded credentials, then call the
  // Google Sheets API.
  authorize(JSON.parse(content), readSheets);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function(err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client);
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function(code) {
    rl.close();
    oauth2Client.getToken(code, function(err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
}

function readSheets(auth) {
  readMainConfig(auth);
}

var tabConfig = {};
var configs = {};
var data = {};

function readMainConfig(auth) {
  var sheets = google.sheets('v4');
  sheets.spreadsheets.values.get({
    auth: auth,
    spreadsheetId: '1yCNr7aD9zppjEAiTMJPBUYBusRV-Q6Bpi1jlHkspNCs',
    range: 'Main Config!A8:B'
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var mainConfig = {};
    var rows = response.values;
    if (rows.length == 0) {
      console.log('No data found.');
    } else {
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        mainConfig[row[0]] = row[1];
      }
    }
    // console.log(mainConfig);
    configs['title'] = mainConfig['Title'];
    configs['wrongAnswerQuitCount'] = mainConfig['WrongAnswerQuitCount'];
    configs['questionsPerGame'] = mainConfig['questionsPerGame'];
    configs['rounds'] = [];
    readTabConfig(auth);
  });
}

function readTabConfig(auth) {
  var sheets = google.sheets('v4');
  sheets.spreadsheets.values.get({
    auth: auth,
    spreadsheetId: '1yCNr7aD9zppjEAiTMJPBUYBusRV-Q6Bpi1jlHkspNCs',
    range: 'Tab Config!A8:E'
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var rows = response.values;
    if (rows.length == 0) {
      console.log('No data found.');
    } else {
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var tabName = row[0];
        tabConfig[tabName] = {};
        // tabConfig[tabName]['tab'] = row[0];
        tabConfig[tabName]['title'] = row[1];
        tabConfig[tabName]['type'] = row[2];
        tabConfig[tabName]['round'] = row[3];
        tabConfig[tabName]['questionsPerRound'] = row[4];

        if (tabConfig[tabName]['round'] >= 0) {
          configs['rounds'][tabConfig[tabName]['round']] = tabName;
        }
      }
    }
    // console.log(tabConfig);
    readData(auth, 0);
  });
}

function readData(auth, index) {
  var sheets = google.sheets('v4');
  sheets.spreadsheets.values.get({
    auth: auth,
    spreadsheetId: '1yCNr7aD9zppjEAiTMJPBUYBusRV-Q6Bpi1jlHkspNCs',
    range: configs['rounds'][index] + '!A8:E'
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var rows = response.values;
    if (rows.length == 0) {
      console.log('No data found.');
    } else {
      var tab = {'questions': [], 'answers': [], 'followUps': [], 'dictionary': [], 'config': {}};
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        // console.log(row[0]);
        tab['questions'][i] = row[0] || '';
        tab['followUps'][i] = row[4] || '';
        tab['answers'][i] = [];
        tab['answers'][i][0] = row[1] || '';
        tab['answers'][i][1] = row[2] || '';
        tab['answers'][i][2] = row[3] || '';
        tab['config']['title'] = tabConfig[configs['rounds'][index]]['title'];
        tab['config']['questionsPerRound'] = tabConfig[configs['rounds'][index]]['questionsPerRound'];
      }
      // console.log(tab);
      data[configs['rounds'][index]] = tab;
    }
    if (index >= configs['rounds'].length - 1) {
      // Wait for data to be updated before exiting app
      firebaseAdmin.database().ref(DATABASE_CONFIG_KEY)
      .on('value', (data) => {
        if (data && data.val()) {
          console.log('Database updated for configuration');
        }
      });
      // Load the configurations
      firebaseAdmin.database().ref(DATABASE_CONFIG_KEY).update(configs).catch(function (error) {
        console.error(error);
      });

      // Wait for data to be updated before exiting app
      firebaseAdmin.database().ref(DATABASE_DATA_KEY)
      .on('value', (data) => {
        if (data && data.val()) {
          console.log('Database updated for data');
        }
      });

      // Load the questions and answers
      firebaseAdmin.database().ref(DATABASE_DATA_KEY).update(data).catch(function (error) {
        console.error(error);
      });
    } else {
      readData(auth, index + 1);
    }
  });
}
