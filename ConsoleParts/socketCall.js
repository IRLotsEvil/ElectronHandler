var blueprints = {};
function MessageCentre(address){
    var messages = [];
    var isScrolling = true;
    const socket = io(address);
    function updateConsole(msg = []){
        console.log(msg);
        this.innerHTML = "";
        msg.forEach((x,i)=>{
            const { type, value } = x;
            var stringified = typeof(value) !== "string"? JSON.stringify(value) : value;
            var container = {tag:"div",children:[],class:"messageContainer"};
            var div = {tag:"div",children:stringified,class:type};
            if(type === "command")div["onclick"] = function(){
                document.querySelector(".select.bottomCorner input[value='executecommand']").checked = true;
                document.querySelector(".commandBox").innerText = stringified
            };
            container["children"].push({tag:"div",class:"indexNumber",children:i});
            container["children"].push(div);
            this.appendChild(container.convert());
        });
        if(isScrolling){
            var scrolling = Array.from(this.querySelectorAll("div")).reduce((a,c)=>a + c.offsetHeight,0);
            this.scrollTo(0,scrolling);
        }
    }
    var activeBlueprint,constructed,container = null;
    function sendFromBox(){
        var box = document.querySelector(".commandBox");
        var selectionBox = document.querySelector(".select.bottomCorner input:checked").value;
        var arg = document.querySelector(".select.bottomCorner input:checked").getAttribute("argument");
        if(selectionBox === "request"){
            var previewPanel = document.querySelector(".objectPreview .panel");
            if(container === null || (constructed !== null && constructed.requestName !== arg)){
                container = {};
                constructed = {requestItem:"",requestName:arg};
                activeBlueprint = Array.from(Object.getOwnPropertyNames(blueprints[arg]));
                document.querySelector(".objectPreview").classList.remove("hidden");
            }
            container[activeBlueprint.shift()] = box.innerText;
            previewPanel.innerHTML = "";
            var table = {tag:"table",children:[]};
            Object.getOwnPropertyNames(blueprints[constructed.requestName]).forEach(name => {
                var tr = {tag:"tr",children:[{tag:"td", children: name},{tag:"td", children: ""}]};
                if(Reflect.has(container,name))
                    tr["children"][1]["children"] = container[name];
                table["children"].push(tr);
            });
            previewPanel.appendChild(table.convert());
            if(activeBlueprint.length === 0){
                document.querySelector(".objectPreview").classList.add("hidden");
                constructed["requestItem"] = container;
                socket.emit("objectrequest",constructed);
                container = null;
            }
        }else{ 
            container = null;
            socket.emit(selectionBox,box.innerText);
        }
        box.innerText = "";
    }
    function init(){
        document.querySelector("body").appendChild({
            tag:"div",
            class:"container",
            children:[
                {
                    tag:"div",
                    class:"toolbar",
                    children:[
                        {tag:"button", class:"select dropdownmenu left menubutton", style:"width:80px;float:right;padding:0;text-align:center",children:[
                            "Tools",
                            {tag:"div",children:[
                                {tag:"label",children:[
                                    {tag:"input", type:"radio"},{tag:"span",children:"Clear console",onclick:()=>{
                                        socket.emit("clearconsole");
                                    }}
                                ]},
                                {tag:"label",class:"scrollButton",children:[
                                    {tag:"input", type:"checkbox", onclick:function(){isScrolling = this.checked;}},{tag:"span",children:"Auto Scroll"}
                                ]}
                            ]}
                        ]}
                    ]
                },
                {tag:"div",class:"consoleDisplay",_init:function(){
                    var bound = updateConsole.bind(this);
                    socket.emit("connection","Hello");
                    socket.on("msg",bound);
                    socket.on("overwrite",d=>{
                        messages = [];
                        this.innerHTML = "";
                        bound(d);
                    });
                }},
                {
                    tag:"div",
                    class:"objectPreview hidden",
                    children:[
                        {
                            tag:"div", 
                            class:"previewBar",
                            children:{
                                tag:"button",
                                class:"cancelConstruct",
                                children:"Cancel",
                                onclick:function(){
                                    container = null;
                                    document.querySelector(".objectPreview").classList.add("hidden");
                                }
                            }
                        },
                        {tag:"div", class:"panel"}
                    ]
                },
                {
                    tag:"div",
                    class:"commandBox_container",
                    children:[
                        {tag:"button",class:"sendButton",onclick:function(){
                            sendFromBox();
                        }},
                        {tag:"div",class:"commandBox",contenteditable:true,onkeydown:function(e){
                            if(e.code === "Enter"){
                                e.preventDefault();
                                sendFromBox();
                            } 
                        }},
                        {tag:"button", class:"select above bottomCorner", style:"height: 50px;line-height: 46px;",children:[
                            "Choose...",
                            {
                                tag:"div",
                                id:"combobox",
                                children:[
                                    {tag:"label",children:[
                                        {tag:"input", type:"radio", name:"choice", value:"logmessage"},
                                        {tag:"span",children:"Message"}
                                    ]},
                                    {tag:"label",children:[
                                        {tag:"input", type:"radio", name:"choice", value:"executecommand"},
                                        {tag:"span",children:"Command"}
                                    ]}
                                ]
                            }
                        ]}
                    ]
                }
            ]
        }.convert());
        
    }
    if(document.querySelector("body") === null)
        window.onload = init;
    else 
        init();
}
function updateBox(bs){
    blueprints = bs;
    Object.getOwnPropertyNames(blueprints).forEach(x=>{
        document.querySelector("#combobox").appendChild({tag:"label",children:[
            {tag:"input", type:"radio", name:"choice", argument:x, value:"request"},{tag:"span",children:x}
        ]}.convert());
    });
}