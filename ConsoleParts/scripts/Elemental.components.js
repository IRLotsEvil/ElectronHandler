document.predefinedTranslations = {
    "combobox":{
        tag:"button",
        class:"select{#noarrow: noArrow}{#leftmenu: leftmenu} {$className}",
        style:"{$style}",
        selection:"",
        "{selection}selectionchanged":"{&selectionchanged}",// Call this function when selection changes//
        dataName:{value:"{$name}",attribute:false},
        children:["{$placeholder}",{tag:"div",children:"{%}"}]
    },
    "item":{
        tag:"label",
        children:[
            {tag:"input",type:"radio",name:"{<2:dataName}", value:"{$value}", onclick:function(){
                var _parent = this.parentElement.parentElement.parentElement;
                var _v = this.value;
                _parent.selection = _v;
            }},
            {tag:"span",children:"{%}"}
        ]
    },
    "menu":{
        tag:"button",
        class:"select {$className} noArrow{#leftmenu: leftmenu}",
        style:"{$style}",
        children:["{$content}",{tag:"div",children:"{%}"}]
    },
    "menuitem":{
        tag:"label",
        children:[
            {tag:"input", onclick:"{&onclick}", type:"button"},
            {tag:"span",children:"{%}"}
        ]
    },
    "modal":{
        tag:"label",
        class:"modal",
        children:[
            {tag:"span", children:"{$content}"},
            {tag:"input", type:"checkbox"},
            {tag:"div",children:{
                tag:"label", children:[{tag:"input",type:"text"},"{%}"]}
            }
        ]
    },

    //  <datatable> // constructs a populated object
    //  </datatable>
    "datatable":{
        tag:"table",
        addProperty:function(name,value){
            if(this.targetList.every(x=>x.name!==name) && name !== "")
                this.targetList = this.targetList.concat([{name:name,value:value}]);
        },
        removeProperty:function(name){
            if(name !== ""){
                var nm = this.targetList.findIndex(x=>x.name==name);
                if(nm > -1)this.targetList = this.targetList.slice(0,nm).concat(this.targetList.slice(nm).slice(1));
            }
        },
        updateProperty:function(name,value){
            if(name !== ""){
                var nm = this.targetList.findIndex(x=>x.name==name);
                if(nm > -1)this.targetList = this.targetList.slice(0,nm).concat([{name:name,value:value}]).concat(this.targetList.slice(nm).slice(1));
            }
        },
        targetList:{value:[],attribute:false},
        "{targetList}datachange": function(e){ // everytime it changes rerender//
            var a = this.querySelectorAll("tr:first-child ~ *"); // every child proceeding the first//
            a.forEach(o=>o.remove());
            e.value.forEach(i=>this.appendChild({tag:"property", name:i.name,value:i.value}));
        },
        "{targetList}datachanged": "{&datachange}",//Connect the datachanging to a new event
        children:[{tag:"tr",children:[
                    {tag:"td", children:{tag:"input",type:"text",class:"name"}},
                    {tag:"td", children:{tag:"input",type:"text",class:"value"}},
                    {tag:"td", children:{tag:"button",children:"+", onclick:function(){
                        var _parent = this.parentElement.parentElement;
                        var _grandparent = _parent.parentElement;
                        _grandparent.addProperty(_parent.querySelector("input.name").value,_parent.querySelector("input.value").value);
                        _parent.querySelector("input.name").value = "";
                        _parent.querySelector("input.value").value = "";
                    }}} 
                ]
            },"{%}"
        ]
    },
    "property":{ // <property name="foo" value="bar"></property>
        tag:"tr",
        name:"{$name}",
        children:[
            {tag:"td",children:"{$name}"},
            {tag:"td",children:{tag:"input",type:"text",value:"{$value}"}},
            {tag:"td",children:[
                {tag:"button",children:"x", style:"background-color: rgb(255, 71, 71);", onclick:function(){
                    var _parent = this.parentElement.parentElement;
                    var _grandparent = _parent.parentElement;
                    _grandparent.removeProperty(_parent.getAttribute("name")); 
                }},
                {tag:"button",children:"^", style:"background-color: rgb(255, 217, 4);", onclick:function(){
                    var _parent = this.parentElement.parentElement;
                    var _grandparent = _parent.parentElement;
                    _grandparent.updateProperty(_parent.getAttribute("name"),_parent.querySelector("input[type=text]").value); 
                }}
            ]}
        ]
    },
    "tabcontrol":{
        tag:"div",
        dataname:"{$name}",
        children:"{%}"
    },
    "tabitem":{
        
    }
}