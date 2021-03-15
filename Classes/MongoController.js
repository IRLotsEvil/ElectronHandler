const { MongoClient, ObjectId, ObjectID} = require("mongodb");
const http = require("http");
const { PipeController } = require("./PipeController");

/**
 * Class to control mongo operations while providing a system for sending change updates
 */
class MongoController {
    /**
     * Creates MongoController
     * @param {string} database Name of Database
     * @param {string} connectionString Connection string to mongodb
     * @param {PipeController} controller PipeController to send messages down
     */
    constructor(database,connectionString, controller) {
        this.database = database;
        this.connectionString = connectionString;
        this.activeDB = null; 
        this.controller = controller;
    }

    async getCollection(collectionName){
        var stringit = this.connectionString;
        var client = await MongoClient.connect(stringit, { useUnifiedTopology: true });
        return client.db(this.database).collection(collectionName);
    }
    async getCollections(){
        return (await(await MongoClient.connect(this.connectionString, { useUnifiedTopology: true })).db(this.database).collections());
    }

    async setUpDB(){
        this.activeDB = (await MongoClient.connect(this.connectionString, { useUnifiedTopology: true })).db(this.database);
    }

    /**
     *
     * @param {string} collection
     * @param {string} id
     */
    async deleteDocument(collectionName, id){
		var collection = await this.getCollection(collectionName);
        this.sendUpdate(await collection.findOneAndDelete({ _id: new ObjectId(id) }), collection.collectionName);
    };

    /**
     *
     * @param {string} collection
     * @param {{}} filter
     */
    async deleteDocuments (collectionName, filter){
		var collection = await this.getCollection(collectionName);
        var recovered = await collection.find(filter).toArray();
        await collection.deleteMany(filter);
        this.sendUpdate(recovered, collection.collectionName);
        return recovered;
    };

    /**
     * Delete documents across all collections based on a filter
     * @param {{}} filter 
     */
    async totalDelete (filter) {
        var dictionary = {};
        await Promise.all((await this.getCollections()).map(collection => new Promise(async (res, rej) => {
            var recovered = await collection.find(filter).toArray();
            await collection.deleteMany(filter);
            dictionary[collection.collectionName] = recovered;
            res();
        })));
        var watchers = (await this.database.collection("Watchers").find().toArray());
        Object.getOwnPropertyNames(dictionary).forEach(x => {
            if (watchers.find(y => y.collectionName === x))
                this.sendUpdate(dictionary[x], x);
        });
    };
    /**
     * Function used for either updating an old document or inserting a new one.
     * If no filter is supplied but there is an _id on the document it will use the _id to search.
     * If neither are present it will assume it is an insert operation.
     * @param {string} collection Collection to apply changes to
     * @param {{}|{}[]} document Document/s to be inserted or updated
     * @param {{}} filter Filter used to find the document to be updated
     */
     async upsertDocument (collectionName, documents, filter){
        if(this.activeDB === null)await this.setUpDB();
        documents = Array.isArray(documents)? documents : [documents];
		var collection = this.activeDB.collection(collectionName);
        var isFilter = filter && Object.getOwnPropertyNames(filter).length>0;
        var vals = await Promise.all(documents.map(document=>new Promise((r,j)=>{
            var newFilter = isFilter ? filter :  Reflect.has(document,"_id") ? {"_id": new ObjectID(document["_id"])} : null ;
            if(Reflect.has(document,"_id"))Reflect.deleteProperty(document,"_id");
            if(newFilter !== null) collection.findOneAndUpdate( newFilter, { $set: document }, { upsert: true, returnOriginal: false }).then(x=>r(x.value));
            else collection.insertOne(document).then(x=>r(x.ops[0]));
        })));
        vals = vals.length === 1 ? vals[0] : vals;
        this.sendUpdate(vals,collectionName);
        return vals;
    };

    /**
     * 
     * @param {string} collection Collection to apply the changes to
     * @param {{}[]} documents Collection of documents to to be created or updated
     * @param {{}} filter Filter to find the documents to be updated
     */
    async upsertMany(collectionName, documents, filter){
        if(Array.isArray(documents)){
            var docs = await Promise.all(documents.map(document=>this.upsertDocument(collectionName,document,filter,false)));
            this.sendUpdate(docs,collection);
        }
    }

    /**
     * Reads documents from collection
     * @param {string} collection 
     * @param {{}} filter
     * @returns {Promise<{}>} 
     */
    async readDocuments(collectionName,filter){
		if(this.activeDB === null)await this.setUpDB();
		var collection = this.activeDB.collection(collectionName);
        return await collection.find(filter).toArray();
    }

    /**
     * 
     * @param {string} collection 
     * @param {{}} filter 
     * @returns {Promise<{}>}
     */
    async readDocument(collectionName,filter){
		if(this.activeDB === null)await this.setUpDB();
		var collection = this.activeDB.collection(collectionName);
        return await collection.findOne(filter);
    }

    /**
     * Creates / Updates a Webhook
     * @param {string} IP 
     * @param {string} Port 
     */
    async setHook(IP,Port){
        await this.upsertDocument("Webhooks",{IP:IP,Port:Port}, {IP:IP,Port:Port});
    }

    /**
     * Creates / Updates a Watcher
     * @param {string} collectionName 
     */
    async setWatcher(collectionName){
        await this.upsertDocument("Watchers",{collectionName:collectionName}, {collectionName:collectionName});
    }

    /**
     * Deletes a Watcher
     * @param {string} _id 
     */
    async deleteWatcher(_id){
        await this.deleteDocument("Watchers",_id);
    }

    /**
     * Sends an update to the bound Webhooks
     * @param {{}|Object[]} documents Document or documents to send
     * @param {string} collectionName Name of the origin collection
     */
    async sendUpdate(documents, collectionName) {
        var eventStruct = JSON.stringify((Array.isArray(documents) ? documents : [documents]).map(document => { return { collectionName: collectionName, document: document }; }));
        var count = await this.activeDB.collection("Watchers").countDocuments({collectionName:collectionName})
        if(count>0){
            debugger;
            this.controller.transmitToPipes(eventStruct);
        }
    };
}

module.exports = {MongoController};