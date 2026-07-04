const {createClient} = require('redis');
const path = require('path');
	
const {extractFile} = require('./genFile.js');
const {execCode, killContainer} = require('./run_code.js');
const {getJobData, updateJob, deleteJob} = require('./server_helpers.js');
const { resolve } = require('dns');
const {ERROR_SOURCE} = require('./constants.js');

// to track running jobs
const activeJobs = new Set();

const redisClient = createClient({
		url : 'redis://127.0.0.1:6379'
});

redisClient.on('error',(err)=>{console.error('Redis Error : ',err)});
await redisClient.connect();
console.log('Worker node online. Waiting for jobs in the queue...');

const subscriberClient = redisClient.duplicate();
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

async function startworker(){
	while (true){
		let jobId = null;
		try{
			// wait indefinitely for a new job to be enqueued
			jobId = await redisClient.blMove('jobs_queue',`temp_queue`,'LEFT','RIGHT',0);

			// check if job has been cancelled
			const isDeleted = await redisClient.get(`deleting:${jobId}`);
			const isKilled = await redisClient.get(`killing:${jobId}`);
			if (isKilled || isDeleted){
				// job has been cancelled
				if (isDeleted){
					await deleteJob(jobId);
				}else{
					await updateJob(jobId,['status','completed'],['KILLED',new Date().toISOString()]);
				}
				continue;
			}

			console.log(`Got job ${jobId}`);
			
			// fetch jobData
			const jobData = await getJobData(jobId);

			if (Object.keys(jobData).length===0){
				// skip the unavailable job
				console.log(`Job data for jobId : ${jobId} is missing. Skipping...`);
				continue;
			}

			// extractFile
			const dirPath = await extractFile(jobId, jobData.zipPath, jobData.lang);
			// add to active jobs
			activeJobs.add(jobId);
			// execCode
			const {stdout, stderr} = await execCode(dirPath, jobData.lang, jobData.mode,jobData.timeout, jobId);

			// update jobData in database
			await updateJob(jobId, 
							['completed','stderr','stdout','status'],
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
					await deleteJob(jobId);
				}else{
					// update for either killed-job or failed-job
					await updateJob(jobId, 
									['completed','stderr','stdout','status'],
									[new Date().toISOString(), `[${err.source}] : ${err.message}`, '', err.status]);
				}
			}catch(unknown_err){
				console.error(`Unknown Error : ${unknown_err.message}`);
			}
		}finally{
			// cleanup
			activeJobs.delete(jobId);
			await redisClient.lRem('temp_queue', 1, jobId);
			await redisClient.del([`deleting:${jobId}`, `killing:${jobId}`]);
		}
	}
}
startworker();
