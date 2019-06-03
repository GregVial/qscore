'use strict';

const
    fs = require('fs'),
    jwt = require('jsonwebtoken'),
    path = require('path'),
    uuid = require('uuid');

const
    config = require('./config');



function generateToken(requestParams, context, ee, next) {
    const sub = uuid.v4();

    const payload = {
        sub,
        name: `name ${sub}`,
        email: `${sub}@name.com`,
        picture_url: `http://${sub}.com`,
    };

    const token = jwt.sign(
        payload,
        config.auth.player.secret,
        {
            audience: config.auth.player.audience,
            issuer: config.auth.player.issuer,
        }
    );

    context.vars['token'] = token;
    context.vars['player'] = {
        name: `name ${sub}`,
    };

    return next();
}


function fillTokenToBody(requestParams, context, ee, next) {
    requestParams.json = requestParams.json || {};
    requestParams.json.token = context.vars['token'];

    return next();
}


function fillTokenToHeaders(requestParams, context, ee, next) {
    const bearer = context.vars['token'];

    requestParams.auth = {bearer};

    return next();
}


function fillPlayerToBody(requestParams, context, ee, next) {
    requestParams.json = requestParams.json || {};
    requestParams.json.player = context.vars['player'];

    return next();
}


function fillSubmissionTokenToHeaders(requestParams, context, ee, next) {
    const bearer = context.vars['submissionToken'];

    requestParams.auth = {bearer};

    return next();
}


function attachFile(requestParams, context, ee, next) {
    requestParams.formData = requestParams.formData || {};
    requestParams.formData.datafile = fs.createReadStream(path.join(__dirname, 'temporary.dat'));
    requestParams.formData.compression = 'gzip';

    next();
}



////////////

module.exports = {
    fillTokenToBody,
    fillTokenToHeaders,
    fillPlayerToBody,
    fillSubmissionTokenToHeaders,
    generateToken,
    attachFile,
};
