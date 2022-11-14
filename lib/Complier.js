const path = require('path')
const fs = require('fs')
const babylon = require('babylon')
const traverse = require('@babel/traverse').default
const t = require('@babel/types')
const generator = require('@babel/generator').default
const ejs = require('ejs')
const mkdirp = require('mkdirp')
const { transformFromAst } = require('@babel/core')
const { SyncHook } = require('tapable')
class Complier {
  constructor(config) {
    this.config = config
    // 需要保存入口文件的路径
    this.entryId;
    // 保存所有的模块依赖
    this.modules = {}
    this.entry = config.entry // 入口路径
    // 工作路径
    this.root = process.cwd()

    this.hooks = {
      entryOption: new SyncHook(),
      complie: new SyncHook(),
      afterComplie: new SyncHook(),
      afterPlugins: new SyncHook(),
      run: new SyncHook(),
      emit: new SyncHook(),
      done: new SyncHook()
    }

    let plugins = this.config.plugins

    if (Array.isArray(plugins)) {
      plugins.forEach(plugin => {
        plugin.apply(this)
      })
    }
    this.hooks.afterPlugins.call()
  }

  getSource(modulePath) {
    let content = fs.readFileSync(modulePath, 'utf-8')
    let rules = this.config.modules && this.config.modules.rules
    if (rules && Array.isArray(rules)) {
      // for (let i = 0; i < rules.length; i++) {
      //   let rule = rules[i]
      // }
      rules.forEach(rule => {
        const { test, use } = rule
        let len = rules.length - 1
        if (test.test(modulePath)) { // 这个模块需要loader转换
          // 获取对应的loader函数
          function normalLoader() {
            let loader = require(use[len--])
            content = loader(content)
            if (len >= 0) {
              normalLoader()
            }
          }
          normalLoader()
          // let loader = require(use[len])
        }
      })

    }
    return content
  }

  parse(source, parentPath) { // ast解析语法树
    let ast = babylon.parse(source, {
      sourceType: "module"
    })
    let dependencies = []
    traverse(ast, {
      CallExpression(p) {
        let node = p.node
        if (node.callee.name === 'require') {
          // node.callee.name = '__webpack_require___';
          let moduleName = node.arguments[0].value // 取到的就是模块引用名字
          moduleName = moduleName + (path.extname(moduleName) ? '' : '.js')
          moduleName =  './' + path.join(parentPath, moduleName)
          dependencies.push(moduleName.replace(/\\/g, '\/'))
          // node.arguments = [t.stringLiteral(moduleName)]
        }
      },
      ImportDeclaration({ node }) {
        // 文件路径
        let relativePath = node.source.value
        relativePath = relativePath + (path.extname(relativePath) ? '' : '.js')
        relativePath =  './' + path.join(parentPath, relativePath)
        // console.log(relativePath)
        // 基于入口文件的绝对路径
        // let absolutePath = path.resolve(dirnamePath, relativePath)
        // absolutePath = absolutePath + (path.extname(absolutePath) ? '' : '.js')
        // console.log(absolutePath)
        dependencies.push(relativePath.replace(/\\/g, '\/'))
      }
    })
    const sourceCode = transformFromAst(ast, null, {
      presets: ['@babel/preset-env']
    }).code
    return {
      sourceCode,
      dependencies
    }
  }

  // 构建模块
  buildModule(modulePath, isEntry) {
    //拿到模块内容
    const source = this.getSource(modulePath)
    // 模块id
    const moduleName = './' + path.relative(this.root, modulePath).replace(/\\/g, '/')
    console.log(moduleName, 'moduleName1')
    // console.log(source, moduleName)
    if (isEntry) {
      // 保存入口的名字
      this.entryId = moduleName
    }
    // 解析  需要把source源码进行改造  返回一个依赖列表
    const { sourceCode, dependencies } = this.parse(source, path.dirname(moduleName))
    // 把相对路径和模块中的内容 对应起来
    // console.log(sourceCode, dependencies, 'dependencies')
    console.log(moduleName, 'moduleName2')
    this.modules[moduleName] = {
      sourceCode,
      dependencies
    }
    console.log(moduleName, this.modules, 'moduleName2')
    dependencies.forEach(dep => {
      this.buildModule(path.join(this.root, dep), false)
    })
  }

  // 用数据渲染模板
  emitFile() {
    // 输出到那个目录下
    // eval(depsGraph(module).sourceCode); 
    // 
    const bundle = `
      (function (depsGraph) {
        function require(module) {
          // 定义模块内部的require
          function localRequire(relativePath) {
            return require(depsGraph(module).dependencies[relativePath])
          }
          var exports  = {}
          (function (require, exports, code){
            eval(code)
          })(localRequire, exports, depsGraph(module).sourceCode)

          return exports
        }
        require(${this.entryId})
      })(${this.modules})
    `
    console.log(bundle, 'bundle')
    // const main = path.join(this.config.output.path, this.config.output.filename)
    // const templateStr = this.getSource(path.join(__dirname, './main.ejs'))
    // const code =ejs.render(templateStr, {
    //   entryId: this.entryId,
    //   modules: this.modules
    // })
    // this.assets = {}
    // this.assets[main] = code
    // mkdirp(path.dirname(main), err => {
    //   if (err) return 
    //   fs.writeFileSync(main, this.assets[main])
    // })
  }

  run() {
    this.hooks.run.call()
    this.hooks.complie.call()
    // 执行创建模块的依赖关系
    this.buildModule(path.resolve(this.root, this.entry), true)
    this.hooks.afterComplie.call()
    // console.log(this.modules)
    // 发射一个文件 打包后的文件
    this.emitFile()
    this.hooks.emit.call()
    this.hooks.done.call()
  }
}

module.exports = Complier