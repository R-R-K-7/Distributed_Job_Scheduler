const {createClient} = require('redis');
const path = require('path');
	
const {extractFile} = require('./genFile.js');
const {execCode} = require('./run_code.js');
const {getJobData, updateJob} = require('./server_helpers.js');
const { resolve } = require('dns');

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
			const result = await redisClient.blMove('jobs_queue',`temp_queue`);
			jobId = result.element;

			if (!jobId) continue;

			console.log(`Got job ${jobId}`);
			
			// fetch job
			const jobData = await getJobData(jobId);

			if (Object.keys(jobData).length===0){
				// skip the unavailable job
				console.log(`Job data for jobId : ${jobId} is missing. Skipping...`);
				await redisClient.lRem('temp_queue', 1, jobId);
				continue;
			}

			// extractFile
			const dirPath = await extractFile(jobId, jobData.zipPath, jobData.lang);

			// execCode
			const {stdout, stderr} = await execCode(dirPath, jobData.lang, jobData.mode,timeout = jobData.timeout, jobId);

			// update jobData in database
			await updateJob(jobId, 
							['completed','stderr','stdout','status'],
							[new Date().toISOString(), stdout, stderr || '', 'COMPLETED']
			);
			await redisClient.lRem('temp_queue', 1, jobId);
			console.log(`Job ${jobId} completed successfully`)
		}catch(err){
			// if jobId is null, redisClient connection issue, restart
			if (!jobId){
				await new Promise(resolve => setTimeout(resolve, 2000));
				continue;
			}
			try{
				console.error(`Error JobId[${jobId}] failed : ${err.message}`);
				await updateJob(jobId, 
								['completed','stderr','stdout','status'],
								[new Date().toISOString(), err.message, '', 'FAILED']);
				await redisClient.lRem('temp_queue', 1, jobId);
			}catch(dberr){
				console.error(`Database Error : ${dberr.message}`);
			}
			// update jobData in database
		}
	}
}
startworker();
