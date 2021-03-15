
const fs = require("fs");

class PipeController{
    /**
     * Class Combining and sending data down pipes
     */
    constructor(){
        this.names = {};
        this.attempts = 5;
    }
    /**
     * Add a new named pipe
     * @param {string} name Name of the named pipe to add
     */
    addPipe(name){
        if(!Reflect.has(this.names,name)){
            fs.access(`\\\\.\\pipe\\${name}`,(a,b)=>{
                if(a)console.log(a.message);
                else this.names[name] = 0;
            });
        }
    }

    /**
     * Send data down all the pipes
     * @param {string} data Data to transmit to all pipes
     */
    transmitToPipes(data){
        for(let name in this.names){
            fs.access(`\\\\.\\pipe\\${name}`,a => {
                if(a){
                    this.names[name] += 1;
                    if(this.names[name] === this.attempts)Reflect.deleteProperty(this.names,name);
                }
                else {
                    var stream = fs.createWriteStream(`\\\\.\\pipe\\${name}`,{autoClose:true}).on("ready",()=>{
                        stream.write(data);
                        stream.close();
                    });
                }
            });
        }
        return true;
    }
}

module.exports = {PipeController};