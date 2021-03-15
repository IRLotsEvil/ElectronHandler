
function typeisof(target,deep = false){
    if(target === undefined)return "undefined";else
    if(target === null)return "null";else
    if(target === NaN)return "NaN";else
    if(typeof(target) === "object")return deep ? (function(r = []){for(var s = Object.getPrototypeOf(target);s !== null;s = Object.getPrototypeOf(s))r.push(s.constructor.name);return r.length === 1 ? r[0]:r;})(): Object.getPrototypeOf(target).constructor.name;else
    return typeof(target);
}

// Case Insensitive variant of Reflect.has();
Object.prototype.hasKind = function(target,stringName){
    for(a in target)if(a.toLowerCase() === stringName.toLowerCase())return true;
        return false;
}

// A more in depth oftype function
Object.prototype.ofType = function(typeName="",exact = true){
    typeName = typeName.toLowerCase();
    if(this === null)return typeName === "null";
    return exact ? Object.getPrototypeOf(this).constructor.name.toLowerCase() === typeName.toLowerCase() :
    (function traverse(){return Object.getPrototypeOf(this).constructor.name.toLowerCase() === typeName.toLowerCase() ? true : traverse.call(Object.getPrototypeOf(this));}).call(this); 
}

// Short hand for this.ofType("Object") and it also emulates Array.isArray()
Object.prototype.isObject = function(){return this.ofType("Object");}// Short hand


// Quick way of Stringing together short construction commands for temporary objects//
// Set/Add Property Value
// {}.to("a","Hello") -> {"a","Hello"};
//
// Set/Add Property Value on condition
// {}.to("a","Hello", true) -> {"a","Hello"};
// {}.to("a","Hello", false) -> {};
//
// Set/Add Property Value on condition with a false value if it fails
// {}.to("a","Hello", true, "Good Bye!!") -> {"a","Hello"};
// {}.to("a","Hello", false, "Good Bye!!") -> {"a","Good Bye!!"};
//
// Set/Add Property Value based on a functional condition with a false value if it fails
// {}.to("a","Hello", function(){return true;}, "Good Bye!!") -> {"a","Hello"};
// {}.to("a","Hello", function(){return false;}, "Good Bye!!") -> {"a","Good Bye!!"};
// {}.to("a","Hello", function(){return null;}, "Good Bye!!") -> {};
//
// Set/Add Property Value based on a functional condition and call either the true function if it passes true or give a false value if it fails
// {}.to("a",function(){return "I've been sent from a function"}, function(){return true;}, "Good Bye!!") -> {"a","I've been sent from a function"};
// {}.to("a",function(){return "I've been sent from a function"}, function(){return false;}, "Good Bye!!") -> {"a","Good Bye!!"};
// {}.to("a",function(){return "I've been sent from a function"}, function(){return null;}, "Good Bye!!") -> {};
//
// Set/Add Property Value based on a functional condition and call either the true function if it passes true or call a false function if it fails
// {}.to("a",function(){return "I've been sent from a true function"}, function(){return true;}, function(){return "I've been sent from a false function"}) -> {"a","I've been sent from a true function"};
// {}.to("a",function(){return "I've been sent from a true function"}, function(){return false;}, function(){return "I've been sent from a false function"}) -> {"a","I've been sent from a false function"};
// {}.to("a",function(){return "I've been sent from a true function"}, function(){return null;}, function(){return "I've been sent from a false function"}) -> {};



Object.prototype.to = function to(){
    function standard(propName, value){this[propName] = value;}
    function conditional(condition, propName){this[propName] = condition.call()}
    if(arguments[0].ofType("string") && arguments[1])standard.apply(this,Array.from(arguments));
    else if(typeof(arguments[0]) === "function" && typeof(arguments[1]) === "string")standard.apply(this,Array.from(arguments));
    return this;
}

/* 
Object.hasField is:
1. A function that checks if object contains field: 
 Object.hasfield({"bob":"moo"},"bob") -> true;
 
2. function that checks if object contains field of type:
 Object.hasfield({"bob":"moo"},"bob","String") -> true;

3. function that checks if the object contains functional field then calls it and returns results
 Object.hasfield({"bob":function(){return "i'm the result";}},"bob",null) -> "i'm the result";

4. function that checks if the object contains functional field then calls it with arguments and returns results
 Object.hasfield({"bob":function(arg){return "Returned argument is : " + arg;}},"bob",null,"Passed from argument") -> "Returned argument is : Passed from argument";
*/ 
Object.prototype.hasField = function(propertyName,typeNameorthisArg){
    if(Reflect.has(this,propertyName)){
        if(typeNameorthisArg){
            return typeNameorthisArg.ofType("String") ? 
                this[propertyName].ofType(typeNameorthisArg) : 
                typeNameorthisArg.ofType("Object") && this[propertyName].ofType("function")?this[propertyName].call(typeNameorthisArg,Array.from(arguments).slice(2)):false;
        } else return true;
    }
    return false;
}
///{"PropertyName":"typeNameorthisArg"}
Object.prototype.hasFields = function(map){ 
    return Object.getOwnPropertyNames(map).every(function(name){
        var tester = (map[name].ofType("Array")?map[name] : [map[name]]).find(function(item){return this.hasField(name,item)},this);
        return tester?true:false;
        },this);
}

Object.prototype.setDynamic = function(name,options){
    var that = this;
    if(!this.hasField("_"+name)){
        var descriptor = (function getDescriptor(){
            var d = Object.getOwnPropertyDescriptor(this,name);
            return d ? d: Object.getPrototypeOf(this) !== Object.prototype ? getDescriptor.call(Object.getPrototypeOf(this)) : null; 
        }).call(this);
        var hiddenProperty = {
            value:options && options.hasField("value")?options["value"]:this[name],
            addNotifier: function(target, foreignPropertyName, fromSource, fromTarget){
                if(!target || !Reflect.has(target,foreignPropertyName))return;
                function notifier(p,t,v){
                    var value = t(v);
                    if(p !== null){ 
                        if(this[p] != value)this[p] = value; 
                    }else
                        if(this._get() != value)this.setter(value);
                }
                if(fromTarget || !fromSource && !fromTarget){
                    if(!Reflect.has(target,"_"+foreignPropertyName))target.setDynamic(foreignPropertyName);
                    target["_"+foreignPropertyName].setter = target["_"+foreignPropertyName].setter.bind(target["_"+foreignPropertyName],notifier.bind(this,null,fromTarget||function(value){return value;}));
                }
                if(fromSource || !fromSource && !fromTarget){
                    var func = (fromSource||function(value){return value;}).bind(that);
                    var exists = Reflect.has(target,"_"+foreignPropertyName);
                    var notifierConstruct = notifier.bind(exists?target["_"+foreignPropertyName]:target,exists?null:foreignPropertyName,func);
                    this["setter"] = this["setter"].bind(this,notifierConstruct);
                }
            },
            setter:function(){//go through all the bound functions after setting the value setting our value//
                var args = Array.from(arguments);
                var value = !args[args.length-1].ofType("function") ? args.pop() : null;
                this._set(value);
                for(var i =0, v=args[i];i<args.length;i++, v = args[i])if(typeof(v) === "function")v(value);
                if(this["propertyChanged"] !== null && typeof(this["propertyChanged"]) === "function")this["propertyChanged"].call(that,{propertyName:name,newValue:value});
            },
            "_get":descriptor && descriptor.hasField("get") ? descriptor["get"].bind(this) : function(){return this["value"];},
            "_set":descriptor && descriptor.hasField("set") ? descriptor["set"].bind(this) : function(value){
                this["value"] = value; 
                if(typeisof(that) === "CSSStyleDeclaration")that.setProperty(name,value);else 
                if(that.ofType("Element") && options && options.hasField("attribute") && options["attribute"])that.setAttribute(name,value);
            },
            propertyChanged: options && options.hasField("onpropertychanged","function")? options["onpropertychanged"] : null
        }
        Object.defineProperties(this,{}.to("_"+name,{value:hiddenProperty}).to(name,{enumerable:true,get:function(){return this._get();}.bind(hiddenProperty),set:function(value){this.setter(value)}.bind(hiddenProperty)}));
        var type = typeisof(this,true);
        var _ISELEMENT = Array.isArray(type) ? type.includes("Element") : false;
        var _FORMELEMENT = (this.tagName === "INPUT" || this.tagName === "TEXTAREA") && name === "value";
        var _CONTENTEDIT = this.isContentEditable && (name === "innerHTML" || name === "innerTEXT");
        if(_ISELEMENT && (_FORMELEMENT || _CONTENTEDIT))this.addEventListener("input",function(e){this["_"+name].setter(this[name]);});
    }
    if(options && options.hasField("notifier")){
        notifier = options["notifier"].ofType("Array") ? options["notifier"] : [options["notifier"]];
        for(var i=0,n=notifier[i];i<notifier.length;i++,n=notifier[i]){
            if(n.hasField("target") && n.hasField("propertyName")){
                this["_"+name].addNotifier(n["target"],n["propertyName"],n.hasField("onsourcechange")?n["onsourcechange"]:null,n.hasField("ontargetchange")?n["ontargetchange"]:null);
            }
        }
    }
    if(options && options.hasField("value"))this[name] = options["value"];
    var val = this["_"+name]._get();
    if(options && options.hasField("attribute") && options["attribute"] && (typeof(val) === "number" || typeof(val) === "string" || typeof(val) === "boolean"))
        this.setAttribute(name,val);
}
Object.prototype.hooks= [];//[function]
RegExp.prototype.matchAll = function(value){
    if(this.global){
        var results = [];
        for(var r = this.exec(value);r !== null;r = this.exec(value))results.push(r);
        return results;
    }
}
Object.prototype.fromXPath = function xPathSkin(xpathAndResult,results=[]){
    if(typeof(xpathAndResult) === "string")xpathAndResult = document.evaluate(xpathAndResult, this, null, XPathResult.ANY_TYPE);
    var result = xpathAndResult.iterateNext();
    return result !== null ? xPathSkin(xpathAndResult,results.concat([result])) : results;
}
Document.prototype.conversionOptions = {
    "-":function(name,value){
        var test = value.isObject()? value : {attribute:true,value:value};
        this.setDynamic(name,test);
    },
    "/^on(\\w+)/":function(value,results){
        if(typeisof(value) === "function"){
            this.addEventListener(results[1],value);
        }
    },
    "children":function(name,value){
        value = value.ofType("Array")?value:[value];
        for(var i=0, a = value[i]; i< value.length;i++, a=value[i]){
            var o = typeisof(a,true);
            if(o === "string"||o === "number")this.appendChild(document.createTextNode(a));else
            if(Array.isArray(o) && o.find(function(e){return e === "Node"}))this.appendChild(a);else
            if(a.isObject() && Object.hasKind(a,"tag"))this.appendChild(a.convert());
        }
    },
    "/([\\w-_]+)([=<>])(?:{(.+)})?\\[(.+)\\]/" : function(value,results){
        if(!this.hasField("_append","function")){
            this["_append"] = function(){
                Array.from(arguments).forEach(function(item){if(typeof(item) === "function")item();},this);
                Reflect.deleteProperty(this,"_append");
            }
        }
        this["_append"] = this["_append"].bind(this,function(){
            var func = function(propertyName,mode,xpathOrTarget,foreignProperty,newValue,currentTarget){
                var target = (xpathOrTarget ? typeof(xpathOrTarget) === "string" ? (function(r){return r.length>0? r[0] : null;})(this.fromXPath(xpathOrTarget)) : typeof(xpathOrTarget) === "object" ? xpathOrTarget : null:this); 
                if(target !== null && (!currentTarget || currentTarget === target)){
                    foreignProperty = foreignProperty.split(".");
                    target = foreignProperty.splice(0,foreignProperty.length-1).reduce(function(a,c){return a !== null && target.hasField(c) ? a[c] : null;},target);
                    if(Array.isArray(foreignProperty) && foreignProperty.length === 1)foreignProperty = foreignProperty[0];
                    var isReg = newValue && (newValue.includes("{+}") || newValue.includes("{-}"));
                    var fromSource = isReg && (mode === "=" || mode === ">")? function(value){ // when a value goes in it looks like this
                        var foreignValue = typeisof(target[foreignProperty]) === "CSSStyleDeclaration" ? target[foreignProperty].cssText : target[foreignProperty];
                        var currentValue = foreignValue === "" ? newValue : foreignValue; // value created if there is no value set on the target;
                        var reg = "("+newValue.split(/{[+#]}/g).map(function(a){return a.replace(/{-}|[.+*?|^$\\()]/g,function(m){return m === "{-}" ? ".*": m.length === 1 ? "\\"+m : m;})}).join(").*(")+")";
                        return new RegExp(reg,"g").exec(currentValue).slice(1).join(value);
                    }.bind(this):null;
                    var fromTarget = isReg && (mode === "=" || mode === "<") ? function(value){
                        var isNumber = false;
                        var captured = new RegExp(newValue.replace(/{[+#]}|{-}|[.+*?|^$\\()]/g,function(m){
                            if(m.length>1 && m !== "{-}")isNumber = (m === "{#}");
                            return m === "{+}"||m === "{#}" ? "(.*)": m === "{-}" ? ".*": m.length === 1 ? "\\"+m : m;
                        }),"g").matchAll(value);
                        if(captured.length>0) return isNumber ? isNaN(Number(captured[0][1])) ? 0: Number(captured[0][1]) : captured[0][1];
                        throw "No Value was extracted";
                    }.bind(this):null;
                    document.conversionOptions["-"].call(this,propertyName,{notifier:{target:target,propertyName:foreignProperty,onsourcechange:fromSource,ontargetchange:fromTarget}});
                    this[propertyName] = this[propertyName];
                }
                return target?true:false;
            };
            var test = results[3] ? this.fromXPath(results[3]) : null;
            test = test && test.length > 0 ? test[0] : this;
            func.call(this,results[1],results[2],test,results[4],value);

        }.bind(this));
    }
}

Object.prototype.convert = function(){
    if(this.hasField("tag")){
        var element = document.createElement(this["tag"]);
        var _init = this["_init"];
    Object.getOwnPropertyNames(this).filter(function(v){return v !== "tag" && v !== "_init" && v !== "_append"}).forEach(function(objectName){
            (function(name){
                if(!name)document.conversionOptions["-"].call(element,objectName,this[objectName]);
                else if(name.startsWith("/") && name.endsWith("/")){
                    var results = [];
                    for(var r=new RegExp(name.substring(1,name.length-1),"g"),result = r.exec(objectName);result !== null;result = r.exec(objectName))results.push(result);
                    if(document.conversionOptions[name].ofType("function")){document.conversionOptions[name].apply(element,[this[objectName]].concat(results));}
                }else document.conversionOptions[name].call(element,objectName,this[objectName]);
            }).call(this,Object.getOwnPropertyNames(document.conversionOptions).find(function(conversionName){
                return (conversionName.startsWith("/") && conversionName.endsWith("/") && new RegExp(conversionName.substring(1,conversionName.length-1),"g").test(objectName) || objectName === conversionName);
            })); 
        },this);
        if(typeof(_init) === "function")_init.call(element);
        return element;
    }
}

Document.prototype.predefinedTranslations = {}
Element.prototype.translateTo = function(el){
    if(el === null)return;
    var that = this;
    var _valueSkinner = {
        "#" : function(n,a){ 
            return (that.hasAttribute(n) || Reflect.has(that,n))? (a ? a : n): "";
        }, // returns name if it exists// if string and name exist return string//
        "$" : function(n){return that.hasAttribute(n) ? that.getAttribute(n) : Reflect.has(that,n) ? that[n] : "";}, // return value of property or attribute//
        "%" : function(){return Array.from(that.childNodes);},// transfer all children//
        "<" : function(n,a){
            var _parent = that;
            var par = n === ""? 1 : Number(n);
            if(!isNaN(par))for(var i = 0; i< par | _parent === null; i++)_parent = _parent.parentElement;else return "";
            if(_parent !== null)return _parent.hasAttribute(a) ? _parent.getAttribute(a) : (Reflect.has(_parent,a) ? _parent[a]:"");
            return "";
        },// return value of parent's property or attribute//
        "&" : function(n){
            var func = that.hasAttribute(n) ? that.getAttribute(n) : Reflect.has(that,n) ? that[n] : "";
            return typeof(func) === "function" ? func : function(e){ eval(func)};
        }
    }
    var _E_ = function(value){
        for(var r = /{\[(\W)(.*?)\]}/,val = r.exec(value); val !== null; val = r.exec(value)){
            if(Reflect.has(_valueSkinner,val[1])){
                var _grab = _valueSkinner[val[1]].apply(null,val[2].split(":"));
                value = (typeof(_grab) === "string") ? value.substring(0, val.index ) + _grab + value.substring(val.index + val[0].length) : value = _grab;
            }
        }
        return value;
    }
    return ((function alter(obj){
        return typeof(obj) === "string" ? _E_.call(this,obj) : 
            typeof(obj) === "object" ? 
                Array.isArray(obj) ? obj.map(x=>alter.call(obj,x)): 
                Object.getOwnPropertyNames(obj).reduce((a,c)=>a.to(c,alter.call(obj,obj[c])),{}):obj;
    }).call(this,el)).convert();
}
Element.prototype.convert = function(el){
    this.parentElement.insertBefore(this.translateTo(el),this);
    this.remove();
}

new MutationObserver(function(mutations){
    mutations.forEach(mutation=>{
        if(mutation.type === "childList"){
            mutation.addedNodes.forEach(nood =>{
                document.hooks.forEach(function(item,index){
                    if(typeof(item) === "function"){
                        if(item(nood))document.hooks.splice(index,1);
                    }
                });
                if(nood instanceof Element){
                    [nood].concat(Array.from(nood.querySelectorAll("*"))).forEach(i=>{
                        if(i["_append"] && typeof(i["_append"]) === "function")i["_append"].call(i);
                    });
                    Object.getOwnPropertyNames(document.predefinedTranslations).forEach(function(item){
                        var thing =Array.from(document.querySelectorAll(item)).find(function(t){return t === nood});
                        if(thing)nood.convert(document.predefinedTranslations[item]);
                    });
                }
            });
        }
    });
}).observe(document,{childList:true, subtree:true});

