const express = require('express');
const app = express()
const http = require('http').Server(app)
const port = 8080;
const https = require('https');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const lastReportedCommit ={
  message: '80c1e3aa: JSUMC-7 1.3 Update map icons (POIs/Mini-POIs) and libs'
};

(async () => {
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
  var commitsInCurrentPage = await getAllCommitsFromPage(page);
  console.log(commitsInCurrentPage);
  var findLastCommit = await checkCommits(commitsInCurrentPage)
  console.log(findLastCommit);
  // await browser.close();
})();

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

async function checkCommits(commitsInCurrentPage) {
  var found = false;
  for (var commit in commitsInCurrentPage) {
    if (commitsInCurrentPage.hasOwnProperty(commit)) {
      if (commitsInCurrentPage[commit].message===lastReportedCommit.message) {
        return true;
        console.log('found');
      }else {
        console.log('siguiente pagina');
      }
    }
  }
  return false;
}

http.listen(port,function (err) {
  if (err) return console.log(err);
  console.log(`Server corriendo en el puerto ${port}`);
})
