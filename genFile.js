const os = require('os');
const path = require("path");
const fs = require('fs/promises');
const express = require('express');
const extract = require('extract-zip');
const admZip = require('adm-zip');

async function extractFile(jobId, file, lang){
	// extension for lang
	if (!['c', 'c++','python'].includes(lang.toLowerCase()))
		throw new Error(`Invalid Language : ${lang}`);

	const dirPath = path.join(os.tmpdir(), `sandbox_${jobId}`);

	// make sure that zip file when extracted doesn't exceed 10 MB of space
	const zip = new admZip(file);
	const entries = zip.getEntries();
	let totalSize = 0;
	for (const entry of entries){
		totalSize += entry.header.size;
	}
	if (totalSize > 10 * 1024 * 1024){
		throw new Error(`Uncompressed file exceeds 10MB size limit`);	
	}

	// async creation of new directory
	await fs.mkdir(dirPath, {recursive : true});

	// extract zip file
	await extract(file, dirPath);
	const items = fs.readdir(dirPath);
	if (items.length == 1){
		const singleItemPath = path.join(dirPath, items[0]);
		const stats = await fs.stat(singleItemPath);
		if (stats.isDirectory()){
			// move all items outside with dirPath as their immediate Parent
			const innerItems = await fs.readdir(singleItemPath);
			for (const item of innerItems){
				await fs.rename(path.join(singleItemPath, item),
								path.join(dirPath, item));
			}
			await fs.rmdir(singleItemPath);
		}
	}
	// Return directory Path
	return dirPath;
}

module.exports = {extractFile};
