const express = require('express');
const app = express()
const http = require('http').Server(app)
const port = 8080;
const fs = require('fs');
const readline = require('readline');
const xmlparser = require('fast-xml-parser');

const rl = readline.createInterface({
 input: process.stdin,
 output: process.stdout
});

function askUrl(){
 let consoleQuestion = 'Inserta el path absoluto hacia el archivo kml/xml" :\n'
 rl.question(consoleQuestion, (userInput) => {
  xmlPath = userInput;
  rl.close();
  startProcess(xmlPath)
 });
};

function startProcess(xmlPath) {
 fs.readFile(xmlPath,'utf8', function(err, data) {
  if (!err) {
   // console.log(data);
   var jsonObj = xmlparser.parse(data);
   // console.log(jsonObj);
   getPlacemarks(jsonObj)
  }else {
   console.log('Error leyendo el archivo');
   console.log(err);
  }
 });
}

function getPlacemarks(jsonObj){
 let fileContent = jsonObj.kml.Document.Folder;
 let placemarksNames = [];
 for (var place in fileContent) {
  //if xml has more than one Folder element
  if (fileContent.hasOwnProperty(place)) { 
   if (fileContent[place].Placemark
    && typeof fileContent[place] === 'object'
    && fileContent[place].Placemark[1]) {
     for (var nestedPlace in fileContent[place].Placemark) {
      if (fileContent[place].Placemark.hasOwnProperty(nestedPlace)) {
       // console.log(fileContent[place].Placemark[nestedPlace].name);
       placemarksNames.push(fileContent[place].Placemark[nestedPlace].name)
      }
     }
    }else if(fileContent[place].Placemark){
     // console.log(fileContent[place].Placemark.name);  
     placemarksNames.push(fileContent[place].Placemark.name)
    } else if (fileContent[place][0].name) {
     fileContent[place].forEach(function(element) {
      placemarksNames.push(element.name)
     });
    }
   }
  }
  console.log(placemarksNames);
  generateGG_OVERLAY_POLY(placemarksNames)
 }
 
 function generateGG_OVERLAY_POLY(placemarksNames) {
  var formatedPlacemarks = placemarksNames.map(function(current) {
   return `array("${current}")`;
  });
  formatedPlacemarks[0] = `array(${formatedPlacemarks[0]}`;
   formatedPlacemarks[formatedPlacemarks.length-1] +=');';
   console.log(formatedPlacemarks.toString());
  }
  
  http.listen(port,function (err) {
   if (err) return console.log(err);
   console.log('server corriendo ' + port);
   askUrl()
  })
