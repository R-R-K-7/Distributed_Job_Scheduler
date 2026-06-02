const os = require('os');
const path = require('path');
const util = require('util');
const fs = require('fs/promises');

const {exec, spawn, fork} = require('child_process');

const execPromise = util.promisify(exec);

// helper to construct stdOut and stdErr file paths
function stdPath(filePath){
	const dirname = path.dirname(filePath);
	const stdOut = path.join(dirname, 'output.txt');
	const stdErr = path.join(dirname, 'errors.log');
	return {stdOut : stdOut, stdErr : stdErr};
}

// spawns a process and returns the process object
async function execCode(filePath, lang, mode){
	const dirname = path.dirname(filePath);
	const filename = path.basename(filePath);
	const docker_cmd = `docker run --rm `+
					   `-v ${dirname}:/usr/src/app -w /usr/src/app `+
					   `--memory="128m" --cpus="1.0" `+
					   `--ulimit fsize=${25 * 1024 * 1024} --ulimit core=0 --pids-limit 20 `;
	let image = "";
	let runCmd = "";
	try{
		if (Number(mode) === 0){
				if (lang === "python"){
					image = "python:3.10-slim";
					runCmd = `python3 ${filename}`;
				}
				else if (lang === "C" || lang === "C++"){
					const compiler = lang === "C" ? "gcc" : "g++";
					image = "gcc:latest";
					runCmd = `bash -c "${compiler} -Wall ${filename} -o a.out && ./a.out"`;
				}else{
					throw new Error(`Execution for language ${lang} is not configured.`);
				}
		}else if (Number(mode) === 1){
				if (lang === "python"){
					image = "python:3.10-slim";
					runCmd = `bash -c "python3 main.py"`;
				}
				else if (lang === "C" || lang === "C++"){
					image = "gcc:latest";
					runCmd = `bash -c "make && ./a.out"`;
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
		throw new Error(`${err.message}\n${err.stderr || ''}`.trim());
	}finally{
		// remove directory
		await fs.rm(dirname, {recursive : true});
	}
}

module.exports = {execCode};
