const { MongoClient, ObjectId } = require("mongodb");
const { ipcClient } = require("../ipc");
const http = require("http");
const HookAddresses = "HookAddresses";
const HookWatchers = "HookWatchers";

new ipcClient().beginConnection(function(physical,endConnection){
    const { Operation, CollectionName, Parent, Subject, ID, UniqueID } = physical;
    var ctnstring = this.args.find(x=>x.includes("mongostring=")).split("=")[1];
    if(ctnstring !== null){
        var Client = ctnstring.split("=")[0];
        var func = (error,result) => {
            if(error)throw error;
            endConnection(typeof(result) === "object" ? JSON.stringify(result,(k,v)=>
            {
                if(k === "s" || k === "coreTopology" || k === "topology")return null;
                return v;
            }) : typeof(result) === "string" ? result : "");
        };
        MongoClient.connect(Client,{useUnifiedTopology:true}, (error, result) => {
            if (error) throw error;
            var ScraperDB = result.db("ScraperDB");
            var collection = CollectionName != null ? ScraperDB.collection(CollectionName) : null;
            
            if (Operation === "Create") {
                if (Parent !== null && Parent !== undefined)
                if (Array.isArray(Subject))
                    collection.insertMany(Subject.map(sub=>{
                        sub.ParentID = Parent;
                        return sub;
                    },func));
                else {
                    Subject.ParentID = Parent;
                    collection.insertOne(Subject, func);
                }
            } else if(Operation === "Read"){
                if (Parent !== null)
                    collection.find({ ParentID: Parent}).toArray(func);
                else if (ID !== null)
                    collection.findOne({ _id: new ObjectId(ID) },func);
                else
                    collection.find({}).toArray(func);
            }else if(Operation === "Find" && typeof(Subject) === "object")collection.find(Subject).toArray(func);
            else if(Operation === "FindOne" && typeof(Subject) === "object")collection.findOne(Subject,func);
            else if(Operation === "Update"){
                if(Subject !== null && ID !== null){
                    if(Reflect.has(Subject,"_id"))Reflect.deleteProperty(Subject,"_id");
                    collection.updateOne({ _id: new ObjectId(ID) }, { $set: Subject },func);
                }
            }else if(Operation === "Delete"){
                if(ID !== null){
                    collection.deleteOne({ _id: new ObjectId(ID) },func);
                }else if(Parent){
                    if(Subject != null && typeof Subject === "string"){
                        var obj = {};
                        obj[Subject] = Parent;
                        collection.deleteMany(obj,func);
                    } else collection.deleteMany({ ParentID: Parent },func);
                }
            }else if(Operation === "TotalDelete"){
                ScraperDB.collections().then(collections=>{
                    (function _cycle(){
                        if(collections.length>0){
                            var item = collections.shift();
                            new Promise((resolve,reject)=>{
                                item.deleteMany({ParentID: {$in:Subject}},(er,re)=>{
                                    if(er)reject(er);
                                    resolve();
                                });
                            }).finally(()=>_cycle());
                        }else endConnection("Delete Complete");
                    })();
                });
            }else if(Operation === "Aggregation"){
                collection.aggregate(Subject, (e,r)=>{
                    if (e) throw e;
                    r.toArray((me,re)=>endConnection(JSON.stringify(re)));
                });
            }else if(Operation === "Upsert"){
                if(UniqueID != null){
                    if(Array.isArray(Subject)){
                        (function takeOne(){
                            var subject = Subject.shift();
                            var queryObject = {};
                            queryObject[UniqueID] = subject[UniqueID];
                            
                            collection.findOneAndUpdate(queryObject,{$set:subject},{upsert:true},(e,r)=>{
                                if(e) throw e;
                                if(Subject.length>0) takeOne();
                                else endConnection(JSON.stringify({"Message": "Finished Upserting"}));
                            });
                        })();
                    }
                }
            }else if(Operation === "SetWebHook") // Set a place to broadcast to
                ScraperDB.collection(HookAddresses).insertOne(Subject,func);
            else if(Operation === "AddWatcher") // Add a watcher to the Collection then start watching 
                ScraperDB.collection(HookWatchers).insertOne(Subject,(e,r)=>{
                    if(e)throw e;
                    _startWatcher(Subject.CollectionName,Subject.Pipeline);
                });
            else
                throw "No Operation Found";
        });
    }
});