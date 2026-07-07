const os = require('os');
const path = require('path');
const util = require('util');
const fs = require('fs/promises');

const {exec, spawn, fork} = require('child_process');
const { error } = require('console');
const { json } = require('stream/consumers');
const { ERROR_SOURCE } = require('./constants');

const execPromise = util.promisify(exec);

const fileMap = {"python" : "main.py",
				 "c" : "main.c",
				 "c++" : "main.cpp"
				};

async function bfsSearch(rootPath, matchFn) {
    const queue = [rootPath];

    while (queue.length > 0) {
        const currentDir = queue.shift();
        
        try {
            const items = await fs.readdir(currentDir, { withFileTypes: true });

            for (const item of items) {
                if (item.isFile() && matchFn(item.name)) {
                    // Return path relative to the root search path
                    return path.relative(rootPath, path.join(currentDir, item.name));
                }
            }

            for (const item of items) {
                if (item.isDirectory()) {
                    queue.push(path.join(currentDir, item.name));
                }
            }
        } catch (err) {
            // Permission denied or other error; skip this directory
            continue;
        }
    }
    return null;
}

async function findMakeFileDir(dirPath) {
    const result = await bfsSearch(dirPath, (name) => ['Makefile', 'makefile'].includes(name));
    if (!result) throw new Error('No Makefile found');
    return path.dirname(result);
}

async function findMain(dirPath, lang) {
    if (!fileMap[lang]) {
        throw new Error(`Execution for language ${lang} is not configured.`);
    }
    const result = await bfsSearch(dirPath, (name) => name === fileMap[lang]);
    if (!result) throw new Error(`${fileMap[lang]} for ${lang} not found.`);
    return result;
}

// spawns a process and returns the process object
async function execCode(dirname, lang, mode, timeout, jobId){
	const docker_cmd = `docker run --rm --name '${jobId}' `+
					   `-v ${dirname}:/usr/src/app -w /usr/src/app `+
					   `--memory="128m" --memory-swap="128m" --cpus="1.0" `+
					   `--ulimit fsize=${25 * 1024 * 1024} --ulimit core=0 --pids-limit 20 `;
	let image = "";
	let runCmd = "";
	try{
		const filename = await findMain(dirname, lang);
		if (Number(mode) === 0){
				// without makefile
				if (lang === "python"){
					image = "python:3.10-slim";
					runCmd = `timeout ${timeout}s bash -c "python3 ${filename}"`;
				}
				else if (lang === "c" || lang === "c++"){
					const compiler = lang === "c" ? "gcc" : "g++";
					image = "gcc:latest";
					runCmd = `timeout ${timeout}s bash -c "${compiler} -Wall ${filename} -o a.out && ./a.out"`;
				}else{
					throw new Error(`Execution for language ${lang} is not configured.`);
				}
		}else if (Number(mode) === 1){
				// with makefile
				const makefilePath = await findMakeFileDir(dirname);
				if (lang === "python"){
					image = "python:3.10-slim";
					runCmd = `timeout ${timeout}s bash -c "python3 ${filename}"`;
				}
				else if (lang === "c" || lang === "c++"){
					image = "gcc:latest";
					runCmd = `timeout ${timeout}s bash -c "cd ${makefilePath} && make && ./a.out"`;
				}else{
					throw new Error(`Execution for language ${lang} is not configured.`);
				}
		}else{
			throw new Error(`Invalid execution mode ${mode}.`);
		}
		const finalCmd = `${docker_cmd} ${image} ${runCmd}`;
		const {stdout,stderr} = await execPromise(finalCmd);
		return {stdout, stderr};
	}catch(err){
		console.error(err.message);
		err.source = ERROR_SOURCE.EXECUTION;
		// Time limit exceeded
		if (err.code === 124) {
			err.status = 'TERMINATED';
			err.message = `Time Limit Exceeded: Process took longer than the allocated ${timeout} s`;
        }else if (err.code === 137){
			// out of memory or killed
			err.status = 'KILLED';
			err.message = 'Process terminated : Out of memory or Killed';
		}else if (err.code >= 125 && err.code <= 127){
			// daemon errors
			err.status = 'TERMINATED';
			err.message = `Internal Server Error. Please try again later`;
		}else{
			err.status = 'FAILED';
			err.message = (err.stderr && err.stderr.trim().length > 0) ? err.stderr.trim() : 
						   `Process crashed with exit code : ${err.code || 'unknown'}`;
		}
		throw err;
	}finally{
		// remove directory
		await fs.rm(dirname, {recursive : true, force : true});
	}
}

async function killContainer(jobId){
	try{
		await execPromise(`docker kill ${jobId}`); 
		console.log(`Successfully killed container: ${jobId}`);
	}catch(err){
		console.log(`Container ${jobId} not found or already dead.`);
	}
}
module.exports = {execCode, killContainer};
