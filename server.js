const express = require('express');
const {v4 : uuidv4} = require('uuid');

const {generateFile} = require("./genFile.js");

// define app
const app = express();

app.use(express.json());

// create map to hold the meta-data of jobs
const jobs = new Map();

// submit a job
app.post('/submit', async (req, res) => {
	const body = req.body;
	const job = {
				"id" : uuidv4(),
				"status" : "QUEUED",
				"code" : body.code,
				"lang" : body.lang,
				"output" : null,
				"created" : new Date(),
			};
	jobs.set(job.id, job);
	try{
		const filePath = await generateFile(job.id, job.code, job.lang);
	
		return res.status(202).json({
				message : "Successfully created Job",
				jobId : job.id
		});
	} catch (err) {
		job.status = "FAILED";
		job.output = err.message;
		jobs.set(job.id, job);

		return res.status(400).json({
			message : "Failed to process job",
			error : err.message,
		});
	}
});

// track job status
app.get('/status/:jobid', (req, res) => {
	const {jobid} = req.params;
	if (!jobs.has(jobid)){
		return res.status(404).send(`Job Id : ${jobid} not found.`);
	}
	const {code, ...stat} = jobs.get(jobid);
	return res.status(200).json(stat);
});

app.listen(3000, () => {
	console.log("Server is running on port 3000...");
});
