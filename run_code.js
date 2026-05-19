const os = require('os');
const path = require('path');
const util = require('util');

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
async function execCode(filePath, lang){
	const dirname = path.dirname(filePath);
	try{
		if (lang === "python"){
			const {stdout, stderr} = await execPromise(`python3 ${filePath}`);
			return {stdout : stdout, stderr : stderr};
		}
		else if (lang === "C" || lang === "C++"){
			const outPath = path.join(dirname, 'a.out');
			//compile
			await execPromise(`gcc -Wall ${filePath} -o ${outPath}`);
			// execute
			const {stdout, stderr} = await execPromise(outPath);
			return {stdout : stdout, stderr : stderr};
		}
		else{
			throw new Error(`Execution for language ${lang} is not configured.`);
		}
	}catch(err){
		throw new Error(`${err.message}, ${err.stderr}`);
	}
}

module.exports = {execCode};
