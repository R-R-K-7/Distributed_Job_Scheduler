const {SignJWT} = require('jose');
const {Pool} = require('pg');

const dbPool = new Pool({
    host : 'localhost',
    port : 5432,
    user : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    database : process.env.DB_NAME,
    max : 20,
    idleTimeoutMillis : 30000,
});

dbPool.connect()
    .then(()=> console.log('Connected to PostgreSQL database'))
    .catch(err => console.error('Error connecting to PostgreSQL database : ',err));

async function verifyToken(token){
    if (!token){
		return false;
	}
	try{
		const {payload} = await jose.jwtVerify(token,new TextEncoder().encode(process.env.JWT_SECRET));
		return true;
	}catch(err){
		return false;
	}
}

async function getJobs(userId){
    query = `select * from jobs where user_id = $1 order by created desc`;
    const result = await dbPool.query(query,[userId]);
    return result.rows;
}

async function insertJob(job){
    const query = `insert into jobs (id, user_id, language, mode, zip_path, created, timeout_seconds) values ($1,$2,$3,$4,$5,$6,$7)`;
    const result = await dbPool.query(query,[
        job.id,
        job.userId,
        job.lang,
        job.mode,
        job.zipPath,
        job.created,
        job.timeout
    ]);
    return result;
}

async function getJobData(jobId, attr){
    const query = `select ${attr} from jobs where id = $1`;
    const result = await dbPool.query(query,[jobId]);
    return result.rows[0];
}

async function deleteJob(jobId){
    query = `delete from jobs where id = $1`;
    const result = await dbPool.query(query,[jobId]);
    return result.rowCount === 1;
}

async function jobUpdate(attr, value){
    query = 'update jobs $1 = $2';
    const result = await dbPool.query(query,[attr,value]);
    return result.rowCount===1;
}
    

module.exports = {verifyToken, getJobs};