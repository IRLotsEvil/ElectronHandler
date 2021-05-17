const { MongoClient, ObjectId, ObjectID} = require("mongodb");

/**
 * Class to control mongo operations while providing a system for sending change updates
 */
class MongoController {
    /**
     * Creates MongoController
     * @param {string} database Name of Database
     * @param {string} connectionString Connection string to mongodb
     */
    constructor(database,connectionString) {
        this.database = database;
        this.connectionString = connectionString;
        this.activeDB = null; 
    }
    async setUpDB(){
        if(this.activeDB === null)this.activeDB = (await MongoClient.connect(this.connectionString, { useUnifiedTopology: true })).db(this.database);
        return this.activeDB;
    }

    /**
     *
     * @param {string} collection
     * @param {string} id
     */
    async deleteDocument(collectionName, id){
		var collection = (await this.setUpDB()).collection(collectionName);
        this.addUpdate(collectionName, await collection.findOneAndDelete({ _id: new ObjectId(id) }),"Delete");
    };

    /**
     *
     * @param {string} collection
     * @param {{}} filter
     */
    async deleteDocuments (collectionName, filter){
		var collection = (await this.setUpDB()).collection(collectionName);
        var recovered = await collection.find(filter).toArray();
        await collection.deleteMany(filter);
        recovered.forEach(recovered=>this.addUpdate(collectionName,recovered,"Delete"));
    };

    /**
     * Delete documents across all collections based on a filter
     * @param {{}} filter 
     */
    async totalDelete (filter) {
        var db = await this.setUpDB();
        await Promise.all((await db.collections()).map(collection=>this.deleteDocuments(collection.collectionName,filter)));
    };
    /**
     * Function used for either updating an old document or inserting a new one.
     * If no filter is supplied but there is an _id on the document it will use the _id to search.
     * If neither are present it will assume it is an insert operation.
     * @param {string} collection Collection to apply changes to
     * @param {{}[]} documents Document/s to be inserted or updated
     * @param {{}} filter Filter used to find the document to be updated
     */
     async upsertDocument (collectionName, documents, filter){
        var that = this;
        var db = await this.setUpDB();
        documents = Array.isArray(documents)? documents : [documents];
		var collection = db.collection(collectionName);
        var isFilter = filter && Object.getOwnPropertyNames(filter).length>0;
        async function upsertItem(document){
            var newFilter = isFilter ? filter :  Reflect.has(document,"_id") && document["_id"] !== null ? {"_id": new ObjectID(document["_id"])} : null ;
            if(Reflect.has(document,"_id"))Reflect.deleteProperty(document,"_id");
            if(newFilter !== null){
                var updatedItem = await collection.findOneAndUpdate( newFilter, { $set: document }, {returnOriginal: false });
                if(updatedItem.ok === 1 && updatedItem.value !== null)
                {
                    await that.addUpdate(collectionName,String(updatedItem.value["_id"]),"Update");
                    return;
                }
            }
            var insertItem = await collection.insertOne(document);
            await that.addUpdate(collectionName,String(insertItem.insertedId),"Insert");
            return String(insertItem.insertedId);
        }
        var results = await Promise.all(documents.map(document=>{return upsertItem(document);}));
        if(results.length === 1)return results[0];else results;
    };

    /**
     * 
     * @param {string} collection Collection to apply the changes to
     * @param {{}[]} documents Collection of documents to to be created or updated
     * @param {{}} filter Filter to find the documents to be updated
     */
    async upsertMany(collectionName, documents, filter){
        if(Array.isArray(documents)){
            await Promise.all(documents.map(document=>this.upsertDocument(collectionName,document,filter)));
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
     * Function that applies aggregations to the collection and returns the documents
     * @param {string} collectionName Collection to apply aggrgation to
     * @param {{}[]} pipeline PipeLine to aggregations
     */
    async aggregateDocuments(collectionName,pipeline){
        var db = await this.setUpDB();
        return await db.collection(collectionName).aggregate(pipeline).toArray();
    }

    /**
     * Add a new update to the Database then update any pending Updates
     * @param {string} collectionName Collection name that was affected
     * @param {string[]|{}} IDorDocument Id of the affected document or the document itself
     * @param {string} type Action that caused the change
     */
    async addUpdate(collectionName, IDorDocument, type){
        var db = await this.setUpDB();
        var counter = await db.collection("counters").findOneAndUpdate({collection:"Updates"},{"$inc":{ count : 1}},{upsert:true,returnOriginal:false});
        if(Reflect.has(counter.value,"count")){
            var document = {collection : collectionName, type : type, countNum:counter.value["count"]};
            if(typeof(IDorDocument) === "string")document["doc_id"] = IDorDocument;
            else document["doc_recovered"] = IDorDocument;
            await db.collection("Updates").insertOne(document);
        }
    }

    /**
     * Function for retrieving updates, if an id is found to be larger than the amount of updates available and long polling is enabled it will wait until new updates are given
     * @param {number} id the id to get updates
     * @param {string[]} collectionNames Array of collectionNames to get updates for
     * @param {Object} options Options for retrieving updates
     * @param {boolean} options.allowLongPolling Determines whether long polling is allowed (default : true)
     * @param {boolean} options.waitUntilAtleastOne Should we wait until atleast one update is found or until the id count id fufilled?(default : false)
     * @param {number} options.timeout Length of time in milliseconds for the request to timeout (default : 30000)
     * @param {number} options.updateBlock Maximum number of updates to return at once, -1 means all updates from where the id starts (default : 5)
     * @param {boolean} options.rejectOnTimeout If true, reject on timeout or return results if false (default : false)
     */
    async getUpdates(id, collectionNames, options ={}){
        var pipe = [
            {'$match': {'collection': 'Updates'}}, 
            {'$limit': 1}, 
            {
              '$lookup': {
                    'from': 'Updates', 
                    'pipeline': [{'$sort': {'countNum': -1}}].
                        concat(options.updateBlock === -1 ? []: [{'$limit': options.updateBlock || 5}]).
                        concat([{'$match': {'$expr': {'$gte': ['$countNum', id]}}}]).
                        concat(Array.isArray(collectionNames) ?[{"$match":{"$expr":{"$in":["$collection",collectionNames]}}}]:[]).
                        concat([{'$sort': {'countNum': 1}}]), 
                    'as': 'updates'
                }
            }, 
            {'$project': {'_id': 0,'collection': 0}}
        ];
        return await new Promise((res,rej)=>{
            this.setUpDB().then(db=>{
                var counters = db.collection("counters");
                var timeoutTimer = null;
                function getResults(){counters.aggregate(pipe).toArray().then(results=>{res(results.shift());});}
                (function check(){
                    counters.findOne({collection:"Updates"}).then(counter=>{
                        if(Reflect.has(counter,"count")){
                            if(id <= counter["count"])getResults();
                            else if(options.allowLongPolling === undefined || options.allowLongPolling){
                                if(timeoutTimer === null)timeoutTimer = setTimeout(() => {
                                    if(options.rejectOnTimeout)rej("Long polling timed out");else getResults();
                                }, options.timeout || 30000);
                                setTimeout(check, 200);
                            }else getResults();
                        }
                    });
                })();
            })
            
        });
    }
}

module.exports = {MongoController};
