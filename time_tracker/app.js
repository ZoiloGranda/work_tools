const express = require('express');
const app = express()
const http = require('http').Server(app)
const port = 8080;
const https = require('https');
const puppeteer = require('puppeteer-core');
const cmd = require('node-command-line');
const readline = require('readline');

var pageToNavigate = 2;
var lastReportedCommit ={
  hash: '',
};
var datesToReport = {
  days:[],
  month:''
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function askQuestions() {
  await askDays();
  await askMonth();
  await askHash();
  startProcess()
}

function askDays(){
  return new Promise(function(resolve, reject) {
    let consoleQuestion = 'Que dias vas a reportar? solo numeros, separados por coma y con 0 adelante si es menor de 10 :\n'
    rl.question(consoleQuestion, (userInput) => {
      datesToReport.days = [userInput];
      resolve()
    });
  });
}

function askMonth() {
  return new Promise(function(resolve, reject) {
    let consoleQuestion = 'Que mes? solo uno, en numero, con 0 adelante si es menor de 10 :\n'
    rl.question(consoleQuestion, (userInput) => {
      datesToReport.month = userInput;
      resolve()
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

async function startProcess() {
  const browser = await puppeteer.launch({
    executablePath:'/opt/google/chrome/google-chrome',
    headless:false,
    slowMo:100, 
    devtools:true,
  });
  const page = await browser.newPage();
  await page.goto('https://connexient.beanstalkapp.com/session/new');
  await page.focus('#username')
  await page.keyboard.type('zoilogranda')
  await page.focus('#password')
  await page.keyboard.type('192511244')
  await page.click('input[type="submit"]')
  await page.goto('https://connexient.beanstalkapp.com/search?u=523487');
  var navigateCommits = await startNavigation(page);
  // await browser.close();
};

async function startNavigation(page, alreadyCheckedNextPage, pendingCommits) {
  console.log('pendingCommits ', pendingCommits);
  console.log('al inicio pageToNavigate',pageToNavigate);
  var commitsInCurrentPage = await getAllCommitsFromPage(page);
  console.log('commitsInCurrentPage startNavigation ',commitsInCurrentPage);
  var commitsToReport = await checkCommits(commitsInCurrentPage, alreadyCheckedNextPage)
  console.log('commitsToReport startNavigation ', commitsToReport);
  if (commitsToReport) {
    if (pendingCommits) {
      commitsToReport = commitsToReport.concat(pendingCommits);
    }
    for (var i = 0; i < datesToReport.days.length; i++) {
      var formatedPostData = await prepareCommitsForOneDay(commitsToReport,datesToReport.days[i],page);
      await sendData(formatedPostData);
    }
  } else {
    //el 6 puede ser cualquier valor, solamente quiere decir
    // que va a navegar hasta la pagina 6 buscando el ultimo hash reportado
    var maxPagesToNavigate = 6
    if (pageToNavigate<=maxPagesToNavigate) {
      console.log('el ultimo commit reportado no esta en esta pagina, pasar a la siguiente');
      await page.goto(`https://connexient.beanstalkapp.com/search?page=${pageToNavigate}&u=523487`);
      pageToNavigate++;
      console.log('al final',pageToNavigate);
      await startNavigation(page)
    } else {
      console.log('llegaste al limite de paginas que revisar: ${maxPagesToNavigate}');
    }
  }
}

function getAllCommitsFromPage(page){
  return page.evaluate(()=> {
    var allCommitsElements = $('.rev-comment p a');
    var formatedCommits =[];
    for (var current in allCommitsElements) {
      if (allCommitsElements.hasOwnProperty(current) && Number.isInteger(Number(current))) {
        let commitData ={
          message:allCommitsElements[current].innerText
        };
        console.log(commitData);
        formatedCommits.push(commitData)
      }
    }
    console.log(formatedCommits);
    return formatedCommits;
  }).then(function (data) {
    console.log(data);
    return data
  }).catch(function (e) {
    console.log('Error');
    console.log(e);
  })
}

async function checkCommits(commitsInCurrentPage, alreadyCheckedNextPage) {
  if (alreadyCheckedNextPage) {
    return commitsInCurrentPage;
  }
  var found = false;
  for (var commit in commitsInCurrentPage) {
    if (commitsInCurrentPage.hasOwnProperty(commit)) {
      var currentCommitHash = commitsInCurrentPage[commit].message.slice(0,8)
      if (currentCommitHash === lastReportedCommit.hash) {
        //remove already reported commits
        commitsInCurrentPage.splice(Number(commit));
        console.log(commitsInCurrentPage);
        console.log('found');
        return commitsInCurrentPage;
      }else {
        console.log('siguiente pagina');
      }
    }
  }
  return false;
}

async function prepareCommitsForOneDay(commitsToReport, dayToReport, page){
  var month = datesToReport.month
  console.log('prepareCommitsForOneDay commitsToReport ', commitsToReport);
  console.log('commitsToReport.length ',commitsToReport.length);
  console.log('dayToReport ', dayToReport);
  if (commitsToReport.length >=3) {
    console.log('if');
    var descriptionString = '';
    for (var i = commitsToReport.length-1; i >= commitsToReport.length-3; i--) {
      console.log(i);
      console.log(commitsToReport[i]);
      descriptionString= `${descriptionString}${commitsToReport[i].message} `
    }
    console.log(descriptionString);
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
    goToPreviousPage(page);
  } else {
    console.log('quedan 1 o dos commits en esta pagina nada mas');
    goToPreviousPage(page, commitsToReport);
  }
}

async function goToPreviousPage(page, commitsToReport) {
  console.log('goToPreviousPage pageToNavigate antes ', pageToNavigate);
  if (pageToNavigate >= 4) {
    pageToNavigate--;
    console.log('goToPreviousPage pageToNavigate despues ', pageToNavigate);
    await page.goto(`https://connexient.beanstalkapp.com/search?page=${pageToNavigate-1}&u=523487`);
    var alreadyCheckedNextPage = true;
    startNavigation(page, alreadyCheckedNextPage, commitsToReport);
  }else if (pageToNavigate === 3||pageToNavigate === 2) {
    console.log('ya no hay mas paginas ni commits que revisar');
  }
}

function sendData(formatedPostData) {
  console.log(formatedPostData);
  var description = formatedPostData.description.replace(/'/g, '');
  description = encodeURIComponent(description)
  console.log('description encodeada ',description);
  cmd.run(`curl 'https://timetracker.bairesdev.com/CargaTimeTracker.aspx' -H 'Connection: keep-alive'  -H 'Pragma: no-cache'  -H 'Cache-Control: no-cache'  -H 'Origin: https://timetracker.bairesdev.com'  -H 'Upgrade-Insecure-Requests: 1'  -H 'Content-Type: application/x-www-form-urlencoded'  -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36'  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3'  -H 'Referer: https://timetracker.bairesdev.com/CargaTimeTracker.aspx'  -H 'Accept-Encoding: gzip, deflate, br'  -H 'Accept-Language: es-ES,es;q=0.9'  -H 'Cookie: ASP.NET_SessionId=pkitlwsrywi3soyyhmiz2zhn; idProyectoAnterior=197; idTipoAsignacionAnterior=1; idFocalPointAnterior=10030'\
  --data\
  'ctl00%24ContentPlaceHolder%24txtFrom=${formatedPostData.dayToReport}%2F${datesToReport.month}%2F2019&ctl00%24ContentPlaceHolder%24idProyectoDropDownList=197&ctl00%24ContentPlaceHolder%24TiempoTextBox=8&ctl00%24ContentPlaceHolder%24idTipoAsignacionDropDownList=1&ctl00%24ContentPlaceHolder%24DescripcionTextBox=${description}&ctl00%24ContentPlaceHolder%24idFocalPointClientDropDownList=10030&ctl00%24ContentPlaceHolder%24btnAceptar=Accept&__EVENTTARGET=&__EVENTARGUMENT=&__LASTFOCUS=&__VIEWSTATE=%2FwEPDwUKMTk4MzU4MDI0NQ9kFgJmD2QWAgIDD2QWAgIFD2QWAgIDD2QWAmYPZBYWAgEPDxYCHgdWaXNpYmxlaGQWBgIBDxAPFgQeB0VuYWJsZWRoHwBoZGRkZAIDDw8WAh8AaGRkAgUPDxYCHwBoZGQCBA8WAh4MU2VsZWN0ZWREYXRlBgBAlUcR1NZIZAIFDw8WAh8AaGQWAgIBDw8WAh4EVGV4dGVkZAIGDw8WAh8AaGRkAggPEA8WAh4LXyFEYXRhQm91bmRnZBAVAwATQmFpcmVzRGV2IC0gQWJzZW5jZRdDb25uZXhpZW50IC0gQ29ubmV4aWVudBUDAAE0AzE5NxQrAwNnZ2dkZAIKDw9kDxAWAWYWARYCHg5QYXJhbWV0ZXJWYWx1ZSgpWVN5c3RlbS5JbnQ2NCwgbXNjb3JsaWIsIFZlcnNpb249NC4wLjAuMCwgQ3VsdHVyZT1uZXV0cmFsLCBQdWJsaWNLZXlUb2tlbj1iNzdhNWM1NjE5MzRlMDg5BDE0MzYWAQIFZGQCDA8PFgIfAwUBOGRkAg8PEA8WAh8EZ2QQFSUAEkFjY291bnQgTWFuYWdlbWVudA5BZG1pbmlzdHJhdGlvbhNBcHBsaWNhbnRzIFNvdXJjaW5nC0NhbGwgQ2VudGVyGENvZGluZyBDaGFsbGVuZ2VzIFJldmlldyZDb21tdW5pY2F0aW9uIChuZXdzbGV0dGVyLCBub3RhcywgZXRjKRhDb25maWd1cmF0aW9uIE1hbmFnZW1lbnQKRGF0YSBFbnRyeQNEQkEVRXhlY3V0aXZlIEhlYWRodW50aW5nCkZhY2lsaXRpZXMXRmFybWluZyAtIFN0YWZmaW5nIEhlcm8HRmluYW5jZRFIZWxwIERlc2svU3VwcG9ydA9IdW1hbiBSZXNvdXJjZXMXSW5mcmFzdHJ1Y3R1cmUvSGFyZHdhcmUKTWFuYWdlbWVudAlNYXJrZXRpbmcJTWVudG9yaW5nFk9uIEJvYXJkaW5nICYgVHJhaW5pbmcOT24gQ2FsbCBEdXRpZXMIUHJlc2FsZXMLUmVjcnVpdG1lbnQSUmVwb3J0cyBHZW5lcmF0aW9uBVNhbGVzDVNhbGVzIFN1cHBvcnQbU2luIHRhcmVhcyBhc2lnbmFkYXMgLyBJZGxlFFNvZnR3YXJlIERldmVsb3BtZW50CFNvdXJjaW5nCFN0YWZmaW5nFFRlY2huaWNhbCBJbnRlcnZpZXdzFFRlY2huaWNhbCBJbnRlcnZpZXdzC1Rlc3QgUmV2aWV3B1Rlc3RpbmcIVHJhaW5pbmcUVUkvVVgvR3JhcGhpYyBEZXNpZ24VJQACMjEBNgIzMQE3AjM0AjExAjE1AjE3AjE0AjMwAjI1AjI5AjIzAjIyAjI3AjE2ATUCMjACNDMCMzgCMzkCNDEBMgE4AjE5AjM3ATkBMQIzNgIyNAIzMgI0MgIzMwIxMwE0AjEwFCsDJWdnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dkZAIRDw9kDxAWAWYWARYCHwUFAzE5NxYBZmRkAhYPEA8WAh8EZ2QQFQMAEE5ldmlsbGUgT3JlbGxhbmEMU3JkamFuIERha2ljFQMABTEwMDMwBTEwMTQwFCsDA2dnZ2RkAhgPD2QPEBYBZhYBFgIfBQUDMTk3FgFmZGRkp53CNATxhU4%2BTHuDQxCPSjCx6uV7Z3BYXSZxRfhtlKU%3D&__VIEWSTATEGENERATOR=36DF8DAE&__EVENTVALIDATION=%2FwEdADFb4T63K9r56fvaZZklyc1A4x8AhbDk1OuzysNknnQllt3X1JqGigG7nsR3K2Z9atJZSl7umE462MZQuzch1tKgkevvYD%2FDAmEpbWCvpydC7YshYDBjI3ie7zA3v%2BBHt7Awi8AYCwa4v8vSp7qSuJkFJb6kBb1rJj1apcIu08munXHgaJAZZ96SjfBckRmOzITe44rLG4YBmmG4AgvMVNEe4TXZugaVO6S7Aeb5DmHbWcLWxRTqsh2wLosomSjksGU7cZyTSvQuVhk11%2BiMPlkHrGfSEF2HOoK2tZwfwhGko7ncXudicreAtE3COS6c%2Bbu9wAgZAMDqNRYixGi%2BHas88yYoveIKIL1hn8APRGfKyAp9b31jDLJui%2FUQp0V658weFpM0rV9IhDfmlWDsCa22mjLpabdRUN758Od0yw0K3m7LAKoqO%2B9e%2FUI9wQUzzYraFpuurrchrO9sG3EOx9%2BR5y%2FMe4RRaN2yaO%2F1gOYoqKixbpLrd5b1tQP4pikN8PKegbjAn%2Bk%2F8%2BstwNbJWypxyCAwpWvdCqtJfHU5T71AustJBzAvMkin1DcArkj6rIMhhN9hFhGhYa5KmlA2jFjiHlOeoE8t0cJijVsy9VdXQgBVcnAYrD7IdROOSdbS%2FDhu6jsm%2FUl5bdVCZs0RyOs7BrEH6H6mOEMWCkOlFML39Bs6l4dxwD%2BNDla8IsmNsBD3VltifgynrUGF7%2BNxB%2Bl0Hr6MhusWmpTtwtQDOfDNCmPUAcpc736HgJ4wcBzTuGZzkFAGgsnCfREYMubEu2tXutg8Cwtw572d8hsjLnr%2B2w72bRO5u6TvwAi8vdRowwyQFvQ1eq%2Blwx45IBCJw6KhRc05tq%2BoQ2XXjuKXrNr1N86H1hvDRiN5TipVdL5DY1o4tlzkkC7n8LZbyf2ZWW3I566B2K8yxWPAP6R1sL1ddjpHBhlm5iiFrBwTlRaNr8Pd1ivuUr3JK5%2BmQ7zQN1G7LSsfHlGr7WShjRDnEGD%2BLvu9ECW%2F8l%2FOLmeIWwlw8S06%2FjFVpjiXesatN%2B82YwQ2KVae%2BMqglvmDNxNbGu%2BVmUM93l%2Ftqp8WneqeNVtY%2F98%3D' --compressed`);
};

app.post('/data', function (req, res) {
  console.log(req.headers);
  console.log(req.body);
  console.log(req.originalUrl);
  console.log(req.url);
  console.log(req.params);
  res.end();
});

http.listen(port,function (err) {
  if (err) return console.log(err);
  console.log(`Server corriendo en el puerto ${port}`);
  askQuestions();
})
