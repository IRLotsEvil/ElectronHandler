const express = require("express")();
const path = require("path");
const fs = require("fs");
const { ipcServer } = require("./Classes/ipc");
const { PipeController } = require("./Classes/PipeController");
const { RemoteConsole,ConsoleFunction} = require("./Classes/RemoteConsole");
const http = require("http");
const { json, urlencoded} = require("express");
const { MongoController } = require("./Classes/MongoController");
const { ObjectID } = require("bson");
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
            res.on("data",c=>r+=c).on("end",()=>_console.log(r));
        });
        webRequest.write(body);
        webRequest.end();
    })).addFunction("Pipe",new ConsoleFunction({name:""},msg=>{
        pipeController.addPipe(msg.name);
    })).addFunction("WriteToPipe",new ConsoleFunction({data:""},msg=>{
        pipeController.transmitToPipes(msg.data);
    }));

const pipeController = new PipeController();
const processServer = new ipcServer("\\\\.\\pipe\\electronPipe");

express.use(require("express").static(path.join(__dirname,"ConsoleParts"))).use(urlencoded({extended:true})).use(json()).
post("/request",async function(req,res){
    const { Type , Package } = req.body;
    if(Type === "QRequest")
        processServer.openTempProcess(Package,ports.electron,[path.join(__dirname,"processes","scraper.js")]).then(x=>{
            if(x && Array.isArray(x)){
                var messages = [];
                (function takeOne(msg = null){
                    if(msg !== null)messages.push(msg);
                    if(x.length>0){
                        const {CollectionName, Results, UniqueID}  = x.shift();
                        if(Array.isArray(Results)){
                            if(Results.length>0){
                                var operation = {Operation:"Upsert",Subject:Results, CollectionName:CollectionName, UniqueID: UniqueID};
                                processServer.openTempProcess(operation,path.join(__dirname,"processes","mongo.js"),["mongostring="+ports.mongoDB]).then(y=>{
                                    takeOne({ CollectionName : CollectionName, HasResults : true, IsInserted:true, Body : "Results have been upserted" });
                                }).catch(x=>{
                                    takeOne({ CollectionName : CollectionName, HasResults : true, IsInserted:false, Body : "Results couldn't be upserted" });
                                });
                            }else takeOne({ CollectionName : CollectionName, HasResults : false, IsInserted:false, Body : "No Results found" });
                        }
                    }else res.send(JSON.stringify({Messages:messages, ReturnType:"Scraper"}));
                })();
            }else res.send(JSON.stringify({Message:"Request Failed"}));
        });
    else if(Type === "MongoOperation")
        processServer.openTempProcess(Package,path.join(__dirname,"processes","mongo.js"),["mongostring="+ports.mongoDB]).then(x=>res.send(x));
    else if(Type === "Extraction")
        switch(Package.ExtractionType){
            case "PDF":
                processServer.openTempProcess(Package,path.join(__dirname,"processes","pdfparser.js")).then(x=>{
                    processServer.openTempProcess({Operation:"Create",Subject:x, CollectionName:"PDFResults"},path.join(__dirname,"processes","mongo.js"),["mongostring="+ports.mongoDB]).then(y=>res.send(JSON.stringify({Message:"PDF has been deconstructed"})));
                });
                break;
            case "Image":
                processServer.openTempProcess(Package,path.join(__dirname,"processes","tesseract.js")).then(x=>res.send(x));
                break;
        }
    else res.send("Type not Recognised");
}).
all("/mongo/:databaseName/:collectionName?",(req,res)=>{
    if(req.query && Reflect.has(req.query,"_id"))req.query._id = new ObjectID(req.query._id);
    const Subject = req.body;
    var controller = new MongoController(req.params.databaseName,ports.mongoDB, pipeController);
    (function(){
        var resolved = Promise.resolve((reso,reje)=>reso("resolved"));
        if(req.method === "POST"){
            return controller.upsertDocument(req.params["collectionName"],Subject);
        }else if(req.method === "GET"){
            return (req.params["collectionName"] === null)?
                controller.readDocuments(req.params["collectionName"]):
                (req.query)?controller.readDocuments(req.params["collectionName"],req.query) : resolved;
        }else if(req.method === "PUT"){
            return (req.query)?controller.upsertDocument(req.params["collectionName"],Subject,req.query):resolved;
        }else if(req.method === "DELETE"){
            return (req.query)?(req.params["collectionName"]!==null)?
                controller.deleteDocuments(req.params["collectionName"],req.query):controller.totalDelete(req.query):resolved;
        }
    }()).then(x=>{
        res.send(JSON.stringify(x));
    });
}).get("/pipe/:pipeid",(req,res)=>{
    pipeController.addPipe(req.params["pipeid"]);
    res.send("Pipe Added");
    _console.log(req.params["pipeid"]); 
}).get("/scraper/:prefix/*",function(req,res){
    var address = `${req.params["prefix"]}://${req.params[0]}`;
    const { Indexer } = req.body;
    var addresses = [];
    if(req.query){
        var names = Object.getOwnPropertyNames(req.query);
        if(Indexer){
            const { Name, Increments, Min, Max } = Indexer;
            var amount = Max - Min;
            for(var i = addresses.length; i < Math.ceil(amount / Increments); i = addresses.length )
                addresses.push(address + "?" + names.map(name=>name += "=" +(name === Name ? i * Increments : req.query[name])).join("&"));
            if(amount % Increments > 0)addresses.push(address + "?" + names.map(name=>name += "=" +(name === Name ? Max : req.query[name])).join("&"));
        }else addresses = [address + "?" + names.map(name=>name += "=" + req.query[name]).join("&")];
    }else{addresses = [address];}
    var Package = req.body;
    Package["URL"] = addresses;
    processServer.openTempProcess(Package,ports.electron,[path.join(__dirname,"processes","scraper.js")]).then(x=>{
        if(x && Array.isArray(x)){
            var controller = new MongoController("Playground",ports.mongoDB,pipeController);
            var promises = []; 
            for(var y of x){
                const {CollectionName, Results, UniqueID} = y;
                if(Array.isArray(Results)){
                    for(var subject of Results){
                        var queryObject = {};
                        queryObject[UniqueID] = subject[UniqueID];
                        promises.push(controller.upsertDocument(CollectionName,queryObject,queryObject));
                    }
                }
            }
            Promise.all(promises).then(x=>{
                res.send("Completed");
            });
        }else res.send(JSON.stringify({Message:"Request Failed"}));
    });
})
.listen(ports.webServer);