const { Socket } = require("net");

/**
 * Interprocess communication client used within an open process
 */
class ipcClient{
    /**
     * Creates an ipcClient
     * @param {string|Socket} [ctnString] String to connect the ipcClient to the server or a direct Socket
     */
    constructor(ctnString){
        this.subscribers = new Object();
        this.handshake = null;
        this.perishable = false;
        this.connection = typeof(ctnString) === "string"? ctnString : null;
        this.args = process.argv.reduce((a,c)=>{
            if(c === "{perishable}")this.perishable = true;
            else if(c.includes("handshake="))this.handshake = c.split("=")[1];
            else if(c.includes("connection=") && (ctnString === null || ctnString === undefined))this.connection = c.split("=")[1];
            else a.push(c);
            return a;
        },[]);
        if(ctnString instanceof Socket){
            ctnString.on("data",this.receive.bind(this));
            this.socket = ctnString;
        }else if(this.connection !== null){
            var sock = require("net").connect(this.connection).once("connect",()=>{
                if(this.handshake!==null)this.socket.write(this.handshake);
                if(Reflect.has(this.subscribers,"connected") && typeof(this.subscribers["connected"]) === "function")
                    this.subscribers["connected"].call(this);
            }).on("error",r=>{throw r;}).on("data",this.receive.bind(this));
            this.socket = sock;
        }
    }
    /**
     * A Callback that's called when a channel has been sent data to
     * @callback subscriberCallBack
     * @param {any} data Data that has been received 
     */
    /**
     * Subscribe a callback with a channel name
     * @param {string} method Name of the event to subscribe to
     * @param {subscriberCallBack} callBack The Callback to call when the event on the subscriber is triggered
     */
    on(method,callBack){/// returns socket as argument
        if(typeof(callBack) === "function")
            this.subscribers[method] = callBack;
        return this;
    }
    /**
     * Send data to the connected IPC Server  
     * @param {string} method Name of channel to send data to
     * @param  {...any} args The data to send
     */
    send(method,...args){
        this.socket.write(JSON.stringify({method:method,arguments:args}));
    }
    /**
     * Ends the current perishable connection
     * @callback endConnectionFunction
     * @param {string} data Data to return after ending the connection
     * @returns {void}
     */
    /**
     * A callback that contains the task to complete when the connection begins
     * @callback beginConnectionCallBack
     * @param {Object} package Object sent from the initial connection
     * @param {endConnectionFunction} endConnection Call this method to end the connection
     * @returns {void}
     */
    /**
     * Starts connecting to a perishable socket  
     * @param {beginConnectionCallBack} callBack The task to complete on connection
     */
    beginConnection(callBack){
        if(this.perishable){
            this.on("beginrequest",d=>{
                new Promise((rs,rj)=>{
                    var sendBack = function(value){this.send("endrequest",value);rs();}.bind(this);
                    if(typeof callBack === "function")var bound = callBack.call(this,d,sendBack);
                }).then(x=>{process.exit()});
            });
        }else throw "not a perishable connection";
    }
    /**
     * A function that governs raising events on subscribers called from the socket 
     * @param {Buffer} data Buffered data from the socket
     */
    receive(data){
        var ee = data.toString();
        var _p = JSON.parse(ee);
        if(typeof(_p) === "object" && !Array.isArray(_p) && Reflect.has(_p,"method") && Reflect.has(_p,"arguments"))
            if(this.subscribers !== undefined && Reflect.has(this.subscribers,_p.method))
                this.subscribers[_p.method].apply(this,_p.arguments);
    }
}

/**
 * Interprocess communication Server that creates processes and manages moving data between them
 */
class ipcServer{
    /**
     * Create an IPCServer
     * @param {string} ctnString Connection string to start listening on e.g port number
     */
    constructor(ctnString){
        this.subscribers = {};
        this.connection = ctnString;
        this.server = require("net").createServer().on("connection",socket=>{
            socket.once("data",data=>{
                var handshake = data.toString();
                if(Reflect.has(this.subscribers,handshake)){
                    this.subscribers[handshake].call(this,socket);
                };
            });
        }).listen(ctnString);
    }
    /**
     * Open process, wait for handshake then, return ipcClient and keeps connection alive
     * @param {string} script Path to the script to open a new process
     * @param  {...string} args Arguments to pass on to the process
     * @returns {ipcClient} The client to send commands through
     */
    openProcess(script,...args){
        return new Promise((resolve,reject)=>{
            var handshake = ipcServer.UID();
            var arg = args.concat([`handshake=${handshake}`,`connection=${this.connection}`]);
            this.subscribers[handshake] = (s)=>resolve(new ipcClient(s));
            if(script.endsWith(".js")){
                require("child_process").fork(script,arg);
            }else{
                require("child_process").spawn(script,arg);
            }
        });
    }
    /**
     * Opens process, waits for handshake, waits for job to complete, kills the process, then returns results
     * @param {object} dataToSend Data that is sent immediately upon connection 
     * @param {string} script Path to the script to create a new process
     * @param  {...string} args Arguments to pass on to the process
     * @returns {Promise<string>} A promise used to wait for the process to complete
     */
    openTempProcess(dataToSend,script,...args){
        return new Promise((resolve,reject)=>{
            this.openProcess.apply(this,[script].concat(args.concat(["{perishable}"]))).then(x=>{
                x.on("endrequest",(results)=>resolve(results));
                x.send("beginrequest",dataToSend);
            });
        });
    }
    /**
     * Generates a random Unique Identifier
     * @param {number} [groups]  Quantity of groups of characters. default: 5
     * @param {number} [chars] Number of characters within the groups. default: 5
     * @returns {string} Returns the Unique Identifier as a string
     */
    static UID(groups = 5, chars = 5) {
        var a = [];
        var gen = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "x", "y", "z"];
        for (var i = 0, str = ""; i < groups; i++ , a.push(str), str = "")
            for (var t = 0; t < chars; t++)str += gen[Math.floor(Math.random() * gen.length)];
        return a.join("-");
    }
}

module.exports = { ipcClient , ipcServer };