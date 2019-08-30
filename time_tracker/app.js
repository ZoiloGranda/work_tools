const express = require('express');
const app = express()
const http = require('http').Server(app)
const port = 8080;
const https = require('https');
const puppeteer = require('puppeteer-core');
const cmd = require('node-command-line');
const readline = require('readline');
const dotenv = require('dotenv').config();

// var pageToNavigate = 2;
// maxPagesToNavigate puede ser cualquier valor, solamente quiere decir
// que va a navegar hasta esa pagina buscando el ultimo hash reportado
var maxPagesToNavigate = 16;
var lastReportedCommit ={
 hash: '',
};
var datesToReport = {
 days:'',
 month:''
};
var environment_data = {
 bs_username:process.env.BEANSTALK_USERNAME,
 bs_password:process.env.BEANSTALK_PASSWORD,
 bs_userid:process.env.BEANSTALK_USERID,
 chrome_path:process.env.CHROME_EXECUTABLE_PATH
}

const rl = readline.createInterface({
 input: process.stdin,
 output: process.stdout
});

async function askQuestions() {
 try {
  var daysToReport = await askDays();
  var formatedDaysToReport = await formatDaysToReport();
  await askMonth();
  await askHash();
  var page = await initBrowser();
  page = await login(page);
  var commitsToReport = false;
  var pendingCommits = [];
  // var commitsToReport = await searchForHash(page);
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
  } else if (commitsToReport.length >= 1 && commitsToReport.length <= 2) {
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
   datesToReportDays:datesToReport.days,
   page:page
  });
  if (formatedPostData.status === 0) {
   await goToPreviousPage({page:formatedPostData.page});
  } else if (formatedPostData.status === 1) {
   await goToPreviousPage({
    page:formatedPostData.page,
    commitsToReport:formatedPostData.commitsToReport
   });
  }
  await sendData(formatedPostData);
  // var navigateCommits = await startNavigation(page);
  // await startProcess();
  
 } catch (e) {
  console.log('error');
  console.log(e);
  return
 } finally {
  
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
   console.log(datesToReport);
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
  consoleQuestion = 'Ultimo Hash reportado en el timetracker :\n'
  rl.question(consoleQuestion, (userInput) => {
   lastReportedCommit.hash = userInput;
   rl.close();
   resolve()
  });
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
 
 //params = commitsInCurrentPage, alreadyCheckedNextPage
 async function checkCommits(params) {
  if (params.alreadyCheckedNextPage) {
   return params.commitsInCurrentPage;
  }
  var found = false;
  for (var commit in params.commitsInCurrentPage) {
   if (params.commitsInCurrentPage.hasOwnProperty(commit)) {
    var currentCommitHash = params.commitsInCurrentPage[commit].message.slice(0,8)
    if (currentCommitHash === lastReportedCommit.hash) {
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
  if (commitsToReport.length >=3) {
   var descriptionString = '';
   for (var i = commitsToReport.length-1; i >= commitsToReport.length-3; i--) {
    descriptionString= `${descriptionString}${commitsToReport[i].message} `
   }
   var postData = {
    dayToReport: dayToReport,
    description: descriptionString
   }
   return postData
  }  else if(commitsToReport.length ===0){
   //se llego a la pagina con el ultimo commit reportado
   //pero ese es el ultimo commit de la pagina, asi que va navegar a 
   // la pagina anterior
   console.log('commitsToReport en el else 0',commitsToReport.length);
   return({status:0})
   // goToPreviousPage(page);
  } else {
   console.log('quedan 1 o 2 commits en esta pagina nada mas');
   return({status:1})
   // goToPreviousPage(page, commitsToReport);
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
   console.log('currentPage ', currentPage);
   if (currentPage >=2) {
    console.log({currentPage});
    var pageToNavigate = currentPage - 1;
    console.log({pageToNavigate});
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
    console.log(typeof currentPage);
    console.log({currentPage});
    var pageToNavigate = currentPage + 1;
    await page.goto(`https://connexient.beanstalkapp.com/search?page=${pageToNavigate}&u=523487`,{waitUntil: 'load', timeout: 0});
     pageToNavigate++;
     resolve(page)
    });
   }
   
   function sendData(formatedPostData) {
    console.log('formatedPostData ', formatedPostData);
    var description = formatedPostData.description.replace(/'/g, '');
    description = encodeURIComponent(description)
    cmd.run(`curl 'https://timetracker.bairesdev.com/CargaTimeTracker.aspx' -H 'Connection: keep-alive'  -H 'Pragma: no-cache'  -H 'Cache-Control: no-cache'  -H 'Origin: https://timetracker.bairesdev.com'  -H 'Upgrade-Insecure-Requests: 1'  -H 'Content-Type: application/x-www-form-urlencoded'  -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36'  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3'  -H 'Referer: https://timetracker.bairesdev.com/CargaTimeTracker.aspx'  -H 'Accept-Encoding: gzip, deflate, br'  -H 'Accept-Language: es-ES,es;q=0.9'  -H 'Cookie: ASP.NET_SessionId=pkitlwsrywi3soyyhmiz2zhn; idProyectoAnterior=197; idTipoAsignacionAnterior=1; idFocalPointAnterior=10030'\
    --data\
    'ctl00%24ContentPlaceHolder%24txtFrom=${formatedPostData.dayToReport}%2F${datesToReport.month}%2F2019&ctl00%24ContentPlaceHolder%24idProyectoDropDownList=197&ctl00%24ContentPlaceHolder%24TiempoTextBox=8&ctl00%24ContentPlaceHolder%24idTipoAsignacionDropDownList=1&ctl00%24ContentPlaceHolder%24DescripcionTextBox=${description}&ctl00%24ContentPlaceHolder%24idFocalPointClientDropDownList=10030&ctl00%24ContentPlaceHolder%24btnAceptar=Accept&__EVENTTARGET=&__EVENTARGUMENT=&__LASTFOCUS=&__VIEWSTATE=%2FwEPDwUKMTk4MzU4MDI0NQ9kFgJmD2QWAgIDD2QWAgIFD2QWAgIDD2QWAmYPZBYWAgEPDxYCHgdWaXNpYmxlaGQWBgIBDxAPFgQeB0VuYWJsZWRoHwBoZGRkZAIDDw8WAh8AaGRkAgUPDxYCHwBoZGQCBA8WAh4MU2VsZWN0ZWREYXRlBgBAlUcR1NZIZAIFDw8WAh8AaGQWAgIBDw8WAh4EVGV4dGVkZAIGDw8WAh8AaGRkAggPEA8WAh4LXyFEYXRhQm91bmRnZBAVAwATQmFpcmVzRGV2IC0gQWJzZW5jZRdDb25uZXhpZW50IC0gQ29ubmV4aWVudBUDAAE0AzE5NxQrAwNnZ2dkZAIKDw9kDxAWAWYWARYCHg5QYXJhbWV0ZXJWYWx1ZSgpWVN5c3RlbS5JbnQ2NCwgbXNjb3JsaWIsIFZlcnNpb249NC4wLjAuMCwgQ3VsdHVyZT1uZXV0cmFsLCBQdWJsaWNLZXlUb2tlbj1iNzdhNWM1NjE5MzRlMDg5BDE0MzYWAQIFZGQCDA8PFgIfAwUBOGRkAg8PEA8WAh8EZ2QQFSUAEkFjY291bnQgTWFuYWdlbWVudA5BZG1pbmlzdHJhdGlvbhNBcHBsaWNhbnRzIFNvdXJjaW5nC0NhbGwgQ2VudGVyGENvZGluZyBDaGFsbGVuZ2VzIFJldmlldyZDb21tdW5pY2F0aW9uIChuZXdzbGV0dGVyLCBub3RhcywgZXRjKRhDb25maWd1cmF0aW9uIE1hbmFnZW1lbnQKRGF0YSBFbnRyeQNEQkEVRXhlY3V0aXZlIEhlYWRodW50aW5nCkZhY2lsaXRpZXMXRmFybWluZyAtIFN0YWZmaW5nIEhlcm8HRmluYW5jZRFIZWxwIERlc2svU3VwcG9ydA9IdW1hbiBSZXNvdXJjZXMXSW5mcmFzdHJ1Y3R1cmUvSGFyZHdhcmUKTWFuYWdlbWVudAlNYXJrZXRpbmcJTWVudG9yaW5nFk9uIEJvYXJkaW5nICYgVHJhaW5pbmcOT24gQ2FsbCBEdXRpZXMIUHJlc2FsZXMLUmVjcnVpdG1lbnQSUmVwb3J0cyBHZW5lcmF0aW9uBVNhbGVzDVNhbGVzIFN1cHBvcnQbU2luIHRhcmVhcyBhc2lnbmFkYXMgLyBJZGxlFFNvZnR3YXJlIERldmVsb3BtZW50CFNvdXJjaW5nCFN0YWZmaW5nFFRlY2huaWNhbCBJbnRlcnZpZXdzFFRlY2huaWNhbCBJbnRlcnZpZXdzC1Rlc3QgUmV2aWV3B1Rlc3RpbmcIVHJhaW5pbmcUVUkvVVgvR3JhcGhpYyBEZXNpZ24VJQACMjEBNgIzMQE3AjM0AjExAjE1AjE3AjE0AjMwAjI1AjI5AjIzAjIyAjI3AjE2ATUCMjACNDMCMzgCMzkCNDEBMgE4AjE5AjM3ATkBMQIzNgIyNAIzMgI0MgIzMwIxMwE0AjEwFCsDJWdnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dkZAIRDw9kDxAWAWYWARYCHwUFAzE5NxYBZmRkAhYPEA8WAh8EZ2QQFQMAEE5ldmlsbGUgT3JlbGxhbmEMU3JkamFuIERha2ljFQMABTEwMDMwBTEwMTQwFCsDA2dnZ2RkAhgPD2QPEBYBZhYBFgIfBQUDMTk3FgFmZGRkp53CNATxhU4%2BTHuDQxCPSjCx6uV7Z3BYXSZxRfhtlKU%3D&__VIEWSTATEGENERATOR=36DF8DAE&__EVENTVALIDATION=%2FwEdADFb4T63K9r56fvaZZklyc1A4x8AhbDk1OuzysNknnQllt3X1JqGigG7nsR3K2Z9atJZSl7umE462MZQuzch1tKgkevvYD%2FDAmEpbWCvpydC7YshYDBjI3ie7zA3v%2BBHt7Awi8AYCwa4v8vSp7qSuJkFJb6kBb1rJj1apcIu08munXHgaJAZZ96SjfBckRmOzITe44rLG4YBmmG4AgvMVNEe4TXZugaVO6S7Aeb5DmHbWcLWxRTqsh2wLosomSjksGU7cZyTSvQuVhk11%2BiMPlkHrGfSEF2HOoK2tZwfwhGko7ncXudicreAtE3COS6c%2Bbu9wAgZAMDqNRYixGi%2BHas88yYoveIKIL1hn8APRGfKyAp9b31jDLJui%2FUQp0V658weFpM0rV9IhDfmlWDsCa22mjLpabdRUN758Od0yw0K3m7LAKoqO%2B9e%2FUI9wQUzzYraFpuurrchrO9sG3EOx9%2BR5y%2FMe4RRaN2yaO%2F1gOYoqKixbpLrd5b1tQP4pikN8PKegbjAn%2Bk%2F8%2BstwNbJWypxyCAwpWvdCqtJfHU5T71AustJBzAvMkin1DcArkj6rIMhhN9hFhGhYa5KmlA2jFjiHlOeoE8t0cJijVsy9VdXQgBVcnAYrD7IdROOSdbS%2FDhu6jsm%2FUl5bdVCZs0RyOs7BrEH6H6mOEMWCkOlFML39Bs6l4dxwD%2BNDla8IsmNsBD3VltifgynrUGF7%2BNxB%2Bl0Hr6MhusWmpTtwtQDOfDNCmPUAcpc736HgJ4wcBzTuGZzkFAGgsnCfREYMubEu2tXutg8Cwtw572d8hsjLnr%2B2w72bRO5u6TvwAi8vdRowwyQFvQ1eq%2Blwx45IBCJw6KhRc05tq%2BoQ2XXjuKXrNr1N86H1hvDRiN5TipVdL5DY1o4tlzkkC7n8LZbyf2ZWW3I566B2K8yxWPAP6R1sL1ddjpHBhlm5iiFrBwTlRaNr8Pd1ivuUr3JK5%2BmQ7zQN1G7LSsfHlGr7WShjRDnEGD%2BLvu9ECW%2F8l%2FOLmeIWwlw8S06%2FjFVpjiXesatN%2B82YwQ2KVae%2BMqglvmDNxNbGu%2BVmUM93l%2Ftqp8WneqeNVtY%2F98%3D' --compressed`);
   };
   
   http.listen(port,function (err) {
    if (err) return console.log(err);
    console.log(`Server corriendo en el puerto ${port}`);
    askQuestions();
   })
