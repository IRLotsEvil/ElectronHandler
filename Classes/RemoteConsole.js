const iosocket = require("socket.io");
const express = require("express")();
const path = require("path");
const fs = require("fs");
class RemoteConsole{
    constructor(socketport,serverport){
        this.localAddress = (require('os').networkInterfaces()["Ethernet"].find(x=>x.family==="IPv4").address || "127.0.0.1");
        if(!serverport) serverport = parseInt(socketport) + 1;
        this.messages = [];
        this.consoleFunctions = {};
        this.socket = iosocket.listen(socketport);
        this.socket.on("connection",sock=>{
            sock.emit("overwrite",this.messages);
            sock.on("clearconsole",()=>{
                this.messages = [];
                this.socket.sockets.emit("overwrite",[]);
            });
            sock.on("executecommand",msg=>
            {
                this.log(msg,"command");
                eval(msg);
            });
            sock.on("logmessage",msg=>this.log(msg));
            sock.on("objectrequest",msg=>{
                const { requestItem, requestName } = msg;
                this.log(requestItem,"request");
                if(Reflect.has(this.consoleFunctions,requestName) && typeof(this.consoleFunctions[requestName].callback) === "function"){
                    this.consoleFunctions[requestName].callback(requestItem);
                }
            });
        });
        express.use(require("express").static(path.join(__dirname,"../ConsoleParts"))).get("/",(req,res)=>{
            var blueprints = JSON.stringify(Object.getOwnPropertyNames(this.consoleFunctions).reduce((a,c)=>{
                a[c] = this.consoleFunctions[c].blueprint;
                return a;
            },{}));
            fs.readFile(path.join(__dirname,'../ConsoleParts',"index.htm"),(x,y)=>{
                if(x)throw x;
                res.send(y.toString().replace(/<body>([\w\W]+)<\/body>/g,(r,txt)=>`<body>${txt}<script>MessageCentre("http://${this.localAddress}:${socketport}");
                updateBox(${blueprints});
                </script></body>`));
            });
        }).listen(serverport);
        console.log(`http://${this.localAddress}:${serverport}/`);
    }
    log(msg,type = "message"){
        this.messages.push({type:type, value:msg});
        console.log(msg);
        if(this.socket !== null)this.socket.sockets.emit("msg",this.messages);
    }
    addFunction(name,consolefunction){
        if(!Reflect.has(this.consoleFunctions,name)){
            this.consoleFunctions[name] = consolefunction;
        }
        return this;
    }
}

class ConsoleFunction{
    constructor(blueprint, callback){
        this.blueprint =  blueprint;
        this.callback = callback;
    }
}

module.exports = {RemoteConsole,ConsoleFunction};