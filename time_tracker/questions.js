const readline = require('readline');

const rl = readline.createInterface({
 input: process.stdin,
 output: process.stdout
});

function askDays(){
 return new Promise(function(resolve, reject) {
  let consoleQuestion = `Que dias vas a reportar? solo numeros con 0 adelante si es menor de 10.
  Si es mas de uno, separarlos con coma: \n`
  rl.question(consoleQuestion, (userInput) => {
   resolve(userInput);
  });
 });
}

function askMonth() {
 return new Promise(function(resolve, reject) {
  let consoleQuestion = 'Que mes? solo uno, en numero, con 0 adelante si es menor de 10 :\n'
  rl.question(consoleQuestion, (userInput) => {
   resolve(userInput);
  });
 });
}

function askHash() {
 return new Promise(function(resolve, reject) {
  consoleQuestion = 'Ultimo Hash reportado en el timetracker :\n'
  rl.question(consoleQuestion, (userInput) => {
   rl.close();
   resolve(userInput)
  });
 });
};

module.exports ={
 askDays,
 askMonth,
 askHash
}