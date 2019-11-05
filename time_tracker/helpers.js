async function searchForHash(params) {
 return new Promise(async function(resolve, reject) {
  params.alreadyCheckedNextPage = params.alreadyCheckedNextPage||false;
  var commitsInCurrentPage = await getAllCommitsFromPage(params.page)
  var commitsToReport = await checkCommits({
   commitsInCurrentPage:commitsInCurrentPage,
   alreadyCheckedNextPage: params.alreadyCheckedNextPage,
   lastReportedCommit: params.lastReportedCommit
  })
  console.log('commitsToReport ',commitsToReport);
  resolve(commitsToReport);
 });
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
   if (currentCommitHash === params.lastReportedCommit) {
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

module.exports ={
 searchForHash,
 getAllCommitsFromPage,
 checkCommits
}