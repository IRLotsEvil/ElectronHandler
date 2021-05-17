Element.prototype.queryElemental = function(query="",extension={}){
    var format = {};
    var formatter = null;
    var Signifiers = [];
    var AddSignifier = (items=[])=>{
        var sig = "signifier-" + Math.round(Math.random()*5000) + "-" + Math.round(Math.random()*5000);
        items.forEach(x=>x.setAttribute(sig,"#"));
        Signifiers.push(sig);
        return sig;
    }
    extension["#"] = (text,type) => "["+ AddSignifier(Array.from(this.querySelectorAll("*")).filter(x=>Array.from(x.childNodes).find(a=>
            (a instanceof Text && a.wholeText.replace(/\s/g,"") !== "" && ((type === "" && a.wholeText === text) || (type === "*" && a.wholeText.includes(text)))))
        ))+"]";
    extension["%"] = (text="",type) =>
    {
        format["*"] = type === "";
        text.split(",").forEach(x=>{format[x] = type !== "";});
    }
    extension["$"] = (text="") =>{ formatter = text; }
    var q = query.replace(/\[([^\w\s])([^\w\s]?)=(?:'|")(.*?)(?:'|")\]/g,(m,type,qualifier,text)=>{
        if(Reflect.has(extension,type) && typeof(extension[type]) === "function" && text !== "")
        {
            var val = extension[type](text,qualifier);
            return (val)?val:"";
        }else return "";});
    var lines = Array.from(this.querySelectorAll(q));
    if(Signifiers.length>0)this.querySelectorAll(Signifiers.map(x=>"["+x+"]").join(",")).forEach(x=>{
        Signifiers.forEach(y=>{if(x.getAttribute(y))x.removeAttribute(y);});
    });
    return lines;
}
Element.prototype.queryObject = function(objectOrArray){
    var target = (Array.isArray(objectOrArray) ? objectOrArray : [objectOrArray]);
    if(target.every(x=>Reflect.has(x,"Nodes"))){
        return target.map(x=>{
            const { Nodes, Name } = x;
            if(Array.isArray(Nodes) && Nodes.some(y=>y.IsUnique)){
                var UNode = Nodes.find(y=>y.IsUnique);
                return { CollectionName : Name, UniqueID : UNode.Name, Results:this.queryElemental(x.Query).map(y=>y.queryObject(x["Nodes"])) };
            }else return null;
        }).filter(x=>x != null);
    }else{
        return target.reduce((a,x)=>{
            if(typeof x === "object"){
                var o = Object.getOwnPropertyNames(x);
                if(o.includes("Name")){
                    if(o.includes("Query")){
                        var subjects = this.queryElemental(x.Query).map(subject=>{
                            if(o.includes("Children") && Array.isArray(x["Children"]) && x["Children"].length>0){
                                x["Children"].forEach(y=>{if(Reflect.has(y,"Name") && Reflect.has(y,"IsUnique") && y["IsUnique"])a["UniqueID"] = y.Name;});
                                return subject.queryObject(x["Children"]);
                            }else if(o.includes("Attributes") && Array.isArray(x["Attributes"]) && x["Attributes"].length>0) return subject.queryObject(x["Attributes"]);
                            else return subject.innerText.replace(/[\n\r\t]/g," ");
                        });
                        if(subjects.length > 0)a[x.Name] = subjects.length > 1 ? subjects : subjects[0]; 
                    }else if(o.includes("AttributeName"))a[x.Name] = this.getAttribute(x["AttributeName"]);     
                }
            }
            return a;
        },{});
    }
}
const { ipcRenderer } = require('electron');
ipcRenderer.on('Compile', (e,request)=>{
    if(typeof(request) === "object"){
        const { Queries, QueryDelay } = request;
        setTimeout(function(){ipcRenderer.send("message", document.querySelector("html").queryObject(Queries));},QueryDelay);
    }else ipcRenderer.send("message", {Message : "Package isn't an Object"});
});