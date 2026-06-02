const express = require('express');
const multer = require('multer');
const {v4 : uuidv4} = require('uuid');

const {extractFile} = require("./genFile.js");
const {execCode} = require("./run_code.js");
// uses Multer to get a file
const {uploadMiddleWare} = require('./post_file.js');

// define app
const app = express();

app.use(express.json());

// create map to hold the meta-data of jobs
const jobs = new Map();

// Queue holding jobs
const queue = [];
const maxActiveJobs = 2;
let numActiveJobs = 0;

// submit a job
app.post('/submit', uploadMiddleWare, async (req, res) => {
	const body = req.body;
	const job = {
				"id" : uuidv4(),
				"status" : "QUEUED",
				"file" : req.file,
				"lang" : body.lang,
				"output" : null,
				"error" : null,
				"created" : new Date(),
				"path" : null,
				// mode : whether file submitted has a makefile or 
				// just a single file to execute
				// 1 -> just execute makefile
				// 0 -> a single file to be (compiled) executed
				"mode" : body.mode,
			};
	jobs.set(job.id, job);
	queue.push(job.id);

	// schedule the job
	schedule();
	
	return res.status(202).json({
			message : "Successfully created Job",
			jobId : job.id
	});
});

// track job status
app.get('/status/:jobid', (req, res) => {
	const {jobid} = req.params;
	if (!jobs.has(jobid)){
		return res.status(404).send(`Job Id : ${jobid} not found.`);
	}
	const {file, ...stat} = jobs.get(jobid);
	return res.status(200).json(stat);
});

// scheduler for jobs
async function schedule(){
	if (numActiveJobs >= maxActiveJobs || queue.length === 0)
		return;
	numActiveJobs++;
	// dequeue pending job
	const jobId = queue.shift();
	const job = jobs.get(jobId);
	
	// update status
	job.status = "RUNNING";
	jobs.set(jobId, job);

	try{
		const filePath = await extractFile(job.id, job.file, job.lang);
		job.path = filePath;

		const {stdout, stderr} = await execCode(filePath, job.lang, job.mode);

		// update job attributes
		job.status = "COMPLETED";
		job.output = stdout;
		job.error = stderr;
		job.path = null;
	}catch(err){
		// update job attributes
		job.status = "TERMINATED";
		job.error = err.message;
		job.path = null;
	}finally{
		jobs.set(jobId, job);
		numActiveJobs--;

		console.log(job.output, job.error);

		// Call scheduler to run the next job
		schedule();
	}
}

app.listen(3000, () => {
	console.log("Server is running on port 3000...");
});
