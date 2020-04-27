const express = require('express');
const asyncHandler = require('express-async-handler');
const cluster = require('cluster');
const fs = require('fs');
const http = require('http');
const fcalendar = require('./fcalendar');
const wait = require('wait.for-es6');
const { URL} = require('url');
const numCPUs = require('os').cpus().length;
const config = require('../config/index');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;

const logger = createLogger({
    level: 'info',
    format: combine(
        label({ label: 'server' }),
        timestamp(),
        printf(info => {
            return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
        })
    ),
    transports: [
        new transports.File({
            filename: 'log/error.log',
            level: 'error',
            timestamp: true

        }),
        new transports.File({
            filename: 'log/combined.log',
            timestamp: true
            //zippedArchive: true
        }),
        new transports.Console()
    ]
});


function log(req, vUrl){
    const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
    let msg = ip + ' ' + vUrl;
    logger.info(msg);
}
// REQUEST HANDLER (generator, sequential)
function* handler(req,res){  // function* => generator

    try {
        const vUrl = 'http://localhost:8000' + req.url;
        const oUrl = new URL(vUrl);
        let vDate = new Date();
        vDate = vDate.setDate(vDate.getDate() + 1);

        switch(oUrl.pathname){
            case "/event/": //ajax call
                try{
                    log(req, vUrl);
                    const oParams = {
                        datetime: oUrl.searchParams.get('datetime'),
                        details: oUrl.searchParams.get('details'),
                        expiration: vDate
                    };

                    let data = yield wait.for(fcalendar.ff_event, oParams);
                    return res.end ( JSON.stringify({
                        data:{
                            order: oParams,
                            content: data
                        }
                    }) );
                }catch(err){
                    logger.error(oUrl.toString() + ' ' + err.message);
                    return res.end ( JSON.stringify({
                        err:
                            {
                                order: oUrl,
                                message: err.message
                            }
                    }));
                }
            case "/ff/": //ajax call
                try{
                    log(req, vUrl);
                    const oDates = {
                        start: oUrl.searchParams.get('start'),
                        end: oUrl.searchParams.get('end')
                        //expiration: vDate
                    };

                    let data = yield wait.for(fcalendar.ff_calendar, oDates); //longAsyncFn

                    return res.end ( JSON.stringify({
                        data:{
                            order: oDates,
                            content: data
                        }
                    }) );
                } catch(err){
                    logger.error(oUrl.toString() + ' ' + err.message);
                    return res.end ( JSON.stringify({
                        err:
                            {
                                order: oUrl,
                                message: err.message
                            }
                    }));
                }
            default:
                let fileName;
                let extension;
                if(oUrl.pathname === '/'){
                    fileName = 'calendar.html';
                    extension = 'html';
                } else {
                    let oFile = oUrl.pathname.match(/[^/]*\.(\w+)$/);
                    fileName = oFile[0];
                    extension = oFile[1];
                }

                switch(extension){
                    case 'js':
                        return res.end(yield [fs.readFile, 'app/js/' + fileName, 'utf8']);
                    case 'css':
                        return res.end(yield [fs.readFile,'app/css/' + fileName,'utf8']);
                    case 'html':
                        res.writeHead(200, {'Content-Type': 'text/html'});
                        return res.end( yield [fs.readFile,'app/' + fileName,'utf8'] );
                }
                res.statusCode=404;
                return res.end ();
        }
    }
    catch(err){
        logger.error('Async ERROR catched: '+ err.message);
        res.end('Error: '+ err.message);
    }
}

//----------------
// Main
try {
    if (cluster.isMaster) {
        logger.info(`Master ${process.pid} is running`);

        // Fork workers.
        for (let i = 0; i < numCPUs; i++) {
            cluster.fork();
        }

        cluster.on('exit', (worker, code, signal) => {
            logger.warn(`worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
            logger.warn('Starting a new worker');
            cluster.fork();
        });
    } else {
        // Workers can share any TCP connection
        // In this case it is an HTTP server
        const app = express();
        app.use(helmet());
        app.use(compression());
        app.use(express.static(path.join(__dirname, "../app")));

        app.all('*', asyncHandler(async (req, res, next) => {
            wait.launchFiber(handler, req, res);
        }));

        app.use(function(err, req, res, next) {
            logger.error(err.stack);
            res.status(500).send('Something broke!');
        });

        http.createServer(app).listen(config.get('port'));
        logger.info(`Worker ${process.pid} started`);
    }
} catch (err) {
    logger.error(err.message);
}