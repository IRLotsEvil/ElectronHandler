const { ipcClient, ipcServer } = require("../ipc");
const https = require("https");
const fs = require("fs");
const tesseract = require("tesseract.js");
new ipcClient().beginConnection(function(d,endConnection){
    var ee = d.Path.split(".");
    var s = __dirname + "/Downloads/"+ipcServer.UID()+"."+ ee[ee.length-1];
    var file = fs.createWriteStream(s).on("finish",f=>{
        tesseract.recognize(s,"eng",
        {
            logger:x=>{
                console.clear();
                console.log("Progress : " +(x.progress * 100)+"%");
            }
        }).then(({data:{text}})=>{
            fs.unlinkSync(s);
            endConnection({Path:d.Path,Value:text});
        });
    });
    https.get(d.Path,r=>{r.pipe(file)});
});