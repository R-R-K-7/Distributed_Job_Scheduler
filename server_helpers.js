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
    const query = `select * from jobs where user_id = $1 order by created desc`;
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

async function getJobData(jobId, attr='*'){
    const allowed_attr = ['status', 'stdout', 'stderr', 'completed','*',];
    if (!allowed_attr.includes(attr)){
        console.error(`Unauthorized operation`);
        throw new Error(`Invalid attribute requested`);
    }
    try{
        const query = `select ${attr} from jobs where id = $1`;
        const result = await dbPool.query(query,[jobId]);
        return result.rows[0];
    }catch(err){
        console.error(`Database error finding attribute : ${attr}, jobId : ${jobId} : ${err}`);
        return null;
    }
}

async function deleteJob(jobId){
    const query = `delete from jobs where id = $1`;
    const result = await dbPool.query(query,[jobId]);
    if (result.rowCount === 1){
        return;
    }else{
        throw new Error(`Database Error : Cannot delete jobId ${jobId} from database`);
    }
}

async function updateJob(jobId, attrs, values){
    if (!Array.isArray(attrs) || !Array.isArray(values) || !(attrs.length == values.length)){
        throw new Error(`Attributes and values should be equal length arrays`);
    }
    if (attrs.length==0){
        return true;
    }
    const allowed_attrs = ['status', 'stdout', 'stderr', 'completed'];
    for (const attr of attrs){
        if (!allowed_attr.includes(attr)){
            throw new Error(`Attempt to update unauthorized attribute "${attr}"`)
        }
    }
    try{
        const clause = attrs.map((attr,idx)=>`attr = $${idx+1}`).join(',');
        const jobIdIdx = attrs.length + 1;
        const query = `update jobs set ${clause} where id = $${jobIdIdx}`;
        const result = await dbPool.query(query,[...value, jobId]);
        return result.rowCount===1;
    }catch(err){
        throw new Error(`Database Error : Failed to update "${attrs}" | ${err}`);
    }
}
    

module.exports = {verifyToken, getJobs, getJobData, deleteJob, updateJob};