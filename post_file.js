const multer = require('multer');
const path = require('path');

const upload = multer({dest : path.join(__dirname, 'uploads'),
					   limits : {
							   		fileSize : 5 * 1024 * 1024, // 5 mB
							   		files : 1,
					   			},
					   fileFilter : (req, file, cb)=>{
					   		const ext = path.extname(file.originalname).toLowerCase();
							const allowedMimes = ['application/zip', 'application/zip-compressed', 'application/x-zip-compressed'];
							if (ext === '.zip' && allowedMimes.includes(file.mimetype)){
								cb(null, true);
							}else{
								cb(new Error(`Unaccepted file format. Only zip files are accepted. Received ${ext} file.`));
							}
					   }});

const uploadFile = upload.single('fileZip');

function uploadMiddleWare(req, res, next){
	uploadFile(req, res, function (err){
		if (err instanceof multer.MulterError){
			return res.status(400).json({error : `Upload Error : ${err.message}`});
		}else if (err){
			return res.status(400).json({error : `Unknown Error : ${err.message}`});
		}else if (!req.file){
			return res.status(400).json({error : `No zip file was provided`});
		}else{
			next();
		}
	});
}

module.exports = {uploadMiddleWare}
