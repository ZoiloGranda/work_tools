const express = require('express');
const app = express()
const http = require('http').Server(app)
const port = 8080;
const https = require('https');
const fs = require('fs');
const readline = require('readline');
const { parse }= require('node-html-parser');

var jsonRoot = '';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function processHandler(){
  askUrl().then(function () {
    return startProcess()
  }).then(function(rawData){
    return parseHtml(rawData)
  }).then(function (jsonsUrls) {
    return generateJsonsUrls(jsonsUrls)
  }).then(function (filesList) {
    return getJsons(filesList)
  }).then(function (requestsArray) {
    return sendAllRequests(requestsArray)
  }).then(function (jsonDataArray) {
    return writeAllJsonFiles(jsonDataArray)
  }).then(function (allSavedFiles) {
    process.exit()
  }).catch(function (e) {
    console.log(e);
  });
};

function askUrl(){
  return new Promise(function(resolve, reject) {
    let consoleQuestion = 'Inserta la url al directorio raiz de los jsons EJ: "https://project-dev.server.com/web/sqlite/json/" :\n'
    rl.question(consoleQuestion, (userInput) => {
      console.log({userInput});
      jsonRoot = userInput.endsWith('/') ? userInput : userInput+'/';
      rl.close();
      resolve()
    });
  });
};

function startProcess() {
  return new Promise(function(resolve, reject) {
    https.get(jsonRoot, (res) => {
      console.log(`${jsonRoot} statusCode: ${res.statusCode}`);
      var rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        resolve(rawData)
      }) ;
    }).on('error', (e) => {
      console.log('hay un error');
      reject(e)
    });
  });
};

function parseHtml(rawData) {
  return new Promise(function(resolve, reject) {
    const rootDir = parse(rawData);
    var jsonsUrls = rootDir.querySelectorAll('a');
    resolve(jsonsUrls)
  });
};

function generateJsonsUrls(jsonsUrls){
  return new Promise(function(resolve, reject) {
    var filesList =[];
    for (var variable in jsonsUrls) {
      if (jsonsUrls.hasOwnProperty(variable)) {
        if (jsonsUrls[variable].text.indexOf(".json")>-1) {
          filesList.push(jsonsUrls[variable].text)
        };
      };
    };
    resolve(filesList);
  });
};

function getJsons(filesList){
  return new Promise(function(resolve, reject) {
    var requestsArray = [];
    for (var i = 0; i < filesList.length; i++){
      requestsArray.push(sendRequest(filesList[i]))
    }
    resolve(requestsArray)
  });
};

function sendAllRequests(requestsArray) {
  return new Promise(function(resolve, reject) {
    return Promise.all(requestsArray).then(function (jsonData) {
      var jsonDataArray = [];
      jsonData.forEach(function(element) {
        jsonDataArray.push(writeJsonFile(element.rawData,element.jsonUrl))
      })
      resolve(jsonDataArray)
    }).catch(function (err) {
      console.log(err);
      reject(err)
    })
  });
};

function writeAllJsonFiles(jsonDataArray) {
  return new Promise(function(resolve, reject) {
    return Promise.all(jsonDataArray).then(function (data) {
      resolve(data)
      console.log('\x1b[34m','FINISHED SAVING ALL THE JSONS');
    }).catch(function (e) {
      console.log(e);
      reject(e)
    })
  });
};

function sendRequest(jsonUrl) {
  return new Promise(function(resolve, reject) {
    https.get(`${jsonRoot}${jsonUrl}`, (res) => {
      console.log(`${jsonUrl} statusCode: ${res.statusCode}` );
      var rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        try {
          resolve({rawData:rawData, jsonUrl:jsonUrl})
        } catch (e) {
          console.error(e.message);
          reject(e.message)
        }
      });
    }).on('error', (e) => {
      console.error(e);
    });
  });
};

function writeJsonFile(rawData,jsonUrl) {
  return new Promise(function(resolve, reject) {
    fs.writeFile(`./jsons/${jsonUrl}`, rawData, function(err) {
      if(err) {
        console.log(err);
        reject(err)
      };
      console.log(`The file ${jsonUrl} was saved!`);
      resolve(`The file ${jsonUrl} was saved!`)
    });
  });
};

http.listen(port,function (err) {
  if (err) return console.log(err);
  console.log(`Server corriendo en el puerto ${port}`);
  processHandler();
})
