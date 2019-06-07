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

function askUrl(){
  let consoleQuestion = 'Inserta la url al directorio raiz de los jsons EJ: "https://project-dev.server.com/web/sqlite/json/" :\n'
  rl.question(consoleQuestion, (userInput) => {
    jsonRoot = userInput.endsWith('/') ? userInput : userInput+'/';
    rl.close();
    startProcess()
  });
};

function startProcess() {
  https.get(jsonRoot, (res) => {
    console.log(`${jsonRoot} statusCode: ${res.statusCode}`);
    var rawData = '';
    res.on('data', (chunk) => {
      rawData += chunk;
    });
    res.on('end', () => {
      try {
        parseHtml(rawData)
      } catch (e) {
        console.error(e.message);
      }
    });
  }).on('error', (e) => {
    console.log('hay un error');
    console.error(e);
  });
}

function parseHtml(rawData) {
  const rootDir = parse(rawData);
  var jsonsUrls = rootDir.querySelectorAll('a');
  generateJsonsUrls(jsonsUrls)
}

function generateJsonsUrls(jsonsUrls){
  var filesList =[];
  for (var variable in jsonsUrls) {
    if (jsonsUrls.hasOwnProperty(variable)) {
      if (jsonsUrls[variable].text.indexOf(".json")>-1) {
        filesList.push(jsonsUrls[variable].text)
      }
    }
  }
  getJsons(filesList)
}

function getJsons(filesList){
  var requestArray = [];
  for (var i = 0; i < filesList.length; i++){
    requestArray.push(sendRequest(filesList[i]))
  }
  sendAllRequests(requestArray)
}

function sendAllRequests(requestArray) {
  Promise.all(requestArray).then(function (jsonData) {
    var jsonDataArray = [];
    jsonData.forEach(function(element) {
      jsonDataArray.push(writeJsonFile(element.rawData,element.jsonUrl))
    })
    writeAllJsonFiles(jsonDataArray);
  }).catch(function (err) {
    console.log(err);
  })
}

function writeAllJsonFiles(jsonDataArray) {
  Promise.all(jsonDataArray).then(function (data) {
    console.log(data);
    console.log('\x1b[34m','FINISHED SAVING ALL THE JSONS');
    process.exit()
  }).catch(function (e) {
    console.log(e);
  })
}

function sendRequest(jsonUrl) {
  return new Promise(function(resolve, reject) {
    https.get(`${jsonRoot}${jsonUrl}`, (res) => {
      console.log(`${jsonUrl} statusCode: ${res.statusCode}` );
      // console.log('headers:', res.headers);
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
}

function writeJsonFile(rawData,jsonUrl) {
  return new Promise(function(resolve, reject) {
    fs.writeFile(`./jsons/${jsonUrl}`, rawData, function(err) {
      if(err) {
        console.log(err);
        reject(err)
      }
      // console.log(`The file ${jsonUrl} was saved!`);
      resolve(`The file ${jsonUrl} was saved!`)
    });
  });
}

http.listen(port,function (err) {
  if (err) return console.log(err);
  console.log(`Server corriendo en el puerto ${port}`);
  askUrl()
})
