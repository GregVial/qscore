'use strict';

const
    Promise = require('bluebird'),
    Busboy = require('busboy'),
    zlib = require('zlib');

const
    config = require('../../config');



class HttpError extends Error {

    constructor(message, code) {
        super(message);

        this.code = code;
    }


    sendError(res) {
        return res.status(this.code).send(this.message);
    }


    static build(res) {
        switch (res.statusCode) {
            case 400: {
                return new BadRequestError(res.body);
            }

            case 401: {
                return new AuthenticationError(res.body);
            }

            case 403: {
                return new AccessDeniedError(res.body);
            }

            case 404: {
                return new ResourceNotFoundError(res.body);
            }

            case 409: {
                return new ConflictError(res.body);
            }

            case 429: {
                return new TooManyRequestsError(res.body);
            }

            case 500: {
                return new HttpError(res.body, 500);
            }

            case 502: {
                return new HttpError(res.body, 502);
            }

            default: {
                return new HttpError(res.message, res.statusCode);
            }
        }
    }
}



class BadRequestError extends HttpError {
    constructor(message) {
        super(message, 400);
    }
}



class AuthenticationError extends HttpError {

    constructor(message) {
        super(message, 401);
    }
}



class AccessDeniedError extends HttpError {

    constructor(message) {
        super(message, 403);
    }
}



class ResourceNotFoundError extends HttpError {

    constructor(message) {
        super(message, 404);
    }
}


class ConflictError extends HttpError {

    constructor(message) {
        super(message, 409);
    }
}


class TooManyRequestsError extends HttpError {

    constructor(message, remainingTime) {
        super(message, 429);

        this.remainingTime = remainingTime;
    }


    sendError(res) {
        res.set('x-rate-limit-remaining', this.remainingTime);

        return super.sendError(res);
    }
}



class FileError extends Error {
    constructor(message) {
        super(`Cannot retrieve file: ${message}`);
    }
}



function decorate(method) {
    return function newMethod() {
        const next = arguments[2];

        method
            .apply(this, arguments)
            .catch((err) => {
                err.serverMessage = `${this.constructor.name}.${method.name}: ${err.message}`;
                return next(err);
            })
        ;
    };
}



class Controller {

    constructor(methodNames) {
        let names;
        if (methodNames) {
            names = methodNames;
        }
        else {
            const publicMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(this));
            names = publicMethods.filter((name) =>
                !name.startsWith('_') &&
                !name.startsWith('can') && // Add middleware methods
                name !== 'constructor' &&
                this[name] instanceof Function
            );
        }

        names.forEach((name) => {
            this[name] = decorate(this[name]).bind(this);
        });
    }


    sendData(res, data) {
        return res.status(200).json(data);
    }


    sendDataCreated(res, data) {
        return res.status(201).json(data);
    }


    sendNoData(res) {
        return res.status(204).send();
    }


    readFile(req) {
        return new Promise((resolve, reject) => {
            try {
                const busboy = new Busboy({
                    headers: req.headers,
                    limits: {
                        fileSize: config.submissions.maxSize,
                    },
                });
                busboy.on('error', (err) => reject(new FileError(err.message)));

                const fields = {};
                busboy.on('field', (fieldname, val) => {
                    fields[fieldname] = val;
                });

                let fileBuffer;
                let fileStarted = false;
                busboy.on('file', (fieldname, file) => {
                    if (fieldname !== 'datafile') {
                        return reject(new FileError('Only fieldname \'datafile\' is allowed'));
                    }

                    if (fileStarted) {
                        return reject(new FileError('Only 1 file is allowed'));
                    }
                    fileStarted = true;

                    const buffers = [];
                    file
                        .on('error', (err) => reject(new FileError(err.message)))
                        .on('limit', () => {
                            req.unpipe(busboy);

                            return reject(new FileError('File too large'));
                        })
                        .on('data', (buffer) => {
                            buffers.push(buffer);
                        })
                        .on('end', () => {
                            fileBuffer = Buffer.concat(buffers);
                        })
                    ;
                });

                busboy.on('finish', () => resolve([fileBuffer, fields]));

                req.pipe(busboy);
            }
            catch (err) {
                return reject(new FileError(err.message));
            }
        })
            .tap((vals) => {
                const fileBuffer = vals[0];

                if (!fileBuffer) {
                    throw new FileError('No file found');
                }

                if (fileBuffer.length <= 0) {
                    throw new FileError('File is empty');
                }
            })
            .spread((fileBuffer, fields) => {
                switch (fields.compression) {
                    case 'gzip': {
                        return gunzip(fileBuffer)
                            .then((fileBufferUnzipped) => [fileBufferUnzipped, fields]);
                    }

                    default: {
                        return [fileBuffer, fields];
                    }
                }
            })
        ;


        ////////////

        function gunzip(src) {
            return new Promise((resolve, reject) => {
                zlib.gunzip(src, (err, dst) => {
                    if (err) {
                        return reject(new FileError(err.message));
                    }

                    return resolve(dst);
                });
            });
        }
    }
}



////////////

module.exports = {
    Controller,
    HttpError,
    AccessDeniedError,
    AuthenticationError,
    BadRequestError,
    ResourceNotFoundError,
    ConflictError,
    TooManyRequestsError,
    FileError,
};
