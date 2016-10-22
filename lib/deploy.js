/**
 * Created by unadlib on 2016/10/21.
 * ssh-webpack-plugin
 * https://github.com/unadlib/ssh-webpack-plugin
 *
 * Copyright (c) 2016 unadlib.
 * Licensed under the MIT license.
 */
'use strict';
var async = require('async'),
    ssh = require('ssh2'),
    colors = require('colors'),
    extend = require('extend'),
    childProcessExec = require('child_process').exec,
    sftp = require('scp2'),
    path = require('path');

function getSftpOptions(options) {
    var sftpOptions = {
        port: options.port,
        host: options.host,
        username: options.username,
        readyTimeout: options.readyTimeout
    };
    if (options.privateKey) {
        sftpOptions.privateKey = options.privateKey;
        if (options.passphrase) sftpOptions.passphrase = options.passphrase;
        return sftpOptions;
    }
    else if (options.password) {
        sftpOptions.password = options.password;
    }else {
        throw new Error('Password or privateKey is not selected one.');
    }
    return sftpOptions;
}

function execDeploy(options, connection) {
    var startTime = new Date(),
        task = {
            zipLocal:function (callback) {
                if (!options.zip) return callback();
                childProcessExec('tar --version', function (error, stdout, stderr) {
                    if (!error) {
                        var isGnuTar = stdout.match(/GNU tar/);
                        var command = "tar -czvf ./deploy.tgz";
                        if(options.exclude.length) {
                            options.exclude.forEach(function(exclusion) {
                                command += ' --exclude=' + exclusion;
                            });
                        }
                        if (isGnuTar) {
                            command += " --exclude=deploy.tgz --ignore-failed-read --directory=" + options.from + " .";
                        } else {
                            command += " --directory=" + options.from + " .";
                        }
                        console.info('Zipping Deploy Command:'.yellow);
                        console.info(' > '+command);
                        execLocal(command, options.debug, callback);
                    }
                });
            },
            beforeDeploy:function (callback) {
                execRemote('before',callback);
            },
            cleanRemoteOld:function (callback) {
                if(!options.to||options.cover===true) return callback();
                var command = "cd "+options.to+" && rm -fr *";
                console.info('Clean Remote OldFiles: '.yellow);
                console.info(' > ' + command);
                execCommad(command,options.debug,callback);
            },
            uploadDeploy:function (callback) {
                var build = (options.zip) ? 'deploy.tgz' : options.from;
                console.info('Uploading Deploy Files: '.yellow);
                console.info('upload file from local path: ' + build + ' to remote path: ' + options.to);
                var sftpOptions = getSftpOptions(options);
                sftpOptions.path = options.to;
                sftp.scp(build, sftpOptions, function (err) {
                    if (err) {
                        console.info(err);
                    } else {
                        console.info('done uploading.');
                        callback();
                    }
                });
            },
            unzipRemote:function (callback) {
                if (!options.zip) return callback();
                var goToCurrent = "cd " + options.to,
                    unTar = "tar -xzvf deploy.tgz",
                    cleanDeploy = "rm " + path.posix.join(options.to, "deploy.tgz"),
                    command = [goToCurrent,unTar,cleanDeploy].join(' && ');
                console.info('Unzip Zipfile: '.yellow);
                console.info(' > ' + command);
                execCommad(command, options.debug, callback);
            },
            afterDeploy:function (callback) {
                execRemote('after',callback);
            },
            deleteLocalZip:function (callback) {
                if (!options.zip) return callback();
                var command = 'rm deploy.tgz';
                console.info('Local cleanup: '.yellow);
                console.info(' > ' + command);
                execLocal(command, options.debug ,callback);
            },
            closeConnection:function (callback) {
                connection.end();
                sftp.close();
                sftp.__sftp = null;
                sftp.__ssh = null;
                callback();
            }
        };
    function execRemote(type,callback) {
        if (typeof options[type] === "undefined") return callback();
        var command = options[type];
        console.info((type.replace(/^./,function(i){return i.toUpperCase()})+" Deploy Running Remote Commands: ").yellow);
        if (command instanceof Array) {
            async.eachSeries(command, function(command, callback) {
                console.info(' > ' + command);
                execCommad(command, options.debug, callback);
            }, callback);
        } else {
            console.info(' > ' + command);
            execCommad(command, options.debug, callback);
        }
    };
    function execCommad(cmd, debug, next){
        connection.exec(cmd, function(err, stream) {
            if (err) {
                console.info(err);
                console.info('Error Deploy: '.red+'closing connection.');
                task.closeConnection();
            }
            stream.on('data', function(data, extended) {
                debug && console.info((extended === 'stderr' ? 'stderr: ' : 'stdout: ') + data);
            });
            stream.on('end', function() {
                if(!err) {
                    next();
                }
            });
        });
    };
    function execLocal(cmd,debug, next) {
        var execOptions = {
            maxBuffer: options.max_buffer
        };
        childProcessExec(cmd, execOptions, function(err, stdout, stderr){
            debug && console.info('stdout: ' + stdout);
            debug && console.info('stderr: ' + stderr);
            if (err !== null) {
                console.info('Exec Error: '.red + err);
                console.info('Error deploying. Closing connection.'.red);
            } else {
                next();
            }
        });
    };
    async.series([
        task.zipLocal,
        task.beforeDeploy,
        task.cleanRemoteOld,
        task.uploadDeploy,
        task.unzipRemote,
        task.afterDeploy,
        task.deleteLocalZip,
        task.closeConnection
    ], function () {
        console.info('Deployed: '.blue + (+new Date()-startTime)+'ms');
    });
}

exports.deploy = function(options) {
    var Client = ssh.Client,
        connection = new Client();
    options = extend({},{
        zip:true,
        port: 22,
        from: 'build',
        debug:false,
        max_buffer: 200 * 1024,
        readyTimeout: 20000,
        cover: true,
        exclude: []
    },options);
    connection
        .on('connect',
        function () {
            console.info("[ Start Deploy ]".green);
            console.info("Connecting: ".yellow + options.host);
        })
        .on('ready',
        function () {
            console.info('Connected: '.yellow + options.host);
            execDeploy(options, connection);
        })
        .on('error',
        function (err) {
            console.info("Error: ".red + options.host);
            console.info(err);
            if (err) {
                throw err;
            }
        })
        .on('close',
        function () {
            console.info("Closed: ".yellow + options.host);
            return true;
        })
    .connect(options);

};