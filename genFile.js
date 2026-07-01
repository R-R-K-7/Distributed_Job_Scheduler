const os = require('os');
const path = require("path");
const fs = require('fs/promises');
const express = require('express');
const extract = require('extract-zip');
const admZip = require('adm-zip');
const {ERROR_SOURCE} = require('./constants.js');

async function extractFile(jobId, zipPath, lang){
	try{
		// extension for lang
		if (!['c', 'c++','python'].includes(lang.toLowerCase()))
			throw new Error(`Invalid Language : ${lang}`);

		const dirPath = path.join(os.tmpdir(), `sandbox_${jobId}`);

		// make sure that zip file when extracted doesn't exceed 10 MB of space
		const zip = new admZip(zipPath);
		const entries = zip.getEntries();
		let totalSize = 0;
		for (const entry of entries){
			totalSize += entry.header.size;
		}
		// throw an error if file size limit is exceeded
		if (totalSize > 10 * 1024 * 1024){
			const err = new Error(`Project size limit exceeded : ${totalSize}/${10*1024*1024}`);
			err.status = 'TERMINATED';
			throw err;	
		}

		// async creation of new directory
		await fs.mkdir(dirPath, {recursive : true});

		// extract zip file
		await extract(zipPath, {dir : dirPath});
		// Return directory Path
		return dirPath;
	}catch(err){
		if (!err.status){
			err.status = 'FAILED';
		}
		err.source = ERROR_SOURCE.EXTRACTION;
		throw err;
	}
}

module.exports = {extractFile};
