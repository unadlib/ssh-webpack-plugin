/**
 * ssh-webpack-plugin
 * https://github.com/unadlib/ssh-webpack-plugin
 *
 * Copyright (c) 2016 unadlib.
 * Licensed under the MIT license.
 */

'use strict'
var client = require('./lib/deploy'),
    colors = require('colors');

function SshWebpackPlugin(options) {
    if(
        !options.host||
        !options.username||
        !(options.privateKey||options.password)||
        !options.to
    ){
        console.info('Please set as the follow:')
        console.info(" new".red + " SshWebpackPlugin({");
        console.info("   host: 'remote server host',".yellow);
        console.info("   port:'remote server port',".yellow);
        console.info("   username: 'remote server username',".yellow);
        console.info("   host: 'remote server host',".yellow);
        console.info("   password: 'remote server password'(or privateKey:'your private key privateKey'),".yellow);
        console.info("   from: 'local folder path that needs to be deployed',".yellow);
        console.info("   to: ' remote server deployment path',".yellow);
        console.info(" })");
        throw new Error('It is a parameters setting problem.');
    }
    this.options = options;
}

SshWebpackPlugin.prototype.apply = function (compiler) {
    var that = this;
    compiler.plugin('done',function (compilation) {
        that.deploy();
    });
}

SshWebpackPlugin.prototype.deploy = function () {
    client.deploy(this.options);
}

module.exports = SshWebpackPlugin;
