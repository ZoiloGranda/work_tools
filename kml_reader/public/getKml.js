function loadDoc() {
  var xmlfile = document.getElementById('kmlInput').value
  xmlfile+='.kml'
  console.log({xmlfile});
  var xhttp = new XMLHttpRequest();
  xhttp.onloadend = function() {
    console.log({xhttp});
    myFunction(xhttp.responseXML)
  };
  xhttp.open("GET", xmlfile, true);
  xhttp.send();
}
function myFunction(xmlDoc) {
  var placemarks = xmlDoc.getElementsByTagName('Placemark')
  var placemarksString = 'array(';
  console.log({placemarks});
  for (var i = 0; i < placemarks.length; i++) {
    console.log(placemarks[i].children["0"].innerHTML);
    placemarksString += `${i}=>array("${placemarks[i].children["0"].innerHTML}"),`;
  }
  placemarksString +=');'
  console.log({placemarksString});
  document.getElementById('resultsDiv').innerHTML=placemarksString
}

var input = document.getElementById("kmlInput");
input.addEventListener("keyup", function(event) {
  event.preventDefault();
  if (event.keyCode === 13) {
    loadDoc()
  }
});


