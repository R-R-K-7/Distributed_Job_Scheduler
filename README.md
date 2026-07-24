## Distributed Code Runner
A distributed engine allowing submission and execution of code. Allows user to sign-up/sign-in and manage on one's own submitted workloads.
### Description
#### Components
* **API Server:** Handles API calls, user authentication and accepts code payloads via HTTP
* **Redis Queue:** The server pushes job IDs into a redis queue
* **Worker Nodes:** Independent processes that pop jobs from Redis, and execute them in Docker containers and write stdout and stderr back to the database
#### Working
* Server and worker nodes are separate processes and need to run simultaneously
* Multiple worker nodes can be run at the same time to execute different payloads
### Dependencies
* Node.js & npm ```sudo apt install nodejs npm```
* PostgreSQL ```sudo apt install postgresql```
* Redis ```sudo apt install redis-server```
* Docker ```sudo apt install docker.io```
### Installation
```
git clone https://github.com/R-R-K-7/distributed-code-runner.git
cd distributed-code-runner
npm install
```
### Setting up database
Log in to CLI of PostgreSQL
```
CREATE DATABASE coderunner;
```
Exit CLI and import schema
```
psql -U <username> -d coderunner -f schema.sql
```
### Setting up .env
Create a .env file in the root of the repository folder and configure the following variables
```
JWT_SECRET='<secret string>'
DB_USER='<username in database>'
DB_PASSWORD='<password for database>'
DB_NAME='coderunner'
```
### Running
#### Ensure PostgreSQL and Redis are running
#### Starting the server
```
node api-server.js
```
#### Starting the worker
```
node worker.js
```

