const express = require("express")();
const path = require("path");
const fs = require("fs");
const { ObjectID } = require("bson");
const http = require("http");
const { json, urlencoded} = require("express");
const { MongoController } = require("./Classes/MongoController");
const { ipcServer } = require("./Classes/ipc");
const { RemoteConsole,ConsoleFunction} = require("./Classes/RemoteConsole");
const ports = {
    "webServer" : (process.argv.slice(2)[0] || "3211"),
    "consoleSocket" : "4000",
    "localAddress" : (require('os').networkInterfaces()["Ethernet"].find(x=>x.family==="IPv4").address || "127.0.0.1"),
    "electron":(function _searchFile(fileName = "electron.exe", currentDir = __dirname){
        var items = fs.readdirSync(currentDir);
        return items.includes(fileName) ? 
            path.join(currentDir,fileName) : 
            items.filter(x=>fs.statSync(path.join(currentDir,x)).isDirectory()).reduce((a,c)=>{
                return _searchFile(fileName,path.join(currentDir,c)) || a;
            },null);
    })(),
    "mongoDB":"mongodb://127.0.0.1:27017",
    "nodePath":path.join(process.env.Path.split(";").find(o=>o.includes("nodejs")),"node.exe")
}

const _console = new RemoteConsole(ports.consoleSocket).
    addFunction("Local",new ConsoleFunction({method:"",path:"",body:""},function(msg){
        const { path, method, body} = msg;
        var options = {
            hostname:"localhost",
            port:ports.webServer,
            method:method.toUpperCase(),
            path:path,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': body.length
            }
        };
        var webRequest = http.request(options).on("response",res=>{
            var r = "";
            res.on("data",c=>r+=c).on("end",()=>_console.log(r !== ""?r:"void"));
        });
        webRequest.write(body);
        webRequest.end();
    }));

const processServer = new ipcServer("\\\\.\\pipe\\electronPipe");
express.use(require("express").static(path.join(__dirname,"ConsoleParts"))).use(urlencoded({extended:true})).use(json()).
all("/mongo/:databaseName/:collectionName?",(req,res)=>{
    if(req.query && Reflect.has(req.query,"_id")) req.query._id = new ObjectID(req.query._id);
    var controller = new MongoController(req.params.databaseName,ports.mongoDB);
    (function(){
        var resolved = Promise.resolve((reso,reje)=>reso("resolved"));
        if(req.method === "POST"){
            return controller.upsertDocument(req.params["collectionName"],req.body);
        }else if(req.method === "GET"){
            return (req.params["collectionName"] === null)?
                resolved:
                (req.query)?controller.readDocuments(req.params["collectionName"],req.query) : 
                (Array.isArray(req.body))?controller.aggregateDocuments(req.params["collectionName"],req.body) : 
                controller.readDocuments(req.params["collectionName"]);
        }else if(req.method === "PUT"){
            return (req.query)?controller.upsertDocument(req.params["collectionName"],req.body,req.query) : resolved;
        }else if(req.method === "DELETE"){
            return (req.query)?
            (req.params["collectionName"])?
                controller.deleteDocuments(req.params["collectionName"],req.query):controller.totalDelete(req.query) : resolved;
        }
    }()).then(x=>{
        res.send(typeof(x) !== "string" ? JSON.stringify(x):x);
    });
}).post("/scraper/:prefix/*",function(req,res){
    var address = `${req.params["prefix"]}://${req.params[0]}`;
    const { Indexer } = req.body;
    var addresses = [];
    if(req.query){
        var names = Object.getOwnPropertyNames(req.query);
        if(Indexer){
            const { Name, Increments, Minimum, Maximum } = Indexer;
            var amount = Maximum - Minimum;
            for(var i = addresses.length; i < Math.ceil(amount / Increments); i = addresses.length )
                addresses.push(address + "?" + names.map(name=>name += "=" +(name === Name ? i * Increments : req.query[name])).join("&"));
            if(amount % Increments > 0)addresses.push(address + "?" + names.map(name=>name += "=" +(name === Name ? Maximum : req.query[name])).join("&"));
        }else addresses = [address + "?" + names.map(name=>name += "=" + req.query[name]).join("&")];
    }else{addresses = [address];}
    var Package = req.body;
    Package["URL"] = addresses;
    processServer.openTempProcess(Package,ports.electron,[path.join(__dirname,"processes","scraper.js")]).then(x=>{
        if(x && Array.isArray(x)){
            var controller = new MongoController("Playground",ports.mongoDB);
            var promises = []; 
            for(var y of x){
                const {CollectionName, Results, UniqueID} = y;
                if(Array.isArray(Results)){
                    for(var subject of Results){
                        var queryObject = {};
                        queryObject[UniqueID] = subject[UniqueID];
                        promises.push(controller.upsertDocument(CollectionName,subject,queryObject));
                    }
                }
            }
            Promise.all(promises).then(x=>res.send());
        }else res.send(JSON.stringify({Message:"Request Failed"}));
    });
})
.get("/getUpdates/:database",(req,res)=>{
    var controller = new MongoController(req.params["database"],ports.mongoDB);
    var id = Reflect.has(req.query,"id") ?  parseInt(req.query.id) : 0;
    var options ={};
    if(Reflect.has(req.query,"allowLongPolling"))options["allowLongPolling"] = Boolean(req.query["allowLongPolling"]);
    if(Reflect.has(req.query,"waitUntilAtleastOne"))options["waitUntilAtleastOne"] = Boolean(req.query["waitUntilAtleastOne"]);
    if(Reflect.has(req.query,"rejectOnTimeout"))options["rejectOnTimeout"] = Boolean(req.query["rejectOnTimeout"]);
    if(Reflect.has(req.query,"updateBlock"))options["updateBlock"] = Number(req.query["updateBlock"]);
    if(Reflect.has(req.query,"timeout"))options["timeout"] = Number(req.query["timeout"]);
    controller.getUpdates(id,Array.isArray(req.body)?req.body:null,options).then(x=>res.send(JSON.stringify(x)));
}).get("/pingAlive",(req,res)=>res.send("alive"))
.listen(ports.webServer);
