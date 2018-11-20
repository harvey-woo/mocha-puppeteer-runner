const Koa = require('koa')
const Router = require('koa-router')
const IO = require('socket.io')
const EventEmitter = require('events')
const http = require('http')
const WebpackWatchedGlobEntriesPlugin = require('webpack-watched-glob-entries-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const resolve = require('path').resolve
const Unserializer = require('./unserializer')

class Runner extends EventEmitter {
  config({ webpackConfig, input, puppeteer, puppeteerLanchOptions, puppeteerPageOptions }) {
    webpackConfig = { ... webpackConfig }
    webpackConfig.entry = (...args) => {
      let result = [resolve(__dirname, './template/common.js')]
      const s = WebpackWatchedGlobEntriesPlugin.getEntries([resolve(input)])(...args)
      for (let i in s) {
        result = result.concat(s[i])
      }
      result.push(resolve(__dirname, './template/run.js'))
      return result
    }
    webpackConfig.node = {
      fs: 'empty'
    }
    webpackConfig.target = 'web'
    webpackConfig.module.exprContextCritical = false
    webpackConfig.plugins = (webpackConfig.plugins || []).slice()
    webpackConfig.plugins.push(new WebpackWatchedGlobEntriesPlugin())
    webpackConfig.plugins.push(new HtmlWebpackPlugin({ template: resolve(__dirname, 'template/index.html') }))
    this.options = {
      webpackConfig,
      input,
      puppeteer,
      puppeteerLanchOptions,
      puppeteerPageOptions
    }
  }
  constructor(options) {
    super()
    this.unserializer = new Unserializer()
    this.config(options)
    this.puppeteer = this.options.puppeteer
    this.init()
  }
  async init() {
    this.app = new Koa()
    this.router = new Router()
    this.server = http.createServer(this.app.callback())
    this.io = IO(this.server)
    const koaWebpack = require('koa-webpack')
    const middleware = await koaWebpack({ 
      config: this.options.webpackConfig,
      devMiddleware: { logLevel: 'error' },
      hotClient: { logLevel: 'error' }
    })
    this.app.use(middleware)
    this.router.get('/', ctx => {
      ctx.response.type = 'html'
      ctx.response.body = middleware.devMiddleware.fileSystem.createReadStream(resolve(this.options.webpackConfig.output.path, 'index.html'))
    })
    this.app
      .use(this.router.routes())
      .use(this.router.allowedMethods())
    this.io.on('connection', (socket) => {
      ['start', 'end', 'suite', 'suite end','test', 'test end', 'hook', 'hook end', 'pass', 'fail', 'pending'].forEach((type) => {
        socket.on(type, (args) => {
          args.forEach(item => {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              item.slow = () => Infinity
            }
          })
          this.emit(type, ...args)
        })
      })
    })
    await this.listen()
    await this.run()
  }
  listen() {
    return new Promise((resolve) => {
      this.server.listen(() => {
        resolve()
        const { port } = this.server.address()
        this.port = port
        console.info(`Test server is listening on http://localhost:${ port }`)
      })
    })
  }
  async run() {
    const puppeteer = this.puppeteer
    const browser = this.browser = await this.puppeteer.launch({
      ...this.options.puppeteerLanchOptions
    })
    const page = this.page = await browser.newPage()
    await page.exposeFunction('__mochaEmit', (type, ...args) => {
      args = args.map(item => {
        return this.unserializer.unserialize(item, {
          classes: {
            Suite: require('mocha/lib/suite'),
            Context: require('mocha/lib/context'),
            Test: require('mocha/lib/test')
          }
        })
      })
      this.emit(type, ...args)
    })
    page.goto(`http://localhost:${this.port}`, this.options.puppeteerPageOptions)
  }
}

const puppeteer = require('puppeteer')
const fs = require('fs')
function getJson(path) {
  return JSON.parse(fs.readFileSync(resolve(path), 'utf-8'))
}

const Reporter = require('mocha/lib/reporters/spec')
const runner = new Runner({
  puppeteer,
  webpackConfig: {
    mode: 'development',
    entry: './src/index.ts',
    module: {
      rules: [
        {
          test: /\.[tj]sx?$/,
          use: {
            loader: 'babel-loader',
            options: getJson(resolve('../.babelrc'))
          },
          exclude: /node_modules/,
        }
      ]
    },
    resolve: {
      extensions: [ '.js', '.ts', '.jsx', '.tsx' ]
    },
    output: {
      publicPath: '/',
      path: resolve('dist')
    }
  },
  input: '../src/__tests__/**/*.*'
})
const reporter = new Reporter(runner)
