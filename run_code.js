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
	try{
		if (Number(mode) === 0){
				if (lang === "python"){
					const {stdout, stderr} = await execPromise(`docker run --rm `+
															   `-v ${dirname}:/usr/src/app -w /usr/src/app `+
															   `--memory="128m" --cpus="1.0" `+
																`--ulimit fsize=${25 * 1024 * 1024} --ulimit core=0 --pids-limit 20 `+
															   `python:3.10-slim python3 ${filename}`);
					return {stdout : stdout, stderr : stderr};
				}
				else if (lang === "C" || lang === "C++"){
					const compiler = lang === "C" ? "gcc" : "g++";
					const outPath = path.join(dirname, 'a.out');
					//compile and execute
					const {stdout, stderr} = await execPromise(
											`docker run --rm -v ${dirname}:/usr/src/app -w /usr/src/app `+
											`--memory="128m" --cpus="1.0" `+
											`--ulimit fsize=${25 * 1024 * 1024} --ulimit core=0 --pids-limit 20 `+
											`gcc:latest bash -c "${compiler} -Wall ${filename} -o a.out && ./a.out"`
											);
					return {stdout : stdout, stderr : stderr};
				}
		}else if (Number(mode) === 1){
			const {stdout, stderr} = await execPromise(`docker run --rm `+
									`-v ${dirname}:/usr/src/app -w /usr/src/app `+
									`--memory="128m" --cpus="1.0"`+
									`--ulimit fsize=${25 * 1024 * 1024} --ulimit core=0 --pids-limit 20 `+
									`gcc:latest make`);	
			return {stdout : stdout, stderr : stderr};
		}else{
			throw new Error(`Execution for language ${lang} is not configured.`);
		}
	}catch(err){
		throw new Error(`${err.message}, ${err.stderr}`);
	}finally{
		// remove directory
		await fs.rm(dirname, {recursive : true});
	}
}

module.exports = {execCode};
