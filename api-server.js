const express = require("express");
const {v4:uuidv4} = require("uuid");
const {createClient} = require("redis");
const {uploadMiddleWare} = require("./post_file.js");
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// create redis client
const redisClient = createClient({
		url : 'redis://127.0.0.1:6380'});

redisClient.on('error',(err)=>console.error('Redis Error : ',err));

app.post('/submit',uploadMiddleWare,async (req,res)=>{
	const jobId = uuidv4();
	const lang = req.body.lang;
	const mode = req.body.mode;
	const timeout = req.body.timeout;
	try{
		const job = {
			id : jobId,
			status : 'QUEUED',
			mode : mode, // mode = 0 if single file, 1 if Makefile
			lang : lang,
			zipPath : req.file.path,
			created : new Date().toISOString(),
			timeout : timeout
		};
		await redisClient.hSet(`job:${jobId}`, job);

		// push to redis queue
		await redisClient.lPush('jobs_queue',jobId);

		return res.status(202).json({
			message : 'Succesfully enqueued job',
			jobId : jobId
		});

	}catch (err){
		return res.status(500).json({error : err.message});
	}
});

app.get('/status/:id',async (req,res)=>{
	const jobId = req.params.id;

	// get job from redis cache
	const job = await redisClient.hGetAll(`job:${jobId}`);

	if (Object.keys(job).length === 0){
		return res.status(404).json({error : 'Job not found'});
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
