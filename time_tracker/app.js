const express = require('express');
const app = express()
const http = require('http').Server(app)
const port = 8080;
const https = require('https');
const puppeteer = require('puppeteer-core');
const readline = require('readline');
const dotenv = require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const querystring = require('querystring');

var numberOfCommits = 5;
var datesToReport = {
 days:'',
 month:''
};
var environment_data = {
 bs_username: process.env.BEANSTALK_USERNAME,
 bs_password: process.env.BEANSTALK_PASSWORD,
 bs_userid: process.env.BEANSTALK_USERID,
 chrome_path: process.env.CHROME_EXECUTABLE_PATH,
 last_reported_commit: process.env.LAST_REPORTED_COMMIT
}

const rl = readline.createInterface({
 input: process.stdin,
 output: process.stdout
});

async function askQuestions() {
 try {
  await askDays();
  await formatDaysToReport();
  await askMonth();
  await askHash();
  var page = await initBrowser();
  page = await login(page);
 } catch (e) {
  console.log('error');
  console.log(e);
  return
 } finally {
  startNavigation({page:page})
 }
}

async function startNavigation(params) {
 var page = params.page;
 if (params.lastCommitHash) {
  environment_data.last_reported_commit = params.lastCommitHash;
 }
 try {
  var commitsToReport = false;
  var pendingCommits = [];
  do {
   commitsToReport = await searchForHash({page:page});
   if (commitsToReport === false) {
    page = await goToNextPage(page)
   }
   // if (commitsToReport === false) el ultimo hash reportado no esta en esta pagina
  } while (commitsToReport === false);
  console.log('commitsToReport.length ',commitsToReport.length);
  if (commitsToReport.length === 0) {
   //if commitsToReport.length === 0 es porque el ultimo commit reportado es el ultimo commit de esa pagina
   page = await goToPreviousPage(page)
   commitsToReport = await searchForHash({page:page,alreadyCheckedNextPage:true});
  } else if (commitsToReport.length >= 1 && commitsToReport.length <= numberOfCommits-1) {
   page = await goToPreviousPage(page)
   pendingCommits = commitsToReport;
   commitsToReport = await searchForHash({page:page,alreadyCheckedNextPage:true});
  }
  if (pendingCommits.length!=0) {
   console.log({commitsToReport});
   console.log({pendingCommits});
   commitsToReport = await concatPendingCommits({
    commitsToReport:commitsToReport, 
    pendingCommits:pendingCommits
   })
   console.log({commitsToReport});
  }
  var formatedPostData = await prepareCommitsForOneDay({
   commitsToReport:commitsToReport,
   datesToReportDays:datesToReport.days[0],
   page:page
  });
  var formatedParams = await formatRequest(formatedPostData)
  await sendData(formatedParams);
  await saveLastReportedCommit({lastCommitHash:formatedPostData.lastCommitHash});
  datesToReport.days.shift()// removes reported day
  console.log({datesToReport});
 } catch (e) {
  console.log('error');
  console.log(e);
 } finally {
  if (datesToReport.days.length > 0) {
   startNavigation({page:page, lastCommitHash:formatedPostData.lastCommitHash});
  } else {
   console.log('Se terminaron los dias que reportar');
  }
 }
}

async function searchForHash(params) {
 return new Promise(async function(resolve, reject) {
  params.alreadyCheckedNextPage = params.alreadyCheckedNextPage||false;
  var commitsInCurrentPage = await getAllCommitsFromPage(params.page)
  var commitsToReport = await checkCommits({
   commitsInCurrentPage:commitsInCurrentPage,
   alreadyCheckedNextPage: params.alreadyCheckedNextPage
  })
  console.log('commitsToReport ',commitsToReport);
  resolve(commitsToReport);
 });
}

async function askDays(){
 return new Promise(function(resolve, reject) {
  let consoleQuestion = `Que dias vas a reportar? solo numeros con 0 adelante si es menor de 10.
  Si es mas de uno, separarlos con coma: \n`
  rl.question(consoleQuestion, (userInput) => {
   datesToReport.days = userInput;
   resolve();
  });
 });
}

async function formatDaysToReport(){
 return new Promise(function(resolve, reject) {
  datesToReport.days.toString();
  var daysToArray = datesToReport.days.split(',');
  datesToReport.days = daysToArray;
  resolve();
 });
}

function askMonth() {
 return new Promise(function(resolve, reject) {
  let consoleQuestion = 'Que mes? solo uno, en numero, con 0 adelante si es menor de 10 :\n'
  rl.question(consoleQuestion, (userInput) => {
   datesToReport.month = userInput;
   resolve();
  });
 });
}

function askHash() {
 return new Promise(function(resolve, reject) {
  if (environment_data.last_reported_commit === '') {
   consoleQuestion = 'Ultimo Hash reportado en el timetracker :\n'
   rl.question(consoleQuestion, (userInput) => {
    environment_data.last_reported_commit = userInput;
    rl.close();
    resolve()
   });
  } else {
   resolve()
  }
 });
};

async function initBrowser() {
 return new Promise( async function(resolve, reject) {
  const browser = await puppeteer.launch({
   executablePath:environment_data.chrome_path,
   headless:false,
   slowMo:100, 
   devtools:true,
   timeout:30000
  });
  const page = browser.newPage();
  resolve(page)
 });
}

async function login(page) {
 await page.goto('https://connexient.beanstalkapp.com/session/new',{waitUntil: 'load', timeout: 0});
 await page.focus('#username')
 await page.keyboard.type(environment_data.bs_username)
 await page.focus('#password')
 await page.keyboard.type(environment_data.bs_password)
 await page.click('input[type="submit"]')
 await page.goto(`https://connexient.beanstalkapp.com/search?u=${environment_data.bs_userid}`);
  return(page);
 }
 
 async function getAllCommitsFromPage(page){
  return page.evaluate(()=> {
   var allCommitsElements = $('.rev-comment p a');
   var formatedCommits =[];
   for (var current in allCommitsElements) {
    if (allCommitsElements.hasOwnProperty(current) && Number.isInteger(Number(current))) {
     let commitData ={
      message:allCommitsElements[current].innerText
     };
     formatedCommits.push(commitData)
    }
   }
   return formatedCommits;
  }).then(function (data) {
   return data
  })
 }
 
 async function checkCommits(params) {
  if (params.alreadyCheckedNextPage) {
   return params.commitsInCurrentPage;
  }
  var found = false;
  for (var commit in params.commitsInCurrentPage) {
   if (params.commitsInCurrentPage.hasOwnProperty(commit)) {
    var currentCommitHash = params.commitsInCurrentPage[commit].message.slice(0,8)
    if (currentCommitHash === environment_data.last_reported_commit) {
     //remove already reported commits
     params.commitsInCurrentPage.splice(Number(commit));
     return params.commitsInCurrentPage;
    }else {
     console.log('buscando ultimo commit reportado');
    }
   }
  }
  return false;
 }
 
 //params = commitsToReport, pendingCommits
 async function concatPendingCommits(params) {
  var commitsToReport = params.commitsToReport;
  var pendingCommits = params.pendingCommits;
  if (commitsToReport && pendingCommits) {
   return commitsToReport.concat(pendingCommits);
  }
  return false;
 }
 
 //params = commitsToReport, dayToReport
 async function prepareCommitsForOneDay(params){
  var commitsToReport = params.commitsToReport;
  var dayToReport = params.datesToReportDays;
  // var page = params.page;
  var month = datesToReport.month
  if (commitsToReport.length >= numberOfCommits) {
   var lastCommitHash = commitsToReport[commitsToReport.length-numberOfCommits].message.slice(0,8);
   var descriptionString = '';
   for (var i = commitsToReport.length-1; i >= commitsToReport.length-numberOfCommits; i--) {
    descriptionString= `${descriptionString}${commitsToReport[i].message} `
   }
   var postData = {
    dayToReport: dayToReport,
    description: descriptionString,
    lastCommitHash: lastCommitHash
   }
   return postData
  }
 }
 
 async function goToPreviousPage(page, commitsToReport) {
  return new Promise(async function(resolve, reject) {
   var currentPage = await page.evaluate(function () {
    var url_string = window.location.href
    var url = new URL(url_string);
    var currentPage = url.searchParams.get("page");
    currentPage = Number(currentPage);
    return currentPage;
   })
   console.log({currentPage});
   if (currentPage >=2) {
    var pageToNavigate = currentPage - 1;
    await page.goto(`https://connexient.beanstalkapp.com/search?page=${pageToNavigate}&u=523487`,{waitUntil: 'load', timeout: 0});
     resolve(page)
    }else if (currentPage === 1) {
     console.log('ya no hay mas paginas ni commits que revisar');
     reject();
    }
   });
  }
  
  async function goToNextPage(page) {
   return new Promise(async function (resolve, reject) {
    var currentPage = await page.evaluate(function () {
     var url_string = window.location.href
     var url = new URL(url_string);
     var currentPage = url.searchParams.get("page");
     currentPage = currentPage?currentPage:1
     currentPage = Number(currentPage);
     return currentPage;
    })
    console.log({currentPage});
    var pageToNavigate = currentPage + 1;
    await page.goto(`https://connexient.beanstalkapp.com/search?page=${pageToNavigate}&u=523487`,{waitUntil: 'load', timeout: 0});
     pageToNavigate++;
     resolve(page)
    });
   }
   
   async function formatRequest(formatedPostData){
    return new Promise(function(resolve, reject) {
     var description = formatedPostData.description.replace(/'/g, '');
     description = encodeURIComponent(description)
     var formatedDate = `${formatedPostData.dayToReport}/${datesToReport.month}/2019`;
     var data = {
      ctl00$ContentPlaceHolder$txtFrom:formatedDate,
      ctl00$ContentPlaceHolder$idProyectoDropDownList:197,
      ctl00$ContentPlaceHolder$TiempoTextBox:8,
      ctl00$ContentPlaceHolder$idTipoAsignacionDropDownList:1,
      ctl00$ContentPlaceHolder$idFocalPointClientDropDownList:10030,
      ctl00$ContentPlaceHolder$btnAceptar:'Accept',
      __VIEWSTATE:'/wEPDwUKMTk4MzU4MDI0NQ9kFgJmD2QWAgIDD2QWAgIFD2QWAgIDD2QWAmYPZBYWAgEPDxYCHgdWaXNpYmxlaGQWBgIBDxAPFgQeB0VuYWJsZWRoHwBoZGRkZAIDDw8WAh8AaGRkAgUPDxYCHwBoZGQCBA8WAh4MU2VsZWN0ZWREYXRlBgDAoScUN9dIZAIFDw8WAh8AaGQWAgIBDw8WAh4EVGV4dGVkZAIGDw8WAh8AaGRkAggPEA8WAh4LXyFEYXRhQm91bmRnZBAVAwATQmFpcmVzRGV2IC0gQWJzZW5jZRdDb25uZXhpZW50IC0gQ29ubmV4aWVudBUDAAE0AzE5NxQrAwNnZ2dkZAIKDw9kDxAWAWYWARYCHg5QYXJhbWV0ZXJWYWx1ZSgpWVN5c3RlbS5JbnQ2NCwgbXNjb3JsaWIsIFZlcnNpb249NC4wLjAuMCwgQ3VsdHVyZT1uZXV0cmFsLCBQdWJsaWNLZXlUb2tlbj1iNzdhNWM1NjE5MzRlMDg5BDE0MzYWAQIFZGQCDA8PFgIfAwUBOGRkAg8PEA8WAh8EZ2QQFSYAEkFjY291bnQgTWFuYWdlbWVudA5BZG1pbmlzdHJhdGlvbhNBcHBsaWNhbnRzIFNvdXJjaW5nC0NhbGwgQ2VudGVyGENvZGluZyBDaGFsbGVuZ2VzIFJldmlldyZDb21tdW5pY2F0aW9uIChuZXdzbGV0dGVyLCBub3RhcywgZXRjKRhDb25maWd1cmF0aW9uIE1hbmFnZW1lbnQKRGF0YSBFbnRyeQNEQkEVRXhlY3V0aXZlIEhlYWRodW50aW5nCkZhY2lsaXRpZXMXRmFybWluZyAtIFN0YWZmaW5nIEhlcm8HRmluYW5jZRFIZWxwIERlc2svU3VwcG9ydA9IdW1hbiBSZXNvdXJjZXMXSW5mcmFzdHJ1Y3R1cmUvSGFyZHdhcmUKTWFuYWdlbWVudAlNYXJrZXRpbmcJTWVudG9yaW5nFk9uIEJvYXJkaW5nICYgVHJhaW5pbmcOT24gQ2FsbCBEdXRpZXMIUHJlc2FsZXMLUmVjcnVpdG1lbnQSUmVwb3J0cyBHZW5lcmF0aW9uBVNhbGVzDVNhbGVzIFN1cHBvcnQbU2luIHRhcmVhcyBhc2lnbmFkYXMgLyBJZGxlFFNvZnR3YXJlIERldmVsb3BtZW50CFNvdXJjaW5nIVNvdXJjaW5nIFdlZWtlbmQgU2hpZnQgLyBPVCBIb3VycwhTdGFmZmluZxRUZWNobmljYWwgSW50ZXJ2aWV3cxRUZWNobmljYWwgSW50ZXJ2aWV3cwtUZXN0IFJldmlldwdUZXN0aW5nCFRyYWluaW5nFFVJL1VYL0dyYXBoaWMgRGVzaWduFSYAAjIxATYCMzEBNwIzNAIxMQIxNQIxNwIxNAIzMAIyNQIyOQIyMwIyMgIyNwIxNgE1AjIwAjQzAjM4AjM5AjQxATIBOAIxOQIzNwE5ATECMzYCNDQCMjQCMzICNDICMzMCMTMBNAIxMBQrAyZnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2RkAhEPD2QPEBYBZhYBFgIfBQUDMTk3FgFmZGQCFg8QDxYCHwRnZBAVAwAQTmV2aWxsZSBPcmVsbGFuYQxTcmRqYW4gRGFraWMVAwAFMTAwMzAFMTAxNDAUKwMDZ2dnZGQCGA8PZA8QFgFmFgEWAh8FBQMxOTcWAWZkZGQ/HZX7tnDVgLMn+72Oj9VUedJpai3COORxTTy+SsboaQ==',
      __EVENTVALIDATION:'/wEdADJU2sJ2vJ8BTnd8P8gAOLKa4x8AhbDk1OuzysNknnQllt3X1JqGigG7nsR3K2Z9atJZSl7umE462MZQuzch1tKgkevvYD/DAmEpbWCvpydC7YshYDBjI3ie7zA3v+BHt7Awi8AYCwa4v8vSp7qSuJkFJb6kBb1rJj1apcIu08munXHgaJAZZ96SjfBckRmOzITe44rLG4YBmmG4AgvMVNEe4TXZugaVO6S7Aeb5DmHbWcLWxRTqsh2wLosomSjksGU7cZyTSvQuVhk11+iMPlkHrGfSEF2HOoK2tZwfwhGko7ncXudicreAtE3COS6c+bu9wAgZAMDqNRYixGi+Has88yYoveIKIL1hn8APRGfKyAp9b31jDLJui/UQp0V658weFpM0rV9IhDfmlWDsCa22mjLpabdRUN758Od0yw0K3m7LAKoqO+9e/UI9wQUzzYraFpuurrchrO9sG3EOx9+R5y/Me4RRaN2yaO/1gOYoqKixbpLrd5b1tQP4pikN8PKegbjAn+k/8+stwNbJWypxyCAwpWvdCqtJfHU5T71AustJBzAvMkin1DcArkj6rIMhhN9hFhGhYa5KmlA2jFjiHlOeoE8t0cJijVsy9VdXQgBVcnAYrD7IdROOSdbS/Dhu6jsm/Ul5bdVCZs0RyOs7BrEH6H6mOEMWCkOlFML39Bs6l4dxwD+NDla8IsmNsBD3VltifgynrUGF7+NxB+l0Hr6MhusWmpTtwtQDOfDNCmPUAcpc736HgJ4wcBzTuGYMagVeJQNcG9YkUaGMscNCc5BQBoLJwn0RGDLmxLtrV7rYPAsLcOe9nfIbIy56/tsO9m0Tubuk78AIvL3UaMMMkBb0NXqvpcMeOSAQicOioUXNObavqENl147il6za9TfOh9Ybw0YjeU4qVXS+Q2NaOLZc5JAu5/C2W8n9mVltyOeugdivMsVjwD+kdbC9XXY6RwYZZuYohawcE5UWja/D3dYr7lK9ySufpkO80DdRuy0rHx5Rq+1koY0Q5xBg/i77vRAlv/Jfzi5niFsJcPEtOv4xVaY4l3rGrTfvNmMENt2Xz2IiOaaPmJJXgSgNwmElw80yS/G49E8U2j/NQBg5'
     }
     var dataAsQueryString = querystring.stringify(data);
     var descriptionParamQS = querystring.stringify({ctl00$ContentPlaceHolder$DescripcionTextBox:''});
     var fullDescription = descriptionParamQS+description;
     dataAsQueryString = dataAsQueryString+'&'+fullDescription;
     resolve(dataAsQueryString)
    });
   }
   
   async function sendData(queryStringParams) {
    return new Promise(function(resolve, reject) {
     console.log({queryStringParams});
     var headers = {
      'Connection':'keep-alive',
      'Content-Type':'application/x-www-form-urlencoded',
      'Cookie':'ASP.NET_SessionId=pkitlwsrywi3soyyhmiz2zhn; idProyectoAnterior=197; idTipoAsignacionAnterior=1; idFocalPointAnterior=10030',
     }
     axios({
      method:'post',
      url:'https://timetracker.bairesdev.com/CargaTimeTracker.aspx',
      data:queryStringParams,
      headers:headers
     })
     .then(function (response) {
      console.log('SUCCESS');
      console.log(response);
      resolve();
     })
     .catch(function (error) {
      console.log(error);
      reject();
     });
    });
   };
   
   async function saveLastReportedCommit(params){
    var lastCommitHash = params.lastCommitHash;
    fs.readFile(`./.env`, 'utf-8',(err, contents) => {
     var startPosition = contents.indexOf('LAST_REPORTED_COMMIT')+21;
     var bufferedText = Buffer.from(lastCommitHash);
     var file = fs.openSync('./.env','r+');
     fs.writeSync(file, bufferedText,0, bufferedText.length, startPosition) 
    });
   }
   
   http.listen(port,function (err) {
    if (err) return console.log(err);
    console.log(`Server corriendo en el puerto ${port}`);
    askQuestions();
   })
