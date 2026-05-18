const os = require('os');
const path = require("path");
const fs = require('fs/promises');
const express = require('express');

async function generateFile(jobId, code, lang){
	// extension for lang
	const lang2extension = {
							"python" : "py",
							"C" : "c",
							"C++" : "cpp",
							};
	const ext = lang2extension[lang];
	if (!ext)
		throw new Error(`Invalid Language : ${lang}`);
	// async creation of new directory and writing to file
	const dirPath = path.join(os.tmpdir(), `sandbox_${jobId}`);
	const filePath = path.join(dirPath, `main.${ext}`);
	await fs.mkdir(dirPath, {recursive : true});
	await fs.writeFile(filePath, code, {mode : 0o755});
	// Return filePath
	return filePath;
}

module.exports = {generateFile};
