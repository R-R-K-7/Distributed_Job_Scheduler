const os = require('os');
const path = require('path');
const util = require('util');
const fs = require('fs/promises');

const {exec, spawn, fork} = require('child_process');

const execPromise = util.promisify(exec);

const fileMap = {"Python" : "main.py",
				 "C" : "main.c",
				 "C++" : "main.cpp"
				};

async function findMain(dirpath, lang){
	const items = await fs.readdir(dirpath,{withFileTypes : true});
	if (!fileMap[lang]){
		throw new Error(`Language ${lang} is not supported.`);
	}
	for (const item of items){
		if (item.isFile() && item.name === fileMap[lang]){
			return path.relative(dirpath, path.join(dirpath,item.name));
		}
		if (item.isDirectory()){
			try{
				const res = await findMain(path.join(dirpath,item.name), lang);
				if (res){
					return path.join(item.name, res);
				}
			}catch(err){
				// ignore error and continue searching
			}
		}
	}
	throw new Error(`${fileMap[lang]} for language ${lang} not found.`);
}

// spawns a process and returns the process object
async function execCode(dirname, lang, mode, timeout){
	const docker_cmd = `docker run --rm `+
					   `-v ${dirname}:/usr/src/app -w /usr/src/app `+
					   `--memory="128m" --memory-swap="128m" --cpus="1.0" `+
					   `--ulimit fsize=${25 * 1024 * 1024} --ulimit core=0 --pids-limit 20 `;
	let image = "";
	let runCmd = "";
	try{
		const filename = await findMain(dirname, lang);
		if (Number(mode) === 0){
				if (lang === "Python"){
					image = "python:3.10-slim";
					runCmd = `bash -c "timeout ${timeout}s python3 ${filename}"`;
				}
				else if (lang === "C" || lang === "C++"){
					const compiler = lang === "C" ? "gcc" : "g++";
					image = "gcc:latest";
					runCmd = `bash -c "timeout ${timeout}s ${compiler} -Wall ${filename} -o a.out && ./a.out"`;
				}else{
					throw new Error(`Execution for language ${lang} is not configured.`);
				}
		}else if (Number(mode) === 1){
				if (lang === "Python"){
					image = "python:3.10-slim";
					runCmd = `bash -c "timeout ${timeout}s python3 ${filename}"`;
				}
				else if (lang === "C" || lang === "C++"){
					image = "gcc:latest";
					runCmd = `bash -c "timeout 10s make && timeout ${timeout}s ./a.out"`;
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
		if (err.code === 124) {
            throw new Error(`Time Limit Exceeded: Process took longer than the allocated ${timeout} seconds.`);
        }
		if (err.message.startsWith('Command failed: docker')){
			console.error(`Docker Error : ${err.message}`);
			throw new Error(`Internal Server Error. Please try again later.`);
		}
		throw new Error(`${err.message}\n${err.stderr || ''}`.trim());
	}finally{
		// remove directory
		await fs.rm(dirname, {recursive : true});
	}
}

module.exports = {execCode};
