const {jwtVerify} = require('jose');
const {Pool} = require('pg');
const {ERROR_SOURCE} = require('./constants.js');

const dbPool = new Pool({
    host : 'localhost',
    port : 5432,
    user : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    database : process.env.DB_NAME,
    max : 20,
    idleTimeoutMillis : 30000,
});

dbPool.query('SELECT NOW()')
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
    try{
        const query = `select * from jobs where user_id = $1 order by created desc`;
        const result = await dbPool.query(query,[userId]);
        return result.rows;
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        throw err;
    }
}

async function insertJob(job){
    try{
        const query = `insert into jobs (id, user_id, lang, mode, zippath, created, timeout, status) 
                       values ($1,$2,$3,$4,$5,$6,$7,$8)`;
        const result = await dbPool.query(query,[
            job.id,
            job.userId,
            job.lang,
            job.mode,
            job.zipPath,
            job.created,
            job.timeout,
            job.status,
        ]);
        // return 1 if success -> rowCount = number of rows affected
        return result.rowCount === 1;
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        throw err;
    }
}

async function getJobData(jobId, attr='status'){
    const allowed_attr = [
                            'id',
                            'user_id',
                            'lang',
                            'mode',
                            'created',
                            'timeout',
                            'completed',
                            'status', 
                            'stdout', 
                            'stderr', 
                        ];
    try{
        if (!allowed_attr.includes(attr)){
            throw new Error(`Invalid attribute requested`);
        }
        const query = `select ${attr} from jobs where id = $1`;
        const result = await dbPool.query(query,[jobId]);
        return result.rows[0];
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        throw err;
    }
}

async function deleteJob(jobId){
    const query = `delete from jobs where id = $1`;
    try{
        const result = await dbPool.query(query,[jobId]);
        // return 1 on success, 0 on failure 
        return result.rowCount === 1;
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        throw err;
    }
}

async function updateJob(jobId, attrs, values){
    const allowed_attrs = ['status', 'stdout', 'stderr', 'completed'];
    try{
        if (!Array.isArray(attrs) || !Array.isArray(values) || !(attrs.length == values.length)){
            throw new Error(`Attributes and values should be equal length arrays`);
        }
        if (attrs.length==0){
            return 1;
        }
        for (const attr of attrs){
            if (!allowed_attrs.includes(attr)){
                throw new Error(`Attempt to update unauthorized attribute "${attr}"`)
            }
        }
        const clause = attrs.map((attr,idx)=>`${attr} = $${idx+1}`).join(',');
        const jobIdIdx = attrs.length + 1;
        const query = `update jobs set ${clause} where id = $${jobIdIdx}`;
        const result = await dbPool.query(query,[...values, jobId]);
        // returns 1 on success,  0 on failure
        return result.rowCount===1;
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        throw err;
    }
}
    

module.exports = {verifyToken, getJobs, insertJob, getJobData, deleteJob, updateJob};