const {createClient} = require('redis');
const path = require('path');
	
const {extractFile} = require('./genFile.js');
const {execCode, killContainer} = require('./run_code.js');
const {getJobDataWorker_S, updateJobWorker_S, deleteJobWorker_S} = require('./server_helpers.js');
const { resolve } = require('dns');
const {ERROR_SOURCE} = require('./constants.js');

// to track running jobs
const activeJobs = new Set();

const redisClient = createClient({
		url : 'redis://127.0.0.1:6379'
});

redisClient.on('error',(err)=>{console.error('Redis Error : ',err)});
const subscriberClient = redisClient.duplicate();

async function startworker(){
	while (true){
		let jobId = null;
		try{
			// wait indefinitely for a new job to be enqueued
			jobId = await redisClient.brPopLPush('jobs_queue',`temp_queue`, 0);
			console.log("DEBUG jobId:", jobId, "Type:", typeof jobId);
			
			// check if job has been cancelled
			const isDeleted = await redisClient.get(`deleting:${jobId}`);
			const isKilled = await redisClient.get(`killing:${jobId}`);
			if (isKilled || isDeleted){
				// job has been cancelled
				if (isDeleted){
					await deleteJobWorker_S(jobId);
				}else{
					await updateJobWorker_S(jobId,['status','completed'],['KILLED',new Date().toISOString()]);
				}
				continue;
			}
			
			console.log(`Got job ${jobId}`);
			
			// fetch jobData
			const jobData = await getJobDataWorker_S(jobId,['status','zippath','lang','mode','timeout']);
			
			if (!jobData){
				// skip the unavailable job
				console.log(`Job data for jobId : ${jobId} is missing. Skipping...`);
				continue;
			}
			
			// extractFile
			console.log(jobData);
			const dirPath = await extractFile(jobId, jobData.zippath, jobData.lang);
			// add to active jobs
			activeJobs.add(jobId);

			// update jobData in database
			await updateJobWorker_S(jobId, 
				['status'],
				['RUNNING']
			);

			// execCode
			const timeout_s = Math.ceil(jobData.timeout / 1000);
			const {stdout, stderr} = await execCode(dirPath, jobData.lang, jobData.mode,timeout_s, jobId);
			
			// update jobData in database
			await updateJobWorker_S(jobId, 
				['completed','stdout','stderr','status'],
				[new Date().toISOString(), stdout, stderr || '', 'COMPLETED']
			);
			console.log(`Job ${jobId} completed successfully`)
		}catch(err){
			// if jobId is null, redisClient connection issue, restart
			if (!jobId){
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
			}
			try{
				// either 'extractFile' or 'execCode' or 'database' errors
				console.error(`Error JobId[${jobId}] failed during [${err.source}]: ${err.message}`);
				// check if job was intentionally deleted / killed
				const isDeleted = await redisClient.get(`deleting:${jobId}`);
				const isKilled = await redisClient.get(`killing:${jobId}`);
				// update database upon job Exit
				if (isDeleted){
					// job has been cancelled
					await deleteJobWorker_S(jobId);
				}else{
					// update for either killed-job or failed-job
					await updateJobWorker_S(jobId, 
						['completed','stderr','stdout','status'],
						[new Date().toISOString(), `[${err.source}] : ${err.message}`, '', err.status]);
					}
				}catch(unknown_err){
					console.error(`Unknown Error : ${unknown_err.message}`);
				}
		}finally{
			// cleanup
			if (jobId){
				activeJobs.delete(jobId);
				await redisClient.lRem('temp_queue', 1, jobId);
				await redisClient.del([`deleting:${jobId}`, `killing:${jobId}`]);
			}
		}
	}
}

async function bootWorker(){
	try{
		await redisClient.connect();
		await subscriberClient.connect();
		// upon a kill signal, deletes the corresponding job's container, in redis queue, updates database
		await subscriberClient.subscribe('kill_channel', async (jobId)=>{
			// if this worker is running the job, kil the container
			if (activeJobs.has(jobId)){
				// container's name is jobId
				await killContainer(jobId);
				// clean up will be done by redis-client
			}
		});
		console.log('Worker node online. Waiting for jobs in the queue...');
	}catch(err){
		console.error(`Failed to boot worker`);
		process.exit(1);
	}
	try{
		await startworker();
	}catch(err){
		console.error(`Worker failed`);
		console.error(err);
		process.exit(1);
	}
}

bootWorker()
.catch(err=>{
	console.error(`Unknown error : ${err}`);
	process.exit(1);
});