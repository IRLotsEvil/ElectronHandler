const { BrowserWindow, app, ipcMain } = require("electron");
const { ipcClient } = require("../Classes/ipc");
app.on("ready",()=>{
    var window = new BrowserWindow({show:false,webPreferences:{ preload:__dirname+"\\injectorImproved.js", offscreen:true }});
    // window.webContents.openDevTools({mode:"detach"});
    new ipcClient().beginConnection(function(data,endConnection){
        var results = null;
        const { URL, PostData } = data;
        if(Array.isArray(URL))
            (function makePromise(){
                new Promise((resolve,reject)=>{
                    ipcMain.once("message",function(e,results){resolve(results)});
                    window.webContents.once("dom-ready",()=>window.webContents.send("Compile",data));
                    window.loadURL(URL.shift(),{postData:PostData});
                }).then(function(result){
                    if(results === null){ 
                        results = result;
                    }else{
                        results = result.reduce((a,c)=>{
                            const { Results, CollectionName, UniqueID} = c;
                            if(Array.isArray(Results)){
                                var num = results.findIndex(x=>x.CollectionName === CollectionName);
                                if(num >-1)a[num].Results = a[num].Results.concat(Results);
                            }
                            return a;
                        },results);
                    }
                    if(URL.length>0)makePromise();
                    else{
                        endConnection(results);
                    }
                });
            })();
    })
});
