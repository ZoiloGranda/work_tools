const express = require('express');
const app = express()
const http = require('http').Server(app)
const port = 8080;

app.use(express.static(__dirname + '/public'));

app.get('/',function (req, res) {
  
  res.sendFile(__dirname+'/index.html')
})

http.listen(port,function (err) {
  if (err) return console.log(err);
  console.log('server corriendo ' + port);
})
