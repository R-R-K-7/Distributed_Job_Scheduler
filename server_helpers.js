require('dotenv').config()
const {Pool} = require('pg');
const {ERROR_SOURCE, JOB_STATUS} = require('./constants.js');

const dbPool = new Pool({
    host : 'localhost',
    port : 5432,
    user : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    database : process.env.DB_NAME,
    max : 20,
    idleTimeoutMillis : 30000,
});

dbPool.connect((err,client,release)=>{
    if (err){
        console.error(`Error connecting to database`);
    }else{
        console.log('Successfully connected to database');
    }
    if (client) release();
});

async function getJobs(userId){
    try{
        const query = `select * from jobs where user_id = $1 order by created desc`;
        const result = await dbPool.query(query,[userId]);
        return result.rows;
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        err.status = 'SYSTEM_ERROR';
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
            job.zippath,
            job.created,
            job.timeout,
            job.status,
        ]);
        // return 1 if success -> rowCount = number of rows affected
        return result.rowCount === 1;
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        err.status = 'SYSTEM_ERROR';
        throw err;
    }
}

async function getJobData(jobId, attrs){
    const allowed_attrs = [
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
                            'zippath',
                        ];
    try{
        if (!Array.isArray(attrs) || attrs.length==0){
            throw new Error(`Attributes should be non-empty arrays`);
        }
        for (const attr of attrs){
            if (!allowed_attrs.includes(attr)){
                throw new Error(`Attempt to access undefined attribute "${attr}"`)
            }
        }
        const clause = attrs.map((attr,idx)=>`${attr}`).join(',');
        const query = `select ${clause} from jobs where id = $1`;
        const result = await dbPool.query(query,[jobId]);
        return result.rows[0];
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        err.status = 'SYSTEM_ERROR';
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
        err.status = 'SYSTEM_ERROR';
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
        err.status = 'SYSTEM_ERROR';
        throw err;
    }
}
    
async function insertUser(user){
    try{
        const query = `insert into users (username, password, email, created) 
                       values ($1,$2,$3,$4)`;
        const result = await dbPool.query(query,[
            user.username,
            user.password,
            user.email,
            new Date().toISOString(),
        ]);
        // return 1 if success -> rowCount = number of rows affected
        return result.rowCount === 1;
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        err.status = 'SYSTEM_ERROR';
        throw err;
    }
}

async function getUserData(username, email){
    try{
        const query = `select * from users where username = $1 or email = $2`;
        const result = await dbPool.query(query,[username,email]);
        return result.rows[0];
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        err.status = 'SYSTEM_ERROR';
        throw err;
    }
}

module.exports = {getJobs, insertJob, getJobData, deleteJob, updateJob, insertUser,getUserData};