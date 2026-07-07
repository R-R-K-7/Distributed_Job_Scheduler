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
        const query = `insert into jobs (id, user_id, lang, mode, zippath, created, timeout, status, name, description) 
                       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`;
        const result = await dbPool.query(query,[
            job.id,
            job.userId,
            job.lang,
            job.mode,
            job.zippath,
            job.created,
            job.timeout,
            job.status,
            job.name,
            job.description,
        ]);
        // return 1 if success -> rowCount = number of rows affected
        return result.rowCount === 1;
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        err.status = 'SYSTEM_ERROR';
        throw err;
    }
}

// Does not need a userId hence need to be used carefully
async function getJobDataWorker_S(jobId, attrs){
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
                            'name',
                            'description',
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

async function getJobData(jobId, userId, attrs){
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
                            'name',
                            'description',
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
        const query = `select ${clause} from jobs where id = $1 and user_id = $2`;
        const result = await dbPool.query(query,[jobId,userId]);
        return result.rows[0];
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        err.status = 'SYSTEM_ERROR';
        throw err;
    }
}

// Does not need a userId hence need to be used carefully
async function deleteJobWorker_S(jobId){
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

async function deleteJob(jobId,userId){
    const query = `delete from jobs where id = $1 and user_id = $2`;
    try{
        const result = await dbPool.query(query,[jobId,userId]);
        // return 1 on success, 0 on failure 
        return result.rowCount === 1;
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        err.status = 'SYSTEM_ERROR';
        throw err;
    }
}

// Does not need a userId hence need to be used carefully
async function updateJobWorker_S(jobId, attrs, values){
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

async function updateJob(jobId, userId, attrs, values){
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
        const userIdIdx = jobIdIdx + 1;
        const query = `update jobs set ${clause} where id = $${jobIdIdx} and user_id = $${userIdIdx}`;
        const result = await dbPool.query(query,[...values, jobId,userId]);
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

// S = secure (or) something that should be called with security in mind
// this returns the encrypted password
async function getUserData_S(username,email){
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

async function getUserDataById(userId){
    try{
        const query = `select username,email from users where id = $1`;
        const result = await dbPool.query(query,[userId]);
        return result.rows[0];
    }catch(err){
        err.source = ERROR_SOURCE.DATABASE;
        err.status = 'SYSTEM_ERROR';
        throw err;
    }
}


module.exports = {getJobs, insertJob, getJobData, getJobDataWorker_S, deleteJob, deleteJobWorker_S, updateJob, updateJobWorker_S, insertUser,getUserData_S,getUserDataById};