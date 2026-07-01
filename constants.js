// To define various constants used across all files

const JOB_STATUS = Object.freeze({
    QUEUED: 'QUEUED',
    RUNNING: 'RUNNING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    TERMINATED: 'TERMINATED',
    KILLED: 'KILLED'
});

const ERROR_SOURCE = Object.freeze({
    EXTRACTION: 'Error during extraction files from zip file',
    EXECUTION: 'Error during execution of code',
    DATABASE: 'Database Error'
});

const SYSTEM_LIMITS = Object.freeze({
    MAX_MEMORY_MB: 128,
    DEFAULT_TIMEOUT_SEC: 5
});

module.exports = {
    JOB_STATUS,
    ERROR_SOURCE,
    SYSTEM_LIMITS
};