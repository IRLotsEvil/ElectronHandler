const { ipcClient, ipcServer} = require("../ipc");
const https = require("https");
const fs = require("fs");
const pdfparse = require("pdf-parse");

new ipcClient().beginConnection(function(d,endConnection){
    var ee = d.Path.split(".");
    var s = __dirname + "/Downloads/"+ipcServer.UID()+"."+ ee[ee.length-1];
    var formattedDocument = {Path:d.Path,Pages:[]};
    var file = fs.createWriteStream(s).on("finish",f=>{
        pdfparse(fs.readFileSync(s),{pagerender:async function(pageData){
            var data = await pageData.getTextContent();
            formattedDocument.Pages.push(data.items.reduce((page,item)=>{
                var _active = page.length > 0 ? page[page.length-1] : null;
                if(_active !== null && _active.FontFamily === data.styles[item.fontName].fontFamily && _active.FontSize === item.height) _active.Text += "\n" + item.str;
                else page.push({Text:item.str,FontFamily:data.styles[item.fontName].fontFamily,FontSize:item.height});
                return page;
            },[]));
        }}).then(data=>{
            fs.unlinkSync(s);
            endConnection(formattedDocument);
        },r=>console.log(r));
    });
    https.get(d.Path,r=>{r.pipe(file)});
});