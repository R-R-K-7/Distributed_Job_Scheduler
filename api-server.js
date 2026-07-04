const express = require("express");
const {v4:uuidv4} = require("uuid");
const {createClient, RedisSentinel} = require("redis");
const {uploadMiddleWare} = require("./post_file.js");
const cors = require('cors');
const bcrypt = require('bcrypt');
const {SignJWT} = require('jose');
const {verifyToken, getJobs, getJobData, deleteJob, insertJob, updateJob, insertUser,getUserData} = require('./server_helpers.js');

const app = express();

app.use(cors());
app.use(express.json());

// create redis client
const redisClient = createClient({
		url : 'redis://127.0.0.1:6379'});

redisClient.on('error',(err)=>console.error('Redis Error : ',err));

async function verifyHeader(req,res,next){
	// verify jwt
	const jobId = req.params.jobId;
	const token = req.headers.authorization?.split(' ')[1];
	const payload = await verifyToken(token);
	if (!payload){
		return res.status(401).json({error : 'Invalid access token'});
	}
	req.user = payload;
	next();
}

async function cancelJob(req,res,isDelete=false){
	const jobId = req.params.jobId;
	try{
		const statusCheck = await getJobData(jobId,'status');
		if (!statusCheck){
			return res.status(404).json({error : 'Job not found'});
		}
		const status = statusCheck.status;
		if (['COMPLETED','TERMINATED','KILLED','FAILED'].includes(status)){
			if (!isDelete){
				return res.status(400).json({error : `Job already ${status}`});
			}else{
				// if already completed, remove from database
				const ret = await deleteJob(jobId);
				if (!ret){
					// internal server error, cannot delete
					return res.status(500).json({message : `Failed to delete job : ${jobId}`});
				}
				return res.status(200).json({message : `Deleted job : ${jobId} successfully`});
			}
		}
		// If function reaches here, it is queued, or running
		// cancel the job in redis queue
		const cancelType = (isDelete) ? `deleting:${jobId}` : `killing:${jobId}`;
		await redisClient.set(cancelType,'true',{EX:3600});
		const removed = await redisClient.lRem('job_queue',0,jobId);
		if (removed>0){
			if (isDelete){
				// successfully deleted job
				return res.status(200).json({message : `Deleted job : ${jobId} successfully`});
			}else{
				// successfully killed job
				return res.status(200).json({message : `Killed job : ${jobId} successfully`});
			}
		}
		// Job is RUNNING
		// Update status to CANCELLING for UI to update
		await updateJob(jobId,['status'],['CANCELLING']);
		// broadcast kill signal to kill the job in corresponding worker node
		await redisClient.publish('kill_channel',jobId);
		return res.status(200).json({message : `Kill signal dispatched to all worker nodes successfully`});
	}catch(err){
		if (isDelete){
			return res.status(500).json({error : `Cannot delete job : ${err}`});
		}else{
			return res.status(500).json({error : `Cannot kill job : ${err}`});
		}
	}
}

app.delete('/jobs/:jobId/delete', verifyHeader, async (req,res)=>{
	await cancelJob(req,res,true);
});

app.post('/jobs/:jobId/kill', verifyHeader, async (req,res)=>{
	await cancelJob(req,res,false);
});

app.get('/jobs', verifyHeader, async (req,res)=>{
	try{
		const userId = req.user.userId;
		const jobs = await getJobs(userId);
		return res.status(200).json({jobs});
	}catch(err){
		return res.status(500).json({error : 'Cannot retrieve jobs'});
	}
});

app.post('/signup',async (req,res)=>{
	const {username,email,password} = req.body;
	if (!email || !password || !username){
		return res.status(400).json({error : 'Email, username and password are required'});
	}
	try{
		const hashedPassword = await bcrypt.hash(password,10);
		const user = {username:username,password:hashedPassword,email:email};
		if (await insertUser(user)==0){
			return res.status(500).json({error:'Failed to add new user'});
		}
		res.status(201).json({message : 'User created successfully'});
	}catch(err){
		if (err.code === '23505'){
			return res.status(409).json({error : 'Email already exists'});
		}
		console.error('Error creating user : ',err);
		return res.status(500).json({error : 'Internal server error'});
	}
});

app.post('/login',async (req,res)=>{
	const {username,email,password} = req.body;
	if (!password || !(email || username)){
		return res.status(400).json({error : 'Email / username and password are required'});
	}
	try{
		const user = await getUserData(username,email);
		if (!user){
			return res.status(401).json({error : 'Invalid credentials'});
		}
		const isMatch = await bcrypt.compare(password,user.password);
		if (!isMatch){
			return res.status(401).json({error : 'Wrong password'});
		}
		// Login successful, generate JWT token
		const token = await new SignJWT({userId : user.id})
		.setProtectedHeader({alg : 'HS256'})
		.setExpirationTime('2h')
		.sign(new TextEncoder().encode(process.env.JWT_SECRET));
		return res.status(200).json({message : 'Login successful', token : token});
	}catch(err){
		console.error('Error during login : ',err);
		return res.status(500).json({error : 'Internal server error'});
	}
});

app.post('/submit',uploadMiddleWare,async (req,res)=>{
	const jobId = uuidv4();
	const lang = req.body.lang;
	const mode = req.body.mode;
	const timeout = req.body.timeout;
	try{
		if (!req.file){
			return res.status(400).json({error:'No file submitted'})
		}
		const job = {
			id : jobId,
			status : 'QUEUED',
			mode : mode, // mode = 0 if single file, 1 if Makefile
			lang : lang,
			zipPath : req.file.path,
			created : new Date().toISOString(),
			timeout : timeout
		};
		const response = await insertJob(job);
		if (!response.ok){
			return res.status(500).json({error : 'Cannot insert job'});
		}

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

app.get('/status/:id', verifyHeader, async (req,res)=>{
	const jobId = req.params.id;
	try{
		const response = await getJobData(jobId,'*');
		if (!response){
			return res.status(404).json({error : 'Job not found'});
		}
		return res.status(200).json(response);
	}catch(err){
		return res.status(500).json({error : 'Cannot retrieve status'});
	}
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
