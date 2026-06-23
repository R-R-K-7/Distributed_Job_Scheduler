const express = require("express");
const {v4:uuidv4} = require("uuid");
const {createClient} = require("redis");
const {uploadMiddleWare} = require("./post_file.js");
const cors = require('cors');
const bcrypt = require('bcrypt');
const {SignJWT, errors} = require('jose');
const {verifyToken, getJobs, getJobData, deleteJob} = require('./server_helpers.js');
const {killContainer} = require('run_code.js');

const app = express();

app.use(cors());
app.use(express.json());

// create redis client
const redisClient = createClient({
		url : 'redis://127.0.0.1:6380'});

redisClient.on('error',(err)=>console.error('Redis Error : ',err));

app.delete('/jobs/:jobId/delete', async (req,res)=>{
	// kill job container if running
	// remove job entry from db and redisQueue

	// verify jwt
	const jobId = req.params.jobId;
	const token = req.headers.authorization?.split(' ')[1];
	const isValid = await verifyToken(token);
	if (!isValid){
		return res.status(401).json({error : 'Invalid access token'});
	}
	try{
		const statusCheck = await getJobData(jobId);
		if (!statusCheck){
			return res.status(404).json({error : 'Job not found'});
		}
		const status = statusCheck.status;
		if (status==='COMPLETED'||status==='TERMINATED'){
			// if already completed, remove from database
			await deleteJob(jobId);
			return res.status(200).json({message : `Deleted job : ${jobId} successfully`});
		}
		if (status==='QUEUED'){
			// if queued, remove from database, then from redisQueue
			const removeCount = await redisClient.lRem('job_queue',0,jobId);
			if (removeCount > 0){
				await redisClient.lRem('temp_queue', 1, jobId);
				return res.status(200).json({message:`Deleted job : ${jobId} successfully`});
			}
			// if removedCount is zero, race-condition -> job was assigned to a client at the time of checking
		}
		// handle race condition -> kill container and remove from redisTempQueue and database
		await killContainer(jobId);
		await deleteJob(jobId);
		await redisClient.lRem('temp_queue',jobId,1);
		return res.status(200).json({message : 'Job deleted successfully'});
	}catch(err){
		return res.status(500).json({error : `Cannot delete job : ${err}`});
	}
});

app.post('/jobs/:jobId/kill', async (req,res)=>{
	// kill the job if running -> do not remove from database but from redisQueue
	const jobId = req.params.jobId;
	const token = req.headers.authorization?.split(' ')[1];
	const isValid = await verifyToken(token);
	if (!isValid){
		return res.status(401).json({error : 'Invalid access token'});
	}
	// kill the job and update status on database
	try{
		const statusCheck = await getJobData(jobId,'status');
		if (!statusCheck){
			return res.status(404).json({error : 'Job not found'});
		}
		const status = statusCheck.status;
		if (status==='COMPLETED'||status==='TERMINATED'||status==='KILLED'||status==='FAILED'){
			return res.status(400).json({error : `Job already ${status}`});
		}
		if (status==='QUEUED'){
			const removeCount = await redisClient.lRem('job_queue',0,jobId);
			if (removeCount > 0){
				await updateJob(jobId, 'status', 'KILLED');
				return res.status(200).json({message:`Killed job : ${jobId} successfully`});
			}
			// if removedCount is zero, race-condition -> job was assigned to a client at the time of checking
		}
		await killContainer(jobId);
		await updateJob(jobId, 'status', 'KILLED');
		await redisClient.lRem('temp_queue', 1, jobId);
		return res.status(200).json({message : `Killed job : ${jobId} successfully`});
	}catch(err){
		return res.status(500).json({error : `Cannot kill job : ${err}`});
	}
});

app.get('/jobs', async (req,res)=>{
	const token = req.headers.authorization?.split(' ')[1];
	if (!token){
		return res.status(401).json({error : 'Invalid access token'});
	}
	try{
		const isValid = await verifyToken(token);
		if (!isValid){
			return res.status(401).json({error : 'Invalid access token'});
		}
		const userId = payload.userId;
		const jobs = await getJobs(userId);
		return res.status(200).json({jobs});
	}catch(err){
		return res.status(500).json({error : 'Cannot retrieve jobs'});
	}
});

app.get('/verify', async (req,res)=>{
	const token = req.headers.authorization?.split(' ')[1];
	const isValid = await verifyToken(token);
	if (isValid){
		return res.status(200).json({message : 'Verified token'});
	}else{
		return res.status(401).json({error : 'Invalid access token'});
	}
});

app.post('/signup',async (req,res)=>{
	const {username,email,password} = req.body;
	if (!email || !password || !username){
		return res.status(400).json({error : 'Email, username and password are required'});
	}
	try{
		const hashedPassword = await bcrypt.hash(password,255);
		const query = `insert into users (username, email, password) values ($1, $2, $3)`;
		await dbPool.query(query,[username,email,hashedPassword]);
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
		const query = `select * from users where email = $1 or username = $2`;
		const result = await dbPool.query(query,[email,username]);
		if (result.rows.length === 0){
			return res.status(401).json({error : 'Invalid credentials'});
		}
		const user = result.rows[0];
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

app.get('/status/:id',async (req,res)=>{
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
