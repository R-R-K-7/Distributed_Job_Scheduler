const express = require("express");
const {v4:uuidv4} = require("uuid");
const createClient = require("redis");
const {uploadMiddleWare} = require("./post_file.js");

const app = express();

app.use(express.json());

// create redis client
const redisClient = createClient({
		url : 'redis://127.0.0.1:6379'});

redisClient.on('error',(err)=>console.error('Redis Error : ',err));

app.post('/submit',uploadMiddleWare,async (req,res)=>{
	const jobId = uuidv4();
	const lang = req.body.lang;
	
	try{
		await redisClient.hSet(`job:${jobId}`,{
			id : jobId,
			status : 'QUEUED',
			lang : lang,
			path : req.file.path,
			created : new Date().toISOString(),
		});

		// push to redis queue
		await redisClient.lPush('jobs_queue',jobId);

		return res.status(202).json({
			message : 'Succesfully enqueued job',
			jobId : jobId
		});
	}catch (err){
		return res.status(500).json({error : 'Failed to queue job'});
	}
});

app.get('/status/:id',async (req,res)=>{
	const jobId = req.params.id;

	// get job from redis cache
	const job = await redisClient.get(`job:${jobId}`);

	if (Object.keys(job).length === 0){
		return res.json(404).json({error : 'Job not found'});
	}
	// Not returning the file as response as it is slow
	const {file, ...stat} = job;
	return res.status(200).json(stat);
});

// Boot up the server and connect to Redis
async function startServer() {
    await redisClient.connect();
    console.log("Connected to Redis shared state");

    app.listen(3000, () => {
        console.log("Master API Gateway listening on port 3000");
    });
}

startServer();
