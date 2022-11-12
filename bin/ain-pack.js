#! /usr/bin/env node

// 需要找到当前执行命令的路径 拿到配置文件

const path = require('path')


const config = require(path.resolve(__dirname, '../ainpack-config.js'))

const Complier = require('../lib/Complier')

const complier = new Complier(config)
complier.hooks.entryOption.call()
// 标识运行编译

complier.run()