const {createClient} = require('redis');
const path = require('path');
	
const {extractFile} = require('./genFile.js');
const {execCode} = require('./run_code.js');

const redisClient = createClient({
		url : 'redis://127.0.0.1:6380'
});

redisClient.on('error',(err)=>{console.error('Redis Error : ',err)});

async function startworker(){
	await redisClient.connect();
	console.log('Worker node online. Waiting for jobs in the queue...');
	
	while (true){
		let jobId = null;
		try{
			// wait indefinitely for a new job to be enqueued
			const result = await redisClient.rPopLPush('jobs_queue',`temp_queue`);

			// for understanding purposes
			console.log(result);

			jobId = result.element;
			console.log(`Got job ${jobId}`);
			
			// fetch job
			const jobData = await redisClient.hGetAll(`job:${jobId}`);

			if (Object.keys(jobData).length===0){
				console.log(`Job data for jobId : ${jobId} is missing. Skipping...`);
				continue;
			}

			// extractFile
			const dirPath = await extractFile(jobId, jobData.zipPath, jobData.lang);

			// execCode
			const {stdout, stderr} = await execCode(dirPath, jobData.lang, jobData.mode,timeout = jobData.timeout);

			// update jobData in redis
			jobData.completed = new Date().toISOString();
			jobData.output = stdout;
			jobData.error = stderr || '';
			jobData.status = 'COMPLETED';
			await redisClient.hSet(`job:${jobId}`, jobData);

			redisClient.lRem('temp_queue', jobId, 1);
		}catch(err){
			console.error(`Error JobId[${jobId}] failed : ${err.message}`);
			// update jobData in redis
			if (jobId){
				await redisClient.hSet(`job:${jobId}`, {
					completed : new Date().toISOString(),
					error : err.message,
					output : '',
					status : "TERMINATED",
				});
			}
		}
	}
}
startworker();
